# 固定の時間枠で試行回数を数える。ECSの複数タスク・再起動をまたいで共有するためRDSに置き、
# 1つのUPSERTで原子的に加算する（TASK-006 Plan §12-4）。
#
# keyはHMACのdigestにして保存し、メールアドレスやIPを生のまま残さない。固定枠なので、枠の境目を
# またぐと短時間に上限の2倍まで通り得る（Plan §13）。
class RateLimiter
  Result = Data.define(:count, :limit, :retry_after_seconds) do
    def allowed? = count <= limit
  end

  def initialize(name:, limit:, period:)
    @name = name
    @limit = limit
    @period = period.to_i
  end

  # 1回分を数え、その後の状態を返す。
  def hit(key, now: Time.current)
    window = window_start(now)
    # 原子的な加算のためにUPSERTを使う。RateLimitCounterにvalidationは無い。
    rows = RateLimitCounter.upsert( # rubocop:disable Rails/SkipsModelValidations
      { key_digest: digest(key), window_started_at: window, expires_at: window + @period, count: 1 },
      unique_by: %i[key_digest window_started_at],
      on_duplicate: Arel.sql("count = rate_limit_counters.count + 1, updated_at = CURRENT_TIMESTAMP"),
      returning: :count
    )
    build_result(rows.first.fetch("count"), window, now)
  end

  # 数えずに、いまの枠で上限に達しているかを返す。
  def check(key, now: Time.current)
    window = window_start(now)
    count = RateLimitCounter.where(key_digest: digest(key), window_started_at: window).pick(:count) || 0
    Result.new(count: count + 1, limit: @limit, retry_after_seconds: retry_after(window, now))
  end

  def self.purge_expired!(now: Time.current) = RateLimitCounter.expired(now).delete_all

  def self.secret
    @secret ||= Rails.application.key_generator.generate_key("rate_limit_counters", 32)
  end

  private

  def window_start(now) = Time.zone.at((now.to_i / @period) * @period)

  def retry_after(window, now) = [(window + @period - now).ceil, 1].max

  def build_result(count, window, now)
    Result.new(count:, limit: @limit, retry_after_seconds: retry_after(window, now))
  end

  def digest(key)
    OpenSSL::HMAC.hexdigest("SHA256", self.class.secret, "#{@name}:#{@period}:#{key}")
  end
end
