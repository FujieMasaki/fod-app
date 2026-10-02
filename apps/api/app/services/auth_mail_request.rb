# 確認メールの再送とpassword再設定メールの要求。どちらも登録の有無にかかわらず同じ結果
# （`:accepted`）にし、IPごとの制限だけを`:rate_limited`にする（契約のresendConfirmation・
# requestPasswordReset）。
class AuthMailRequest
  def initialize(email:, ip:)
    @email = email
    @ip = ip
    @throttle = AuthMailThrottle.new(ip:)
  end

  def resend_confirmation
    accept do |user|
      user.resend_confirmation_instructions if user && !user.confirmed?
    end
  end

  # Google専用の利用者には再設定tokenを発行せず、Googleでのログインを案内する。
  # reset経由でGoogle専用の利用者にpasswordを足させないため（TASK-001 Plan §53）。
  def request_password_reset
    accept do |user|
      next unless user

      if user.password_user?
        user.send_reset_password_instructions
      else
        user.send_google_sign_in_guide
      end
    end
  end

  private

  def accept
    exceeded = @throttle.ip_limit_exceeded
    return AuthResult.rate_limited(exceeded) if exceeded

    # 宛先の制限は、該当する利用者がいるかどうかにかかわらず同じように数える。
    @throttle.deliver(@email) { yield User.find_for_authentication(email: @email) }
    AuthResult.of(:accepted)
  end
end
