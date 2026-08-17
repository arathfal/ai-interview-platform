# frozen_string_literal: true

module Api
  module V1
    class AuthenticationController < ApiController
      skip_before_action :require_tenant!

      # POST /api/v1/auth/login
      #
      # F-03 phase 2 (decision evolution A → D): tenancy is derived from the
      # account's organization relation — the login is clean (email + password),
      # and any X-Tenant-Scheme header is ignored (a user can never claim a
      # tenant that is not their own via input). A user without an assigned
      # organization is rejected explicitly instead of being silently routed.
      def authenticate
        user = User.find_by(email: params[:email].to_s.downcase)

        return json_error('Invalid email or password', :unauthorized) unless user&.authenticate(params[:password])

        return json_error('Invalid email or password', :unauthorized) unless user.role == 'admin'

        organization = user.organization
        return json_error('Account is not assigned to an organization', :unauthorized) if organization.nil?

        token = JsonWebToken.encode({ user_id: user.id, role: user.role, scheme: organization.scheme })

        json_response({ token:, user: { id: user.id, email: user.email, role: user.role } })
      end

      # POST /api/v1/auth/signup
      #
      # F-03 phase 2: activates signup with an organization picked from the
      # public GET /api/v1/organizations listing. The user is created already
      # assigned to the chosen org, so the first login is tenant-implicit.
      #
      # Signup always creates an 'admin' account: this platform has a single
      # authenticated user type (assessor-capable). The 'user' role has no
      # flow (login requires 'admin', every protected page requires assessor
      # permissions, candidates use invite tokens without accounts) — an
      # account created with role 'user' can log in nowhere and is a trap.
      def signup
        if params[:organization_id].blank?
          return json_error('Organization is required', :unprocessable_entity)
        end

        organization = Organization.find_by(id: params[:organization_id])
        return json_error('Organization not found', :unprocessable_entity) if organization.nil?

        user = User.new(
          email: params[:email].to_s.downcase,
          password: params[:password],
          role: 'admin',
          organization:
        )

        if user.save
          token = JsonWebToken.encode({ user_id: user.id, role: user.role, scheme: organization.scheme })
          json_response({ token:, user: { id: user.id, email: user.email, role: user.role } }, :created)
        else
          json_error(user.errors.full_messages.first, :unprocessable_entity)
        end
      end
    end
  end
end