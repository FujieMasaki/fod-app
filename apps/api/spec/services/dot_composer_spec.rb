require "rails_helper"

RSpec.describe DotComposer do
  let(:client) { Aws::BedrockRuntime::Client.new(stub_responses: true, region: "ap-northeast-1") }
  let(:composer) { described_class.new(client:) }
  let(:tool_output) { { "sentence" => "散歩した日", "summary" => "朝に散歩した。" } }

  def compose = composer.compose(transcript: "朝に散歩した", date: Date.new(2026, 10, 24), duration_seconds: 120)

  def stub_content(*content)
    client.stub_responses(:converse, output: { message: { role: "assistant", content: } }, stop_reason: "tool_use",
                                     usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
                                     metrics: { latency_ms: 1 })
  end

  it "設定のmodel idとpromptで呼び、ツールの入力を返す" do
    stub_content({ tool_use: { tool_use_id: "t", name: "record_dot", input: tool_output } })

    expect(compose).to eq(tool_output)
    params = client.api_requests.last[:params]
    expect(params).to include(model_id: "test-model", system: [{ text: GenerationSettings.prompt }])
    expect(params.dig(:tool_config, :tool_choice)).to eq(tool: { name: "record_dot" })
  end

  it "録音日と録音時間と文字起こしだけを渡す（時刻や過去のDotを渡さない）" do
    stub_content({ text: "x" })
    compose

    text = client.api_requests.last[:params][:messages].sole[:content].sole[:text]
    expect(text).to eq("録音日: 2026-10-24\n録音時間: 120秒\n<transcript>\n朝に散歩した\n</transcript>")
  end

  it "ツールを使わなかった応答はnil" do
    stub_content({ text: "ツールを使いませんでした" })

    expect(compose).to be_nil
  end

  it "外部の失敗はmessageを写さずに包む" do
    client.stub_responses(:converse, Aws::BedrockRuntime::Errors::ValidationException.new(nil, "朝に散歩した"))

    expect { compose }.to raise_error(GenerationProviders::Error) do |error|
      expect(error.message).not_to include("散歩")
      expect(error.cause).to be_nil
    end
  end
end
