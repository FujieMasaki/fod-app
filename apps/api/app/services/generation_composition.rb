# 生成と保存（T11・T12。TASK-003 Plan §17、§20「状態遷移: Dotの保存とcleanupを分ける」）。
#
# - 自前のS3から全文を読み、Bedrockで`sentence`と`summary`を作り、検証してから保存する。
# - 保存は、利用者の行をlockして世代番号を確かめ、Dotのinsertと`succeeded_cleanup_pending`への更新を同じ
#   transactionで行う。ここで成功が確定する。取り消しで実行権を失っていれば保存しない。
# - 失敗は種類を分けて`failed`にする（外部AI・生成結果の検証・保存）。全文が残っていれば再試行は生成から行う。
# - 全文・promptの入出力をログや例外のmessageに入れない。
module GenerationComposition
  # Bedrockへ送る全文の上限（文字数）。録音は30分まで（日本語で話すと約12,000字）なので、それより十分に長いものは
  # 申告より長い音声とみなして送らない（外部AIの費用に上限をつける。Transcribeの費用はrate limitで抑える）。
  # 初期値で、実測（H4）で見直す
  TRANSCRIPT_MAX_LENGTH = 20_000
  # Transcribeが書き出した結果（JSON）を読む上限（byte）。外部が書いたものをそのままメモリへ載せない。結果には全文に
  # 加えて単語ごとの時刻と確からしさが入るので、全文の上限より大きくする。初期値で、実測（H4）で見直す
  TRANSCRIPT_MAX_BYTES = 2.megabytes
  # 文字起こしの完了時に全文を読めなかったとき（`read_transcript`がnil・:too_large）の失敗の種類。上限より大きい結果は、
  # 全文が上限より長いときと同じにする
  UNREADABLE_KINDS = { nil => "transcription_failed", too_large: "invalid_output" }.freeze

  module_function

  # 書き出された結果から全文を読む（文字起こしの完了時と生成の前）。無い・形が違えばnil。上限より大きければ読まずに
  # :too_large（全文が上限より長いときと同じく、申告より長い音声とみなす）
  def read_transcript(generation)
    json = GenerationProviders.storage.read(generation.transcript_key, max_bytes: TRANSCRIPT_MAX_BYTES)
    TranscriptionGateway.text_from(json.to_s)
  rescue GenerationProviders::TooLarge
    Rails.logger.warn("generation transcript output too large: generation_id=#{generation.id}")
    :too_large
  end

  # 結果はSymbol: :succeeded / :failed / :skipped
  def perform(generation_id, now: Time.current)
    generation = Generation.find_by(id: generation_id, state: Generation::GENERATING)
    token = generation && Generation.acquire_lease(generation.id, state: Generation::GENERATING,
                                                                  duration: GenerationGate::LEASE_DURATION, now:)
    return :skipped unless token

    compose(generation, token, now)
  end

  def compose(generation, token, now)
    text = read_transcript(generation)
    unusable = reject_transcript(generation, token, text)
    return unusable if unusable

    output = GenerationProviders.composer.compose(transcript: text, date: Dot.date_for(generation.started_at),
                                                  duration_seconds: generation.duration_seconds)
    fields = validated(output)
    fields ? persist(generation, token, fields, now) : fail(generation, token, "invalid_output")
  rescue GenerationProviders::Error
    fail(generation, token, "generation_failed")
  end

  # 生成結果の検証（TASK-003 Plan §17）。空・上限超過・壊れた文字列は保存しない
  def validated(output)
    return unless output.is_a?(Hash)

    fields = { sentence: output["sentence"], summary: output["summary"] }
    fields if fields.values.all? { valid_text?(it) } &&
              fields[:sentence].length <= Dot::SENTENCE_MAX_LENGTH && fields[:summary].length <= Dot::SUMMARY_MAX_LENGTH
  end

  def valid_text?(value)
    value.is_a?(String) && value.valid_encoding? && value.exclude?("\u0000") && value.strip.present?
  end

  def persist(generation, token, fields, now)
    ActiveRecord::Base.transaction { result_saved?(generation, token, fields, now) } ? :succeeded : :skipped
  rescue ActiveRecord::RecordInvalid, ActiveRecord::StatementInvalid
    fail(generation, token, "persist_failed")
  end

  # 保存できたらtrue。退会を受理していた・取り消しで実行権を失っていたら保存しない
  def result_saved?(generation, token, fields, now)
    user = User.lock.find(generation.user_id)
    return false if user.deletion_requested? || user.generation != generation.user_generation

    insert_dot(user, generation, fields)
    raise ActiveRecord::Rollback unless succeed(generation, token, now)

    GenerationCleanupJob.perform_later(generation.id)
    true
  end

  def insert_dot(user, generation, fields)
    user.dots.create!(generation_id: generation.id, started_at: generation.started_at,
                      duration_seconds: generation.duration_seconds, **fields)
  end

  # T11。後片付けの実行権は誰も持っていない（期限切れの印）にしておき、Jobが落ちても定期の拾い直しが拾う
  def succeed(generation, token, now)
    Generation.transition(generation.id, from: Generation::GENERATING, to: Generation::SUCCEEDED_CLEANUP_PENDING,
                                         holding: token, failure_kind: nil, lease_token: nil, lease_expires_at: now)
  end

  # 全文が読めなければ、次の再試行は文字起こしから行う。上限より長ければ、契約の失敗の種類を増やさないよう
  # 生成できない入力として扱う（契約ではprocessing_failed。再試行しても送らない）。どちらでもなければnil
  def reject_transcript(generation, token, text)
    return fail(generation, token, "invalid_output") if text == :too_large
    return fail(generation, token, "transcription_failed", transcript_ready_at: nil) if text.blank?
    return unless text.length > TRANSCRIPT_MAX_LENGTH

    Rails.logger.warn("generation transcript too long: generation_id=#{generation.id} length=#{text.length}")
    fail(generation, token, "invalid_output")
  end

  # T12
  def fail(generation, token, kind, **attrs)
    Generation.transition(generation.id, from: Generation::GENERATING, to: Generation::FAILED, holding: token,
                                         failure_kind: kind, lease_token: nil, lease_expires_at: nil, **attrs)
    :failed
  end
  private_class_method :compose, :reject_transcript, :valid_text?, :persist, :result_saved?, :insert_dot, :succeed,
                       :fail
end
