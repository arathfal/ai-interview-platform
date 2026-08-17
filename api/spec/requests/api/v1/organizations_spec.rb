# frozen_string_literal: true

require 'rails_helper'

# F-03 phase 2 AC#6: public minimal organization listing that feeds the signup
# dropdown — id + name + scheme only, nothing sensitive (no config/hosts).
RSpec.describe 'Organizations listing (F-03 phase 2)', type: :request do
  before do
    Organization.create!(
      name: 'Tenant A',
      scheme: 'tenant-a',
      identifier: 'tenant-a',
      host: 'tenant-a.test.local',
      alias_hosts: ['alt-a.test.local', 'alt-a2.test.local'],
      config: { 'billing' => 'secret' }
    )
    Organization.create!(
      name: 'Tenant B',
      scheme: 'tenant-b',
      identifier: 'tenant-b',
      host: 'tenant-b.test.local'
    )
  end

  it 'returns id + name + scheme for every organization' do
    get '/api/v1/organizations'

    expect(response).to have_http_status(:ok)
    organizations = JSON.parse(response.body)['organizations']

    expect(organizations.map { |o| o['scheme'] }).to contain_exactly('tenant-a', 'tenant-b')
    expect(organizations.map { |o| o['name'] }).to contain_exactly('Tenant A', 'Tenant B')
    expect(organizations.map { |o| o['id'] }).to all(be_a(Integer))
  end

  it 'exposes no sensitive/extra fields (no config, alias_hosts, host)' do
    get '/api/v1/organizations'

    organization = JSON.parse(response.body)['organizations'].first
    expect(organization.keys).to contain_exactly('id', 'name', 'scheme')
  end

  it 'is public — works without any auth/token header (pre-auth signup flow)' do
    get '/api/v1/organizations'

    expect(response).to have_http_status(:ok)
  end
end