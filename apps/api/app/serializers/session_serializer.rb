# 契約のSession（SessionAuthenticated / SessionAnonymous）。
# account_statusは、退会の状態をTASK-013で足すまで常に`active`。
class SessionSerializer
  def initialize(user:, csrf_token:, expires_at:)
    @user = user
    @csrf_token = csrf_token
    @expires_at = expires_at
  end

  def as_json(*)
    return { authenticated: false, csrf_token: @csrf_token } unless @user

    {
      authenticated: true,
      csrf_token: @csrf_token,
      expires_at: @expires_at.utc.iso8601,
      user: user_json,
      account_status: "active"
    }
  end

  private

  def user_json
    { id: @user.id, email: @user.email, email_confirmed: @user.confirmed?, sign_in_methods: @user.sign_in_methods }
  end
end
