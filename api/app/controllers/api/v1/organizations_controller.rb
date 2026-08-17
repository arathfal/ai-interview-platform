# frozen_string_literal: true

module Api
  module V1
    class OrganizationsController < ApiController
      skip_before_action :require_tenant!

      # GET /api/v1/organizations
      #
      # F-03 phase 2: public minimal listing (id + name + scheme) so the signup
      # page can render the organization dropdown. Public because signup must
      # work before authentication. Deliberately excludes config/host/alias
      # hosts — nothing beyond what the dropdown needs.
      def index
        organizations = Organization.order(:name).select(:id, :name, :scheme)
        json_response(organizations: organizations.as_json)
      end
    end
  end
end