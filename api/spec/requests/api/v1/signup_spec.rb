# frozen_string_literal: true

require 'rails_helper'

# F-03 phase 2 AC#6: signup is activated with an organization picked from the
# public GET /api/v1/organizations listing — the account is created already
# assigned to a tenant (first login is tenant-implicit).
RSpec.describe 'Auth signup (F-03 phase 2)', type: :request do
  let(:org) do
    Organization.create!(
      name: 'Tenant A',
      scheme: 'tenant-a',
      identifier: 'tenant-a',
      host: 'tenant-a.test.local'
    )
  end

  def signup(params: {}, headers: {})
    defaults = {
      email: 'new@test.corp',
      password: 'Password123!',
      role: 'admin',
      organization_id: org.id
    }
    post '/api/v1/auth/signup',
         params: defaults.merge(params).to_json,
         headers: { 'Content-Type' => 'application/json' }.merge(headers)
  end

  it 'creates a user assigned to the chosen organization and returns a token with its scheme' do
    signup

    expect(response).to have_http_status(:created)
    body = JSON.parse(response.body)
    expect(body['user']['email']).to eq('new@test.corp')

    created = User.find_by!(email: 'new@test.corp')
    expect(created.tenant_id).to eq(org.id)
    expect(created.role).to eq('admin')

    claims = JsonWebToken.decode_without_verification(body['token'])
    expect(claims[:scheme]).to eq('tenant-a')
  end

  it 'rejects an unknown organization with 422' do
    signup(params: { organization_id: 999_999 })

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body)['errors'][0]['message']).to eq('Organization not found')
    expect(User.find_by(email: 'new@test.corp')).to be_nil
  end

  it 'rejects a missing organization_id with 422' do
    signup(params: { organization_id: nil })

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body)['errors'][0]['message']).to eq('Organization is required')
  end

  it 'rejects a duplicate email with 422' do
    User.create!(email: 'new@test.corp', password: 'Password123!', role: 'user', organization: org)

    signup

    expect(response).to have_http_status(:unprocessable_entity)
    expect(JSON.parse(response.body)['errors'][0]['message']).to match(/Email/)
    expect(User.where(email: 'new@test.corp').count).to eq(1)
  end

  it 'ignores a role param — signup always creates an admin account' do
    signup(params: { role: 'user' })

    expect(response).to have_http_status(:created)
    expect(User.find_by!(email: 'new@test.corp').role).to eq('admin')
    # regression: an account created via signup must be login-capable
    post '/api/v1/auth/login',
         params: { email: 'new@test.corp', password: 'Password123!' }.to_json,
         headers: { 'Content-Type' => 'application/json' }
    expect(response).to have_http_status(:ok)
  end

  it 'works without any auth header (public, pre-auth endpoint)' do
    signup(headers: {})

    expect(response).to have_http_status(:created)
  end
end