# 外部の文字起こし・生成の費用がかかる操作の回数の制限（契約のRateLimited。具体値はTASK-009で決めた）。
# 利用者ごとに1時間で数える。日々の記録として十分に多く、自動化された大量の送信だけを止める値にする。
module GenerationThrottle
  LIMITERS = {
    recording_attempt: RateLimiter.new(name: "generation_recording_attempt_user", limit: 60, period: 1.hour),
    upload: RateLimiter.new(name: "generation_upload_user", limit: 60, period: 1.hour),
    retry: RateLimiter.new(name: "generation_retry_user", limit: 30, period: 1.hour)
  }.freeze

  module_function

  # 1回分を数え、制限を超えていれば再試行までの秒数を返す（超えていなければnil）
  def hit(operation, user)
    result = LIMITERS.fetch(operation).hit(user.id)
    result.retry_after_seconds unless result.allowed?
  end
end
