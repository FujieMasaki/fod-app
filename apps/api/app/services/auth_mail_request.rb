# 確認メールの再送とpassword再設定メールの要求（requestの側）。どちらも登録の有無にかかわらず同じ結果
# （`:accepted`）にし、IPごとの制限だけを`:rate_limited`にする（契約のresendConfirmation・
# requestPasswordReset）。
#
# 利用者を探すところからAuthMailJobへ渡し、requestの中では登録の有無で処理を変えない。
# 利用者がいるときだけtoken生成やメール送信の時間がかかると、応答時間から登録の有無が分かるため。
class AuthMailRequest
  def initialize(email:, ip:)
    @email = email
    @ip = ip
    @throttle = AuthMailThrottle.new(ip:)
  end

  def resend_confirmation = accept(:resend_confirmation)

  def request_password_reset = accept(:request_password_reset)

  private

  def accept(kind)
    exceeded = @throttle.ip_limit_exceeded
    return AuthResult.rate_limited(exceeded) if exceeded

    # 宛先の制限は、該当する利用者がいるかどうかにかかわらず同じように数える。
    @throttle.deliver(@email) { AuthMailJob.perform_later(kind.to_s, @email) }
    AuthResult.of(:accepted)
  end
end
