# 認証まわりのメール（登録の確認・既登録の案内・確認の再送・password再設定・ロック解除）の送信制限。
#
# - 送信元IPごと: 1時間20回（TASK-001 Plan §56）。超えたら呼び出し側が429にする。
# - 送信元IPと宛先の組ごと: 60秒に1回・1時間5回（同 §56の宛先の制限を、IPと宛先の組で数える）。
# - 宛先ごと（全IPの合計）: 1時間20回。メール爆撃から宛先を守る上限。
#
# 宛先だけで数えると、第三者が1時間5回要求し続けるだけで本人宛てのメールを止められたため、
# IPと宛先の組で数えるようにした（TASK-006 Plan §12-7）。宛先の制限は登録の有無・確認済みか・
# Google専用かを問わず同じ経路で数え、掛かっても応答を変えない（呼び出し側は同じ202を返す）。
class AuthMailThrottle
  BY_IP = RateLimiter.new(name: "auth_mail_ip", limit: 20, period: 1.hour)
  BY_SENDER_AND_DESTINATION = [
    RateLimiter.new(name: "auth_mail_sender_destination_short", limit: 1, period: 60.seconds),
    RateLimiter.new(name: "auth_mail_sender_destination_long", limit: 5, period: 1.hour)
  ].freeze
  BY_DESTINATION = RateLimiter.new(name: "auth_mail_destination", limit: 20, period: 1.hour)

  # ipがnilのとき（ロック解除メールなど、利用者のrequestから直接送らないもの）は、送信元を1つとして数える。
  def initialize(ip:)
    @ip = ip
  end

  # IPごとの制限を1回数える。上限を超えたらRateLimiter::Resultを、超えなければnilを返す。
  def ip_limit_exceeded
    result = BY_IP.hit(@ip)
    result unless result.allowed?
  end

  # 制限内なら送る（ブロックを実行する）。宛先の正規化はDeviseの登録時と同じにする。
  def deliver(email)
    destination = email.to_s.strip.downcase
    sender_and_destination = "#{@ip}|#{destination}"
    return unless BY_SENDER_AND_DESTINATION.all? { |limiter| limiter.hit(sender_and_destination).allowed? }
    return unless BY_DESTINATION.hit(destination).allowed?

    yield
  end
end
