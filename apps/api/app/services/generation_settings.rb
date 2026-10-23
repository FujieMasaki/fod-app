# `config/generation.yml`の値（TASK-009 Plan §7-5）。
module GenerationSettings
  class NotConfigured < StandardError; end

  module_function

  def config = Rails.application.config_for(:generation)

  def region = config.fetch(:region)
  def transcribe_language_code = config.fetch(:transcribe_language_code)
  def bedrock_max_tokens = config.fetch(:bedrock_max_tokens)
  def prompt = config.fetch(:prompt)
  def transcribe_data_access_role_arn = config[:transcribe_data_access_role_arn].presence
  def bucket = required(:bucket)
  def bedrock_model_id = required(:bedrock_model_id)
  def app_account_id = required(:app_account_id)

  # 外部へ送る前に、送るのに要る設定がすべてあることを確かめる
  def verify_ready! = [bucket, bedrock_model_id, app_account_id]

  # 未設定のまま外部へ送らない。値そのものは例外のmessageに入れない。
  def required(key)
    config[key].presence || raise(NotConfigured, "generation setting is missing: #{key}")
  end
end
