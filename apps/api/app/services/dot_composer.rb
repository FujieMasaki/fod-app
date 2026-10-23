# Amazon BedrockのClaudeで`sentence`と`summary`を作る（TASK-003 Plan §17）。出力の検証は呼ぶ側が行う。
# 入力は1件の録音の文字起こしと、録音日・録音時間だけ（過去のDotや`started_at`の時刻は渡さない）。
class DotComposer
  TOOL_NAME = "record_dot".freeze
  INPUT_SCHEMA = {
    type: "object",
    properties: {
      sentence: { type: "string", description: "その日を一言で思い出せる短い1文" },
      summary: { type: "string", description: "何を話したかの要約" }
    },
    required: %w[sentence summary]
  }.freeze

  def initialize(client:)
    @client = client
  end

  # ツールの入力（Hash）を返す。ツールを使わなかった・途中で止まった応答はnil。
  def compose(transcript:, date:, duration_seconds:)
    response = @client.converse(**request(transcript, date, duration_seconds))
    # 上限で切れた・filterで止まったなどの応答は、ツールの入力があっても使わない
    return unless response.stop_reason == "tool_use"

    tool_use = response.output.message.content.filter_map(&:tool_use).find { it.name == TOOL_NAME }
    tool_use&.input
  rescue *GenerationProviders::AWS_ERRORS => e
    GenerationProviders::Error.raise_from(e)
  end

  private

  def request(transcript, date, duration_seconds)
    {
      model_id: GenerationSettings.bedrock_model_id,
      system: [{ text: GenerationSettings.prompt }],
      messages: [{ role: "user", content: [{ text: user_text(transcript, date, duration_seconds) }] }],
      inference_config: { max_tokens: GenerationSettings.bedrock_max_tokens },
      tool_config: {
        tools: [{ tool_spec: { name: TOOL_NAME, description: "Dotの文面を記録する", input_schema: { json: INPUT_SCHEMA } } }],
        tool_choice: { tool: { name: TOOL_NAME } }
      }
    }
  end

  def user_text(transcript, date, duration_seconds)
    "録音日: #{date.iso8601}\n録音時間: #{duration_seconds}秒\n<transcript>\n#{transcript}\n</transcript>"
  end
end
