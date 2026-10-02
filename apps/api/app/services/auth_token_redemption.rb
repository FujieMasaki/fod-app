# メールのリンクで届くtoken（確認・password再設定・ロック解除）を使う。いずれも1回だけ成功し、
# 成功してもloginはしない（Webはログイン画面へ戻す）。
class AuthTokenRedemption
  def initialize(token:)
    @token = token
  end

  # 確認tokenは24時間。確認済み（使用済み）のtokenは`:token_invalid`。
  def confirm_email
    user = User.confirm_by_token(@token)
    return AuthResult.of(:ok) if user.errors.empty?
    return AuthResult.of(:token_expired) if user.errors.of_kind?(:email, :confirmation_period_expired)

    AuthResult.of(:token_invalid)
  end

  # 再設定tokenは6時間。同時に届いた2つのrequestのうち1つだけが成功するよう、行lockで直列にする。
  # passwordが方針に合わなければtokenを消費しない。成功したらロックも解く。
  def reset_password(password)
    # 空のtokenのdigestはnilになり、tokenを持たない利用者に一致してしまうため先に弾く。
    return AuthResult.of(:token_invalid) if @token.blank?

    User.transaction do
      user = User.lock.find_by(reset_password_token: digest(:reset_password_token))
      next AuthResult.of(:token_invalid) unless user&.password_user?
      next AuthResult.of(:token_expired) unless user.reset_password_period_valid?

      apply_new_password(user, password)
    end
  end

  # 解除tokenに期限はない（期限より先に1時間でロックが自動で解けるため）。
  def unlock_account
    user = User.unlock_access_by_token(@token)
    user.errors.empty? ? AuthResult.of(:ok) : AuthResult.of(:token_invalid)
  end

  private

  # 保存するとDeviseが再設定tokenを消す（再利用を拒否できる）。
  # 再設定のメールを受け取れたことでメールの所有は示されたので、未確認なら確認済みにする
  # （TASK-006 Plan §12-6。他人に登録だけされたメールを、本人が再設定だけで取り戻せるようにする）。
  def apply_new_password(user, password)
    user.password = password
    user.skip_confirmation! unless user.confirmed?
    return AuthResult.validation_failed(user.errors) unless user.save

    user.unlock_access! if user.access_locked?
    AuthResult.of(:ok)
  end

  def digest(column) = Devise.token_generator.digest(User, column, @token)
end
