# 確認メールの再送とpassword再設定メールの送信（jobの側）。AuthMailJobから呼ばれ、
# 利用者を探して、該当する場合だけメールを送る。
class AuthMailDelivery
  def initialize(email:)
    @user = User.find_for_authentication(email:)
  end

  def resend_confirmation
    @user.resend_confirmation_instructions if @user && !@user.confirmed?
  end

  # Google専用の利用者には再設定tokenを発行せず、Googleでのログインを案内する。
  # reset経由でGoogle専用の利用者にpasswordを足させないため（TASK-001 Plan §53）。
  def request_password_reset
    return unless @user

    if @user.password_user?
      @user.send_reset_password_instructions
    else
      @user.send_google_sign_in_guide
    end
  end
end
