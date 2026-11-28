# 確認メールの再送・password再設定メールを、requestの外で送る（AuthMailRequestの説明を参照）。
class AuthMailJob < ApplicationJob
  KINDS = %w[resend_confirmation request_password_reset].freeze

  # 引数のメールアドレスをログへ出さない。
  self.log_arguments = false
  # 引数（メールアドレス・確認・再設定・解除のtoken）をDBのqueue（Solid Queue）に保存しないよう、Solid Queueに
  # 載せない（設定は`config.x.auth_mail_queue_adapter`。開発・本番は`:async`。testは全体のtest adapterに任せる）。
  self.queue_adapter = Rails.configuration.x.auth_mail_queue_adapter if Rails.configuration.x.auth_mail_queue_adapter

  def perform(kind, email)
    raise ArgumentError, "unknown kind: #{kind}" unless KINDS.include?(kind)

    AuthMailDelivery.new(email:).public_send(kind)
  end
end
