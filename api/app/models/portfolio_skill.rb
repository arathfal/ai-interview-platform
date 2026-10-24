# frozen_string_literal: true

class PortfolioSkill < ApplicationRecord
  include TenantScoped

  CONFIDENCE_LEVELS = %w[high medium low].freeze

  belongs_to :portfolio
  has_one :assessor_override, dependent: :destroy

  validates :skill_label, presence: true
  validates :ai_level, numericality: { only_integer: true, in: 1..5 }
  validates :ai_confidence, inclusion: { in: CONFIDENCE_LEVELS }
  validates :competency_summary, presence: true

  after_commit :invalidate_fit_gap_reports

  # evidence is stored as JSONB array of quote strings
  def evidence_quotes
    Array(evidence)
  end

  private

  def invalidate_fit_gap_reports
    tenant_id = Portfolio.unscoped.where(id: portfolio_id).pick(:tenant_id)
    return unless tenant_id

    FitGap::RegenerationCoordinator.invalidate_portfolio!(portfolio_id:, tenant_id:)
  end
end
