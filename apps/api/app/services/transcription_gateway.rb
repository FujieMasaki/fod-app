# Amazon Transcribe（バッチ・ap-northeast-1）。結果は自前のbucketへ書き出させる（`OutputBucketName`を必ず指定する。
# 省くとservice-managed bucketに置かれ、保持と削除を自分たちで制御できない。TASK-003 Plan §27）。
class TranscriptionGateway
  # jobが非終端で、まだ消せない（終端になるまで追ってから消す）
  class NotTerminal < StandardError; end

  MEDIA_FORMATS = { "audio/webm" => "webm", "audio/mp4" => "mp4" }.freeze
  STATUSES = { "QUEUED" => :in_progress, "IN_PROGRESS" => :in_progress,
               "COMPLETED" => :completed, "FAILED" => :failed }.freeze

  def initialize(client:)
    @client = client
  end

  # 同じ名前のjobが既にあれば、新しく作らずに合流する（responseを失った後の再実行。TASK-003 Plan §24-24）。
  def start(job_name:, media_key:, content_type:, output_key:)
    @client.start_transcription_job(**start_params(job_name, media_key, content_type, output_key))
    :started
  rescue Aws::TranscribeService::Errors::ConflictException
    :exists
  rescue *GenerationProviders::AWS_ERRORS => e
    GenerationProviders::Error.raise_from(e)
  end

  # :in_progress / :completed / :failed / :missing
  # 存在しないjobの照会には`NotFoundException`ではなく`BadRequestException`が返り得る。messageでは判定せず、
  # 一覧に同じ名前のjobがあるかで分ける（存在しないjobを失敗と扱い続けると、後片付けが終わらなくなる）。
  # 外部の呼び出しはrescue節の中で行わない（rescue節の中で起きた例外は同じmethodの別のrescueに捕まらず、
  # raiseした例外にはrescueした例外がcauseとして付くため）
  def status(job_name)
    case (job = lookup(job_name))
    when :not_found then :missing
    when :refused then missing_unless_listed(job_name)
    else STATUSES.fetch(job.transcription_job_status) { raise GenerationProviders::Error, "unknown transcription status" }
    end
  end

  # 既に無ければ成功として扱う（冪等）。非終端なら`NotTerminal`。
  # `BadRequestException`は「存在しない」と「非終端」のどちらでも返り得るので、状態を見直して分ける
  # （存在しないjobを非終端と扱うと、後片付けが終わらなくなる）。
  def delete(job_name)
    explain_refused_delete(job_name) if request_delete(job_name) == :refused
  end

  # 書き出された結果（JSON）から全文を取り出す。形が違えばnil。
  def self.text_from(json)
    parsed = JSON.parse(json)
    text = parsed.dig("results", "transcripts", 0, "transcript") if parsed.is_a?(Hash)
    text if text.is_a?(String)
  rescue JSON::ParserError, TypeError
    nil
  end

  private

  # jobか、:not_found / :refused
  def lookup(job_name)
    @client.get_transcription_job(transcription_job_name: job_name).transcription_job
  rescue Aws::TranscribeService::Errors::NotFoundException
    :not_found
  rescue Aws::TranscribeService::Errors::BadRequestException
    :refused
  rescue *GenerationProviders::AWS_ERRORS => e
    GenerationProviders::Error.raise_from(e)
  end

  # :deleted（既に無い場合を含む） / :refused
  def request_delete(job_name)
    @client.delete_transcription_job(transcription_job_name: job_name)
    :deleted
  rescue Aws::TranscribeService::Errors::NotFoundException
    :deleted
  rescue Aws::TranscribeService::Errors::BadRequestException
    :refused
  rescue *GenerationProviders::AWS_ERRORS => e
    GenerationProviders::Error.raise_from(e)
  end

  def missing_unless_listed(job_name)
    raise GenerationProviders::Error, "transcription job could not be read" if listed?(job_name)

    :missing
  end

  # 状態を指定しない一覧はすべての状態のjobを返す。名前の部分一致で絞り、同じ名前があるかを確かめる
  def listed?(job_name)
    @client.list_transcription_jobs(job_name_contains: job_name).each_page.any? do |page|
      page.transcription_job_summaries.any? { it.transcription_job_name == job_name }
    end
  rescue *GenerationProviders::AWS_ERRORS => e
    GenerationProviders::Error.raise_from(e)
  end

  def explain_refused_delete(job_name)
    case status(job_name)
    when :missing then nil
    when :in_progress then raise NotTerminal, "transcription job is not in a terminal state"
    else raise GenerationProviders::Error, "transcription job could not be deleted"
    end
  end

  def start_params(job_name, media_key, content_type, output_key)
    bucket = GenerationSettings.bucket
    params = {
      transcription_job_name: job_name, language_code: GenerationSettings.transcribe_language_code,
      media_format: MEDIA_FORMATS.fetch(content_type), media: { media_file_uri: "s3://#{bucket}/#{media_key}" },
      output_bucket_name: bucket, output_key:
    }
    # roleを渡すには、AWSのAPI上`AllowDeferredExecution`も要る（同時実行の上限を超えると待ち行列に入る）
    role = GenerationSettings.transcribe_data_access_role_arn
    params[:job_execution_settings] = { allow_deferred_execution: true, data_access_role_arn: role } if role
    params
  end
end
