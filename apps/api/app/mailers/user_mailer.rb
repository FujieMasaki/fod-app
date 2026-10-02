# 認証まわりのメール。リンクはSPAの画面を指し、tokenはURLのfragment（`#token=`）に載せる。
# fragmentはbrowserがserverへ送らないため、access log・Referrerにtokenが残りにくい（TASK-001 Plan §52）。
class UserMailer < Devise::Mailer
  TEMPLATE_PATH = "user_mailer".freeze

  self.delivery_job = AuthMailDeliveryJob

  def confirmation_instructions(record, token, opts = {})
    @url = app_url("/confirmation", token)
    super(record, token, mail_options(opts, "メールアドレスの確認"))
  end

  def reset_password_instructions(record, token, opts = {})
    @url = app_url("/password/reset", token)
    super(record, token, mail_options(opts, "パスワードの再設定"))
  end

  def unlock_instructions(record, token, opts = {})
    @url = app_url("/unlock", token)
    super(record, token, mail_options(opts, "アカウントのロックについて"))
  end

  def already_registered(record, opts = {})
    @login_url = app_url("/login")
    @password_reset_url = app_url("/password/forgot")
    devise_mail(record, :already_registered, mail_options(opts, "登録済みのメールアドレスです"))
  end

  def google_sign_in_guide(record, opts = {})
    @login_url = app_url("/login")
    devise_mail(record, :google_sign_in_guide, mail_options(opts, "Googleでログインしてください"))
  end

  private

  # Devise同梱のHTMLテンプレート（Deviseのrouteを前提にする）を使わず、このmailerのテキストだけを使う。
  def mail_options(opts, subject) = opts.merge(template_path: TEMPLATE_PATH, subject: "Focus on Dot: #{subject}")

  def app_url(path, token = nil)
    base = Rails.configuration.x.app_base_url.presence || raise("APP_BASE_URL is not configured")
    url = "#{base.delete_suffix('/')}#{path}"
    token ? "#{url}#token=#{CGI.escape(token)}" : url
  end
end
