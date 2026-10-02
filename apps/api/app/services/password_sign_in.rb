# メールアドレスとpasswordでのlogin。登録の有無・ロックの有無を応答から区別させない。
#
# - passwordの不一致はDeviseのLockableが数え、10回でロックして解除メールを送る。
# - ロック中はpasswordが一致しても`:invalid_credentials`にする（契約のcreateSession）。
# - 失敗がIPごとに1時間50回を超えたら`:rate_limited`（多数のアカウントへ順に試す攻撃への備え）。
class PasswordSignIn
  FAILURES_BY_IP = RateLimiter.new(name: "login_failure_ip", limit: 50, period: 1.hour)

  def initialize(email:, password:, ip:)
    @email = email
    @password = password
    @ip = ip
  end

  def call
    limit = FAILURES_BY_IP.check(@ip)
    return AuthResult.rate_limited(limit) unless limit.allowed?

    user = User.find_for_authentication(email: @email)
    return authenticated(user) if password_matches?(user)

    FAILURES_BY_IP.hit(@ip)
    AuthResult.of(:invalid_credentials)
  end

  private

  def password_matches?(user)
    unless user&.password_user?
      # 該当する利用者がいなくても同じだけhashを計算し、応答時間の差を小さくする。
      User.new(password: @password)
      return false
    end

    user.valid_for_authentication? { user.valid_password?(@password) }
  end

  def authenticated(user)
    return AuthResult.of(:ok, user:) if user.active_for_authentication?
    return AuthResult.of(:email_unconfirmed) if user.inactive_message == :unconfirmed

    AuthResult.of(:invalid_credentials)
  end
end
