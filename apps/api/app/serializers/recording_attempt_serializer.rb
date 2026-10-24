# 契約のRecordingAttempt
class RecordingAttemptSerializer
  def initialize(attempt, token)
    @attempt = attempt
    @token = token
  end

  def as_json(*)
    { id: @attempt.id, attempt_token: @token, started_at: @attempt.started_at.utc.iso8601,
      expires_at: @attempt.expires_at.utc.iso8601 }
  end
end
