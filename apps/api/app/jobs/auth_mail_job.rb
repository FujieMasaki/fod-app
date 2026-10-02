# 確認メールの再送・password再設定メールを、requestの外で送る（AuthMailRequestの説明を参照）。
class AuthMailJob < ApplicationJob
  KINDS = %w[resend_confirmation request_password_reset].freeze

  # 引数のメールアドレスをログへ出さない。
  self.log_arguments = false

  def perform(kind, email)
    raise ArgumentError, "unknown kind: #{kind}" unless KINDS.include?(kind)

    AuthMailDelivery.new(email:).public_send(kind)
  end
end
