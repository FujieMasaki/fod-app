# 録音attemptのtoken（TASK-005で決定。architecture「`started_at`」）。serverが暗号化・署名した値を端末のmemoryにだけ置き、
# serverには保存しない。一回性は初回送信で処理の記録の主キー（attemptのid）の一意制約が担保する。
#
# 中身はattemptのid・利用者・`started_at`（録音開始操作をserverが受理した時刻）・期限。期限切れと不正を区別して返す
# （期限切れは録り直しの案内、不正は`attempt_invalid`）。
class RecordingAttemptToken
  PURPOSE = "recording_attempt".freeze

  Attempt = Data.define(:id, :user_id, :started_at, :expires_at) do
    def expired?(now = Time.current) = expires_at <= now
  end

  class Invalid < StandardError; end

  class << self
    def issue(user, now: Time.current)
      started_at = now.utc
      attempt = Attempt.new(id: SecureRandom.uuid, user_id: user.id, started_at:,
                            expires_at: started_at + Generation::ATTEMPT_LIFETIME)
      [attempt, encryptor.encrypt_and_sign(payload(attempt), purpose: PURPOSE)]
    end

    # 別の利用者のattempt・改ざん・形の違う値は`Invalid`。期限切れかどうかは返したAttemptで判断する。
    def verify(token, user)
      data = token.is_a?(String) && encryptor.decrypt_and_verify(token, purpose: PURPOSE)
      raise Invalid unless data.is_a?(Hash) && data["user_id"] == user.id

      Attempt.new(id: data.fetch("id"), user_id: data.fetch("user_id"), started_at: time(data, "started_at"),
                  expires_at: time(data, "expires_at"))
    rescue ActiveSupport::MessageEncryptor::InvalidMessage, KeyError, ArgumentError
      raise Invalid
    end

    private

    def time(data, key) = Time.iso8601(data.fetch(key)).in_time_zone

    def payload(attempt)
      { "id" => attempt.id, "user_id" => attempt.user_id, "started_at" => attempt.started_at.iso8601(6),
        "expires_at" => attempt.expires_at.iso8601(6) }
    end

    def encryptor
      @encryptor ||= ActiveSupport::MessageEncryptor.new(Rails.application.key_generator.generate_key(PURPOSE, 32))
    end
  end
end
