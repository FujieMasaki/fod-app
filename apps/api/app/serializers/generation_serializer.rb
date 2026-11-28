# 契約のGeneration。状態ごとに必ず返す項目を組み立て、記録の内部の列（object key・job名・実行権・世代）を返さない。
class GenerationSerializer
  def initialize(view)
    @view = view
  end

  def as_json(*)
    base = { id: @view.id, status: @view.kind.to_s, started_at: @view.started_at.utc.iso8601 }
    base.merge(send(@view.kind))
  end

  private

  def processing
    { stage: GenerationStatus.stage(generation), retryable: false, retry_expires_at:,
      poll_after_seconds: GenerationStatus::POLL_AFTER_SECONDS }
  end

  def succeeded
    transcript = @view.transcript ? { status: "available", text: @view.transcript } : { status: "unavailable" }
    { retryable: false, dot: DotSerializer.new(@view.dot).as_json, transcript: }
  end

  def failed
    { retryable: GenerationStatus.retryable?(generation), retry_expires_at:,
      failure: { kind: generation.contract_failure_kind } }
  end

  def expired = { retryable: false, retry_expires_at: }

  def generation = @view.generation
  def retry_expires_at = generation.retry_expires_at.utc.iso8601
end
