# 処理IDと試行番号からAWSの名前を導く（TASK-003 Plan §20「命名」）。処理IDはserverが発行するUUIDで、
# AWSアカウント内で一意。利用者・メールアドレス・録音日など推測できる値や個人情報を名前に入れない。
module GenerationNaming
  AUDIO_PREFIX = "audio".freeze
  TRANSCRIPT_PREFIX = "transcripts".freeze
  # StartTranscriptionJobのTranscriptionJobNameの制約。処理ID単体ではなく、試行番号を付けた後の全体で判定する
  JOB_NAME_FORMAT = /\A[0-9a-zA-Z._-]+\z/
  JOB_NAME_MAX_LENGTH = 200
  UUID_FORMAT = /\A\h{8}-\h{4}-\h{4}-\h{4}-\h{12}\z/

  class InvalidName < StandardError; end

  module_function

  def audio_key(generation_id, upload_attempt) = "#{audio_prefix(generation_id)}#{positive!(upload_attempt)}"
  def audio_prefix(generation_id) = "#{AUDIO_PREFIX}/#{uuid!(generation_id)}/"

  def transcript_key(generation_id, transcription_attempt)
    "#{transcript_prefix(generation_id)}#{positive!(transcription_attempt)}.json"
  end

  def transcript_prefix(generation_id) = "#{TRANSCRIPT_PREFIX}/#{uuid!(generation_id)}/"

  def job_name(generation_id, transcription_attempt)
    name = "#{uuid!(generation_id)}-#{positive!(transcription_attempt)}"
    unless name.length <= JOB_NAME_MAX_LENGTH && name.match?(JOB_NAME_FORMAT)
      raise InvalidName, "transcription job name violates the AWS constraint"
    end

    name
  end

  def uuid!(value)
    raise InvalidName, "generation id must be a UUID" unless value.is_a?(String) && value.match?(UUID_FORMAT)

    value.downcase
  end

  def positive!(value)
    raise InvalidName, "attempt must be a positive integer" unless value.is_a?(Integer) && value.positive?

    value
  end
end
