# frozen_string_literal: true

require 'rails_helper'

RSpec.describe Portfolios::Generator do
  # F-08: AI output validation — confidence normalization + best-effort partial
  # save so a single odd LLM field cannot sink the whole portfolio generation.
  let(:org) do
    Organization.create!(
      name: 'Portfolio Gen Corp',
      scheme: 'portfolio-gen-test',
      identifier: 'portfolio-gen-test',
      host: 'portfolio-gen.test.local'
    )
  end

  let(:assessment) do
    Assessment.create!(
      name: 'React Developer',
      tenant_id: org.id,
      created_by: 1,
      time_limit_min: 30
    )
  end

  let(:session) do
    Session.create!(
      assessment_id: assessment.id,
      tenant_id: org.id,
      candidate_id: 'cand-pgen',
      candidate_name: 'Candidate PG',
      status: 'ended'
    )
  end

  let(:gemini_client) { double('Gemini::HttpClient') }

  let(:generator) do
    described_class.new(session: session, gemini_client: gemini_client)
  end

  def run_generator!(payload)
    allow(gemini_client).to receive(:generate_content).and_return(payload)
    Current.using(tenant_id: org.id) { generator.call }
  end

  def in_tenant(&block)
    Current.using(tenant_id: org.id, &block)
  end

  def skill(label, confidence: 'high', summary: 'Competency summary')
    {
      'skill_id'           => label.downcase.gsub(/\s+/, '-'),
      'skill_label'        => label,
      'level'              => 3,
      'confidence'         => confidence,
      'evidence'           => ['quote 1', 'quote 2'],
      'competency_summary' => summary
    }
  end

  describe '#call' do
    context 'normal flow (all skills valid)' do
      it 'saves configured and discovered skills and marks portfolio complete' do
        portfolio = run_generator!(
          'configured_skills' => [skill('React'), skill('Rails')],
          'discovered_skills' => [skill('GraphQL')]
        )

        in_tenant do
          expect(portfolio.generation_status).to eq('complete')
          expect(portfolio.portfolio_skills.count).to eq(3)
          expect(portfolio.portfolio_skills.pluck(:ai_level)).to all(be_between(1, 5))
        end
      end
    end

    context 'confidence normalization (F-08)' do
      it 'maps casing, verbose, blank, and unknown values onto the enum' do
        portfolio = run_generator!(
          'configured_skills' => [
            skill('Skill A', confidence: 'HIGH'),
            skill('Skill B', confidence: 'high confidence'),
            skill('Skill C', confidence: nil),
            skill('Skill D', confidence: 'low'),
            skill('Skill E', confidence: 'banana')
          ],
          'discovered_skills' => []
        )

        in_tenant do
          expect(portfolio.generation_status).to eq('complete')
          confidences = portfolio.portfolio_skills.order(:id).pluck(:ai_confidence)
          expect(confidences).to eq(%w[high high medium low medium])
        end
      end

      it 'keeps the model enum enforcement intact for invalid values' do
        expect do
          in_tenant do
            portfolio = run_generator!(
              'configured_skills' => [skill('Skill X')],
              'discovered_skills' => []
            )
            portfolio.portfolio_skills.create!(ai_confidence: 'OUTLIER')
          end
        end.to raise_error(ActiveRecord::RecordInvalid)
      end
    end

    context 'one invalid skill (F-08 partial save)' do
      it 'saves the valid skills, marks portfolio partial, and records the error' do
        portfolio = run_generator!(
          'configured_skills' => [
            skill('React'),
            skill('Rails'),
            skill('Broken', confidence: 'high', summary: nil)
          ],
          'discovered_skills' => []
        )

        in_tenant do
          expect(portfolio.generation_status).to eq('partial')
          expect(portfolio.portfolio_skills.count).to eq(2)
          expect(portfolio.portfolio_skills.pluck(:skill_label)).to contain_exactly('React', 'Rails')
          expect(portfolio.generation_error).to include('Broken')
          expect(portfolio.generation_error).to include('1')
        end
      end
    end

    context 'all skills invalid (F-08)' do
      it 'marks portfolio failed — not a fake partial' do
        portfolio = run_generator!(
          'configured_skills' => [
            skill('Broken A', summary: nil),
            skill('Broken B', summary: nil)
          ],
          'discovered_skills' => []
        )

        in_tenant do
          expect(portfolio.generation_status).to eq('failed')
          expect(portfolio.portfolio_skills.count).to eq(0)
          expect(portfolio.generation_error).to include('All skills failed to save')
        end
      end
    end

    context 'unparseable AI payload' do
      it 'falls back to failed via the outer rescue' do
        expect do
          run_generator!('not valid json')
        end.to raise_error(JSON::ParserError)

        in_tenant do
          expect(session.portfolio.reload.generation_status).to eq('failed')
        end
      end
    end
  end
end
