# 外部の文字起こし・生成の費用がかかる操作の回数の制限（契約のRateLimited。具体値はTASK-009で決めた）。
#
# - 1時間の上限: 日々の記録として十分に多く、自動化された大量の送信だけを止める値。
# - 1日の上限（送信・再試行）: Transcribeは音声の実際の長さで課金され、serverは申告の録音時間と大きさしか
#   確かめないため、1件の費用は最長4時間分まで膨らみうる。1時間の上限だけでは1アカウントの費用に上限が
#   つかないので、1日の回数で最悪の場合を抑える（人間の判断、2026-10-27。実際の長さの確認は公開前の別タスク）。
#
# 枠は固定（RateLimiter）で、1日の枠はUTCの0時（日本時間の9時）で切り替わる。
module GenerationThrottle
  LIMITERS = {
    recording_attempt: [RateLimiter.new(name: "generation_recording_attempt_user", limit: 60, period: 1.hour)],
    upload: [RateLimiter.new(name: "generation_upload_user", limit: 60, period: 1.hour),
             RateLimiter.new(name: "generation_upload_user_daily", limit: 20, period: 1.day)],
    retry: [RateLimiter.new(name: "generation_retry_user", limit: 30, period: 1.hour),
            RateLimiter.new(name: "generation_retry_user_daily", limit: 20, period: 1.day)]
  }.freeze

  module_function

  # 1回分をすべての枠で数え、どれかの上限を超えていれば、すべての枠が空くまでの秒数を返す（超えていなければnil）
  def hit(operation, user)
    LIMITERS.fetch(operation).map { it.hit(user.id) }.reject(&:allowed?).map(&:retry_after_seconds).max
  end
end
