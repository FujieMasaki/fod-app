# 録音した音声の受け取り（`POST /api/v1/dots`。TASK-003 Plan §20「退会と進行中処理の排他」、§24-2・27・29・34・36・37）。
#
# 1. headerのattemptを、本文（multipart）を読む前に検証する。同じattemptの既存の処理があれば本文を読まずに返す
# 2. 利用者の行をlockし、activeを確かめて`uploading`の記録を作りcommitする（record-first）。同じattemptの並行送信は
#    主キーの一意制約で1件に絞る
# 3. commitのあとにS3へ置く。keyは処理IDとupload試行番号からserverが決める
# 4. 置けたあとの確定（T1・T3）と、置けなかったときの`upload_failed`（T2）はGenerationUploadCompletion
#
# 再送（T4）は、記録が`upload_failed`のとき、attemptの期限内に限って新しい実行権で受け付ける。
class GenerationUpload
  LEASE_DURATION = 15.minutes

  # outcome: :created（新しく受け付けた） / :existing（既存の処理） / :problem（契約のerror code）
  Result = Data.define(:outcome, :generation_id, :problem)

  # `read_audio`は本文を読む必要があるときだけ呼ぶ（UploadedAudioかnilを返す）。
  def self.call(user:, token:, read_audio:, now: Time.current) = new(user, now).call(token, read_audio)

  def initialize(user, now)
    @user = user
    @now = now
  end

  def call(token, read_audio)
    attempt = RecordingAttemptToken.verify(token, @user)
    return problem(:account_deletion_in_progress) if @user.deletion_requested?

    known = known_outcome(attempt)
    return known if known.is_a?(Result)
    return problem(:attempt_expired) if attempt.expired?(@now)

    receive(attempt, read_audio.call, reupload: known == :reupload)
  rescue RecordingAttemptToken::Invalid
    problem(:attempt_invalid)
  end

  private

  # 同じattemptの既存の処理・消したものがあれば、その結果。再送を受け付けるなら:reupload
  def known_outcome(attempt)
    dot = @user.dots.find_by(generation_id: attempt.id)
    # ゴミ箱の中のDotは返さない
    return dot.trashed_at ? problem(:attempt_invalid) : existing(attempt.id) if dot
    # 処理の取り消し・完全削除・退会で消したものを作り直さない
    return problem(:attempt_invalid) if ConsumedRecordingAttempt.consumed?(attempt.id, @now)

    generation = @user.generations.find_by(id: attempt.id)
    generation && known_generation_outcome(generation)
  end

  def known_generation_outcome(generation)
    return problem(:attempt_invalid) if generation.canceled? && generation.cancel_reason != "expired"
    return :reupload if generation.state == Generation::UPLOAD_FAILED

    existing(generation.id)
  end

  def receive(attempt, audio, reupload:)
    invalid = audio ? audio.problem : :validation_failed
    return problem(invalid) if invalid

    lease_token = reupload ? reopen(attempt, audio) : create(attempt, audio)
    return lease_token if lease_token.is_a?(Result)

    store(attempt.id, audio, lease_token)
  end

  def create(attempt, audio)
    lease_token = SecureRandom.uuid
    ActiveRecord::Base.transaction do
      user = User.lock.find(@user.id)
      return problem(:account_deletion_in_progress) if user.deletion_requested?

      Generation.transaction(requires_new: true) { Generation.create!(new_record(attempt, audio, user, lease_token)) }
    end
    lease_token
  rescue ActiveRecord::RecordNotUnique
    # 同じattemptの並行送信。2件目の記録もJobも作らず、既存の処理を返す
    @user.generations.exists?(attempt.id) ? existing(attempt.id) : problem(:attempt_invalid)
  end

  def new_record(attempt, audio, user, lease_token)
    {
      id: attempt.id, user:, started_at: attempt.started_at, duration_seconds: audio.duration_seconds,
      audio_content_type: audio.content_type, accepted_at: @now, retry_expires_at: @now + Generation::RETRY_WINDOW,
      state: Generation::UPLOADING, user_generation: user.generation, upload_attempt: 1,
      audio_key: GenerationNaming.audio_key(attempt.id, 1), lease_token:, lease_expires_at: @now + LEASE_DURATION,
      last_progress_at: @now
    }
  end

  # T4: upload_failed → uploading。新しい実行権を取った要求だけが、新しい試行番号のkeyへ置ける
  def reopen(attempt, audio)
    entry = GenerationGate.enter(user_id: @user.id, generation_id: attempt.id, from: Generation::UPLOAD_FAILED,
                                 to: Generation::UPLOADING, attrs: reopen_attrs(audio)) do |user, generation|
      GenerationGate.proceed_denial(user, generation, @now)
    end
    entry.lease_token
  rescue GenerationGate::Denied => e
    e.reason == :state ? existing(attempt.id) : problem(:attempt_expired)
  end

  def reopen_attrs(audio)
    lambda do |generation|
      upload_attempt = generation.upload_attempt + 1
      { upload_attempt:, audio_key: GenerationNaming.audio_key(generation.id, upload_attempt), failure_kind: nil,
        audio_content_type: audio.content_type, duration_seconds: audio.duration_seconds,
        lease_expires_at: @now + LEASE_DURATION }
    end
  end

  def store(generation_id, audio, lease_token)
    key = Generation.find(generation_id).audio_key
    GenerationProviders.storage.put(key, audio.io, content_type: audio.content_type)
    if GenerationUploadCompletion.complete(generation_id, lease_token) == :accepted
      return Result.new(outcome: :created, generation_id:, problem: nil)
    end

    problem(@user.reload.deletion_requested? ? :account_deletion_in_progress : :attempt_invalid)
  rescue GenerationProviders::Error
    GenerationUploadCompletion.fail(generation_id, lease_token)
    existing(generation_id)
  end

  def existing(generation_id) = Result.new(outcome: :existing, generation_id:, problem: nil)
  def problem(code) = Result.new(outcome: :problem, generation_id: nil, problem: code)
end
