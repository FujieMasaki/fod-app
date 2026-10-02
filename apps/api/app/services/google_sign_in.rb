# Googleの認証結果（OmniAuthが検証済みのauth hash）から利用者を決める。
#
# - 利用者はprovider/uid（Googleのsub）で対応付け、emailだけでは既存の利用者へ接続しない（TASK-001 Plan §53）。
# - 新規作成は、Googleが確認済みとしたメールだけ。確認済みとして作る（TASK-006 Plan §12-2）。
# - Googleが確認済みとしたメールがpasswordの利用者と一致したら`:email_conflict`（統合も重複作成もしない）。
class GoogleSignIn
  PROVIDER = User::GOOGLE_PROVIDER
  # 再認証で、Googleで実際に認証した時刻（auth_time）をどこまで新しいとみなすか（TASK-006 Plan §12-3）
  AUTH_TIME_WINDOW = 5.minutes

  def initialize(auth, now: Time.current)
    @auth = auth
    @now = now
  end

  def sign_in
    identity = find_identity
    return AuthResult.of(:ok, user: identity.user) if identity
    return AuthResult.of(:failed) unless verified_email

    existing = User.find_for_authentication(email: verified_email)
    return AuthResult.of(existing.password_user? ? :email_conflict : :failed) if existing

    AuthResult.of(:ok, user: create_user)
  rescue ActiveRecord::RecordNotUnique
    # 同じGoogleの利用者のcallbackが同時に届いた。先に作られた方へloginする。
    identity = find_identity
    identity ? AuthResult.of(:ok, user: identity.user) : AuthResult.of(:failed)
  end

  # Googleが返した利用者が、いまloginしている利用者に紐づくGoogleの利用者と一致することを必ず確かめる。
  # 盗まれたsessionに別のGoogle利用者で再認証を通し、退会まで進められないようにするため。
  def reauthenticate(current_user)
    return AuthResult.of(:failed) unless recently_authenticated_at_google?
    return AuthResult.of(:mismatch) unless current_user.google_identity&.uid == uid

    AuthResult.of(:ok, user: current_user)
  end

  private

  def uid = @auth["uid"].to_s

  def find_identity
    return if uid.empty?

    UserIdentity.includes(:user).find_by(provider: PROVIDER, uid:)
  end

  def verified_email
    raw_info = @auth.dig("extra", "raw_info") || {}
    email = raw_info["email"]
    email if email.present? && [true, "true"].include?(raw_info["email_verified"])
  end

  def create_user
    User.transaction do
      User.create!(email: verified_email, confirmed_at: @now,
                   identities: [UserIdentity.new(provider: PROVIDER, uid:)])
    end
  end

  # max_age=0で要求したとき、GoogleはID tokenにauth_time（実際に認証した時刻）を入れる。
  def recently_authenticated_at_google?
    auth_time = @auth.dig("extra", "id_info", "auth_time")
    return false unless auth_time.is_a?(Integer)

    Time.zone.at(auth_time) >= @now - AUTH_TIME_WINDOW
  end
end
