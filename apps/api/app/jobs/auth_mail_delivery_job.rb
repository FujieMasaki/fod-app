# UserMailerのメールをrequestの外で配送する。引数（Userと、確認・再設定・解除のtoken）をログへ出さない。
class AuthMailDeliveryJob < ActionMailer::MailDeliveryJob
  self.log_arguments = false
  # 引数（メールアドレス・確認・再設定・解除のtoken）をDBのqueue（Solid Queue）に保存しないよう、Solid Queueに
  # 載せない（設定は`config.x.auth_mail_queue_adapter`。開発・本番は`:async`。testは全体のtest adapterに任せる）。
  self.queue_adapter = Rails.configuration.x.auth_mail_queue_adapter if Rails.configuration.x.auth_mail_queue_adapter
end
