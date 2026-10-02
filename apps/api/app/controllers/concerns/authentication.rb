# CookieStoreのsessionから認証済みの利用者を得る（TASK-001 Plan §51）。
#
# - 期限は認証成功から7日の絶対期限。利用では延長せず、Cookieの有効期限に任せずserverで検証する。
# - 所有者の根拠は`current_user`だけにする。clientが送るuser IDやlocalStorageの値を使わない。
#
# 保護するactionでは`before_action :authenticate_user!`を使う。
module Authentication
  extend ActiveSupport::Concern

  SESSION_LIFETIME = 7.days
  # Cookieの有効期限は認証の期限より1日長くする。Railsの暗号化Cookieは有効期限を中に持ち、過ぎると
  # 読めなくなるため、同じ時刻にすると「期限切れ（session_expired）」と「未login」を区別できない。
  # 期限の判定はserverのSESSION_LIFETIMEで行うので、この1日にCookieで利用できることはない。
  COOKIE_GRACE_PERIOD = 1.day
  AUTHENTICATED_AT_KEY = "fod.authenticated_at".freeze
  GOOGLE_REAUTHENTICATED_AT_KEY = "fod.google_reauthenticated_at".freeze
  # Google専用の利用者の再認証を「直近」とみなす時間（TASK-006 Plan §12-3）
  GOOGLE_REAUTHENTICATION_WINDOW = 5.minutes

  included do
    after_action :keep_cookie_expiry
  end

  private

  attr_reader :current_user

  # 未loginは`401 unauthenticated`、7日を過ぎたら`401 session_expired`。
  # メール未確認・ロック中の利用者はsessionから復元した時点でWardenが外し、`401 unauthenticated`になる。
  def authenticate_user!
    user = session_user
    return render_problem(:unauthenticated) unless user
    return expire_session if session_expired?

    @current_user = user
  end

  # 有効なsessionの利用者。期限切れならsessionを破棄してnilを返す。
  def authenticated_user_or_nil
    user = session_user
    return user if user && !session_expired?

    end_session if user
    nil
  end

  # login成功時。認証前のsessionを引き継がず、7日の起点をここで決める。
  def start_session(user)
    reset_session
    sign_in(:user, user)
    session[AUTHENTICATED_AT_KEY] = Time.current.to_i
  end

  def end_session
    sign_out(:user)
    reset_session
  end

  def session_expires_at
    authenticated_at = session[AUTHENTICATED_AT_KEY]
    Time.zone.at(authenticated_at) + SESSION_LIFETIME if authenticated_at.is_a?(Integer)
  end

  def record_google_reauthentication = session[GOOGLE_REAUTHENTICATED_AT_KEY] = Time.current.to_i

  # 退会前の再認証が直近か。TASK-013の退会で使う。
  def recently_reauthenticated_with_google?
    reauthenticated_at = session[GOOGLE_REAUTHENTICATED_AT_KEY]
    reauthenticated_at.is_a?(Integer) &&
      Time.zone.at(reauthenticated_at) >= GOOGLE_REAUTHENTICATION_WINDOW.ago
  end

  # params認証などのstrategyを走らせず、sessionだけから利用者を復元する。
  def session_user = warden.user(:user)

  def session_expired?
    expires_at = session_expires_at
    expires_at.nil? || expires_at <= Time.current
  end

  def expire_session
    end_session
    render_problem(:session_expired)
  end

  # sessionを書き直すたびに、Cookieの有効期限を認証の時刻から決める（利用では延長しない）。
  def keep_cookie_expiry
    expires_at = session_expires_at
    return unless expires_at

    request.session_options[:expire_after] = [(expires_at + COOKIE_GRACE_PERIOD - Time.current).ceil, 0].max
  end
end
