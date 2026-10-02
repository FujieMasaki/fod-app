# メールアドレスとpasswordでの登録。登録済みかどうかにかかわらず同じ結果（`:accepted`）にし、
# 未登録なら確認メールを、登録済みならログインと再設定を案内するメールを送る（契約のcreateRegistration）。
class UserRegistration
  def initialize(email:, password:, ip:)
    @email = email
    @password = password
    @ip = ip
    @throttle = AuthMailThrottle.new(ip:)
  end

  def call
    user = User.new(email: @email, password: @password)
    return AuthResult.validation_failed(user.errors) unless valid_except_taken?(user)

    exceeded = @throttle.ip_limit_exceeded
    return AuthResult.rate_limited(exceeded) if exceeded

    existing = User.find_for_authentication(email: @email)
    existing ? notify_existing(existing) : create(user)
    AuthResult.of(:accepted)
  end

  private

  # emailの重複（taken）だけは入力の誤りとして返さない。登録の有無を明かさないため。
  def valid_except_taken?(user)
    user.valid?
    user.errors.delete(:email, :taken)
    user.errors.empty?
  end

  def create(user)
    user.skip_confirmation_notification!
    user.save!
    @throttle.deliver(user.email) { user.send_confirmation_instructions }
  rescue ActiveRecord::RecordNotUnique
    # 同じメールアドレスの登録が同時に届いた。先に作られた方を既登録として扱う。
    existing = User.find_for_authentication(email: @email)
    notify_existing(existing) if existing
  end

  def notify_existing(user)
    @throttle.deliver(user.email) { user.send_already_registered_notice }
  end
end
