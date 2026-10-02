# 固定の時間枠ごとの試行回数。加算と期限切れの掃除はRateLimiterから行う。
class RateLimitCounter < ApplicationRecord
  scope :expired, ->(now = Time.current) { where(expires_at: ...now) }
end
