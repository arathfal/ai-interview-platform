# frozen_string_literal: true

require 'rails_helper'

# F-03: login must be tenant-explicit. Without the X-Tenant-Scheme header the
# backend used to fall back to `SELECT scheme FROM organizations LIMIT 1`
# (non-deterministic) — silently routing the user into an arbitrary tenant.
RSpec.describe 'Authentication API (F-03)', type: :request do
  let(:org_a) do
    Organization.create!(
      name: 'Tenant A',
      scheme: 'tenant-a',
      identifier: 'tenant-a',
      host: 'tenant-a.test.local'
    )
  end

  let(:org_b) do
    Organization.create!(
      name: 'Tenant B',
      scheme: 'tenant-b',
      identifier: 'tenant-b',
      host: 'tenant-b.test.local'
    )
  end

  let!(:admin) do
    User.create!(email: 'assessor@test.corp', password: 'Password123!', role: 'admin')
  end

  def login(headers: {}, params: {})
    post '/api/v1/auth/login',
         params: { email: 'assessor@test.corp', password: 'Password123!' }.merge(params).to_json,
         headers: { 'Content-Type' => 'application/json' }.merge(headers)
  end

  describe 'AC#1 — header X-Tenant-Scheme is required' do
    it 'rejects login without the header (401 Tenant scheme is required)' do
      login(headers: { 'Content-Type' => 'application/json' })

      expect(response).to have_http_status(:unauthorized)
      body = JSON.parse(response.body)
      expect(body['errors'][0]['message']).to eq('Tenant scheme is required')
      expect(body['token']).to be_nil
    end

    it 'rejects a blank header value the same way' do
      login(headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => '  ' })

      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)['errors'][0]['message']).to eq('Tenant scheme is required')
    end
  end

  describe 'AC#2 — unknown scheme is rejected' do
    it 'rejects an unknown scheme (401 Unknown tenant scheme)' do
      org_a && org_b # ensure DB has organizations — proves lookup is explicit, not LIMIT 1
      login(headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => 'nope-xyz' })

      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)['errors'][0]['message']).to eq('Unknown tenant scheme')
    end
  end

  describe 'AC#3 — valid scheme + valid credentials' do
    it 'returns a token whose scheme claim matches the requested tenant' do
      org_b
      login(headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => org_b.scheme })

      expect(response).to have_http_status(:ok)
      token = JSON.parse(response.body)['token']
      claims = JsonWebToken.decode_without_verification(token)
      expect(claims[:scheme]).to eq('tenant-b')
    end

    it 'scopes by the header — a user cannot obtain a token for tenant A by omitting the header' do
      org_a && org_b
      login(headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => org_b.scheme })

      claims = JsonWebToken.decode_without_verification(JSON.parse(response.body)['token'])
      expect(claims[:scheme]).to eq('tenant-b')
      expect(claims[:scheme]).not_to eq('tenant-a')
    end

    it 'matches scheme case-insensitively but returns the canonical organization scheme' do
      org_b
      login(headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => 'TENANT-B' })

      expect(response).to have_http_status(:ok)
      claims = JsonWebToken.decode_without_verification(JSON.parse(response.body)['token'])
      expect(claims[:scheme]).to eq('tenant-b')
    end
  end

  describe 'AC#4 — wrong credentials keep the existing 401 behavior' do
    it 'still returns Invalid email or password with a valid header' do
      org_b
      login(
        headers: { 'Content-Type' => 'application/json', 'X-Tenant-Scheme' => org_b.scheme },
        params: { password: 'WrongPassword1' }
      )

      expect(response).to have_http_status(:unauthorized)
      expect(JSON.parse(response.body)['errors'][0]['message']).to eq('Invalid email or password')
    end
  end
end