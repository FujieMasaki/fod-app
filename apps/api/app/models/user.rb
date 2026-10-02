# 利用者。内部のUUIDが所有権の正本で、emailやGoogleのIDを所有者の根拠にしない（TASK-001 Plan §45）。
# Google専用の利用者はpasswordを持たない（encrypted_passwordがnull）。
class User < ApplicationRecord
  GOOGLE_PROVIDER = "google_oauth2".freeze

  devise :database_authenticatable, :registerable, :confirmable, :recoverable, :lockable

  has_many :identities, class_name: "UserIdentity", dependent: :delete_all, inverse_of: :user

  validates :email, presence: true, length: { maximum: 254 },
                    format: { with: Devise.email_regexp, allow_blank: true },
                    uniqueness: { case_sensitive: false }
  validates :password, presence: true, if: :password_required?
  validates :password, length: { within: Devise.password_length }, allow_nil: true

  def password_user? = encrypted_password.present?

  def google_identity = identities.find { |identity| identity.provider == GOOGLE_PROVIDER }

  def sign_in_methods
    methods = []
    methods << "password" if password_user?
    methods << "google" if google_identity
    methods
  end

  # bcryptは先頭72 byteだけで照合するため、passwordをSHA-256にかけてからbcryptへ渡す
  # （TASK-006 Plan §12-6）。8〜128文字の全文を照合に使う。保存と照合の両方で同じ変換をする。
  def valid_password?(password)
    return false unless password.is_a?(String)

    super(self.class.prehash_password(password))
  end

  def self.prehash_password(password) = Base64.strict_encode64(OpenSSL::Digest::SHA256.digest(password))

  # 登録済みのメールアドレスに登録が届いたときの、ログインと再設定の案内。
  def send_already_registered_notice = send_devise_notification(:already_registered)

  # Google専用の利用者に再設定が求められたときの、Googleでのログインの案内。
  def send_google_sign_in_guide = send_devise_notification(:google_sign_in_guide)

  protected

  # メールはrequestの外（AuthMailDeliveryJob）で配送する。配送の時間や失敗で応答が変わり、
  # 登録の有無やロックの有無が分かるのを防ぐため。
  def send_devise_notification(notification, *)
    devise_mailer.send(notification, self, *).deliver_later
  end

  # valid_password?と同じ変換をしてから保存する。
  def password_digest(password) = super(self.class.prehash_password(password))

  private

  # Google専用で作る利用者だけはpasswordなしで作れる。
  def password_required? = new_record? && identities.empty?
end
