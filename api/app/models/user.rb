# frozen_string_literal: true

class User < ApplicationRecord
  has_secure_password

  ROLES = %w[admin user].freeze

  # F-03 phase 2: ownership relation — every user belongs to exactly one
  # organization. Login derives the tenant scheme from this association, so
  # tenancy is verified by data, not by anything typed at the login form.
  belongs_to :organization, foreign_key: :tenant_id

  validates :email, presence: true,
                    uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :role, inclusion: { in: ROLES }

  before_save :downcase_email

  private

  def downcase_email
    self.email = email.downcase
  end
end