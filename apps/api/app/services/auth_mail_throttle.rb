# 認証まわりのメール（登録の確認・既登録の案内・確認の再送・password再設定）の送信制限。
# 値はTASK-001 Plan §56: 確認/再設定を合算して宛先ごと60秒に1回・1時間5回、IPごと1時間20回。
#
# 宛先の制限は登録の有無・確認済みか・Google専用かを問わず同じ経路で数え、掛かっても応答を変えない
# （呼び出し側は同じ202を返す）。IPの制限だけを呼び出し側が429にする。
class AuthMailThrottle
  BY_IP = RateLimiter.new(name: "auth_mail_ip", limit: 20, period: 1.hour)
  BY_DESTINATION = [
    RateLimiter.new(name: "auth_mail_destination_short", limit: 1, period: 60.seconds),
    RateLimiter.new(name: "auth_mail_destination_long", limit: 5, period: 1.hour)
  ].freeze

  def initialize(ip:)
    @ip = ip
  end

  # IPごとの制限を1回数える。上限を超えたらRateLimiter::Resultを、超えなければnilを返す。
  def ip_limit_exceeded
    result = BY_IP.hit(@ip)
    result unless result.allowed?
  end

  # 宛先ごとの制限内なら送る（ブロックを実行する）。宛先の正規化はDeviseの登録時と同じにする。
  def deliver(email)
    destination = email.to_s.strip.downcase
    yield if BY_DESTINATION.all? { |limiter| limiter.hit(destination).allowed? }
  end
end
