# 生成の状態の照会（`GET /api/v1/generations/{id}`。TASK-003 Plan §20「pollingはDotの存在を先に見る」、§27）。
# 先にDotを見て、あれば後片付けが残っていても成功として返す。全文は返さない条件（ACK・期限・完全削除・退会）に
# 当たらない間だけ自前のS3から読んで返す。条件は受理の時点で効き、物理削除の完了を待たない。
module GenerationStatus
  POLL_AFTER_SECONDS = 5

  # kind: :processing / :succeeded / :failed / :expired。`transcript`は返せないときnil
  View = Data.define(:kind, :id, :generation, :dot, :transcript) do
    def started_at = dot&.started_at || generation.started_at
  end

  module_function

  # 見せられなければnil（存在しない・他人の・ゴミ箱の中・取り消し済み・完全削除や退会の後）
  def lookup(user:, generation_id:, now: Time.current)
    generation = user.generations.find_by(id: generation_id)
    dot = user.dots.find_by(generation_id:)
    return dot.trashed_at ? nil : succeeded(dot, generation, now) if dot
    return unless generation

    view_for(generation, now)
  end

  def succeeded(dot, generation, now)
    transcript = generation&.transcript_returnable?(now) ? read_transcript(generation) : nil
    View.new(kind: :succeeded, id: dot.generation_id, generation:, dot:, transcript:)
  end

  def view_for(generation, now)
    kind = kind_for(generation, now)
    kind && View.new(kind:, id: generation.id, generation:, dot: nil, transcript: nil)
  end

  def kind_for(generation, now)
    return (:expired if generation.cancel_reason == "expired") if generation.canceled?
    # Dotの無いまま後片付けを待つ記録（Dotの完全削除の受理の前後）は見せない
    return if generation.state == Generation::SUCCEEDED_CLEANUP_PENDING
    return :expired if generation.expired?(now)

    [Generation::FAILED, Generation::UPLOAD_FAILED].include?(generation.state) ? :failed : :processing
  end

  def read_transcript(generation)
    TranscriptionGateway.text_from(GenerationProviders.storage.read(generation.transcript_key).to_s)
  end

  # 契約の`stage`
  def stage(generation)
    case generation.state
    when Generation::UPLOADING then "uploading"
    when Generation::GENERATING then "generating"
    else "transcribing"
    end
  end

  def retryable?(generation, now = Time.current)
    generation.state == Generation::FAILED && !generation.expired?(now) &&
      GenerationRetry::NOT_RETRYABLE.exclude?(generation.failure_kind)
  end
  private_class_method :succeeded, :view_for, :kind_for, :read_transcript
end
