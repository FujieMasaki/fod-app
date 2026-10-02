# UserMailerのメールをrequestの外で配送する。引数（Userと、確認・再設定・解除のtoken）をログへ出さない。
class AuthMailDeliveryJob < ActionMailer::MailDeliveryJob
  self.log_arguments = false
end
