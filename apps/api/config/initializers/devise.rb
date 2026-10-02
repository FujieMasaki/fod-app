# Deviseはpassword hash・確認/再設定/解除tokenとその期限を担う。HTTPの入口（JSON・Problem・共通応答）は
# app/controllers/api/v1/ の各controllerが持ち、Deviseのcontrollerとrouteは使わない。
# 値の根拠はTASK-001 Plan §52・§56、TASK-006 Plan §12。
Devise.setup do |config|
  require "devise/orm/active_record"

  config.mailer = "UserMailer"
  # productionでは既定値を使わない（未設定ならメールを作れず、jobが失敗して気づける）。
  config.mailer_sender = ENV.fetch("MAILER_FROM") { "no-reply@localhost" unless Rails.env.production? }
  config.case_insensitive_keys = [:email]
  config.strip_whitespace_keys = [:email]
  # 応答で登録の有無を区別しない（API側でも同じstatus/bodyに揃える）。
  config.paranoid = true
  config.stretches = Rails.env.test? ? 1 : 12

  # 登録・再設定のpassword。文字種は強制しない（TASK-006 Plan §12-5）。
  config.password_length = 8..128
  config.email_regexp = /\A[^@\s]+@[^@\s]+\z/

  # 確認メールは24時間。確認前のloginは許可しない。
  config.confirm_within = 24.hours
  config.allow_unconfirmed_access_for = 0.days
  config.reconfirmable = false

  # 再設定は6時間。成功してもloginしない（Webはログイン画面へ戻す）。
  config.reset_password_within = 6.hours
  config.sign_in_after_reset_password = false

  # passwordの不一致が10回続いたらロックし、解除メールを送る。1時間で自動でも解ける。
  config.lock_strategy = :failed_attempts
  config.unlock_keys = [:email]
  config.unlock_strategy = :both
  config.maximum_attempts = 10
  config.unlock_in = 1.hour

  # Wardenが認証を投げ返したとき（ロック中のsessionなど）は、契約どおりのProblemを返す。
  # 再読込されるclassなので、呼ばれた時点で定数を引く。
  config.warden do |manager|
    manager.failure_app = ->(env) { AuthenticationFailureApp.call(env) }
  end
end
