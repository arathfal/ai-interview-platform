# frozen_string_literal: true

module Api
  module V1
    class AuthenticationController < ApiController
      skip_before_action :require_tenant!

      # POST /api/v1/auth/login
      def authenticate
        user = User.find_by(email: params[:email].to_s.downcase)

        return json_error('Invalid email or password', :unauthorized) unless user&.authenticate(params[:password])

        return json_error('Invalid email or password', :unauthorized) unless user.role == 'admin'

        scheme = resolve_scheme
        return if scheme.blank? # json_error sudah di-render oleh resolve_scheme

        token = JsonWebToken.encode({ user_id: user.id, role: user.role, scheme: })

        json_response({ token:, user: { id: user.id, email: user.email, role: user.role } })
      end

      private

      # F-03: tenant must be explicit at login. The X-Tenant-Scheme header is
      # REQUIRED — no silent fallback to `SELECT ... LIMIT 1` (non-deterministic).
      # The scheme must match an existing organization, otherwise we refuse.
      # Returns nil after rendering a 401 error; caller must stop.
      def resolve_scheme
        scheme = request.headers['X-Tenant-Scheme'].to_s.strip.downcase

        if scheme.blank?
          json_error('Tenant scheme is required', :unauthorized)
          return nil
        end

        organization = Organization.where('lower(scheme) = ?', scheme).first
        if organization.nil?
          json_error('Unknown tenant scheme', :unauthorized)
          return nil
        end

        organization.scheme
      end
    end
  end
end