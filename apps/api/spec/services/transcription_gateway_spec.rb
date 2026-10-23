require "rails_helper"

RSpec.describe TranscriptionGateway do
  let(:client) { Aws::TranscribeService::Client.new(stub_responses: true, region: "ap-northeast-1") }
  let(:gateway) { described_class.new(client:) }
  let(:params) { client.api_requests.last[:params] }

  def start
    gateway.start(job_name: "id-1", media_key: "audio/id/1", content_type: "audio/mp4",
                  output_key: "transcripts/id/1.json")
  end

  it "自前のbucketへ書き出すよう指定してjobを始める" do
    expect(start).to eq(:started)
    expect(params).to include(
      transcription_job_name: "id-1", language_code: "ja-JP", media_format: "mp4",
      media: { media_file_uri: "s3://test-generation-bucket/audio/id/1" },
      output_bucket_name: "test-generation-bucket", output_key: "transcripts/id/1.json"
    )
    expect(params).not_to have_key(:job_execution_settings)
  end

  it "東京のendpointを呼ぶ" do
    expect(client.config.region).to eq("ap-northeast-1")
    expect(GenerationSettings.region).to eq("ap-northeast-1")
  end

  it "roleを設定したときだけ、そのroleで音声を読み結果を書き出させる" do
    allow(GenerationSettings).to receive(:transcribe_data_access_role_arn).and_return("arn:aws:iam::0:role/x")

    start

    expect(params[:job_execution_settings]).to eq(allow_deferred_execution: true,
                                                  data_access_role_arn: "arn:aws:iam::0:role/x")
  end

  it "同じ名前のjobが既にあれば、新しく作らずに合流する" do
    client.stub_responses(:start_transcription_job, "ConflictException")

    expect(start).to eq(:exists)
  end

  it "jobの状態を返す。無ければ:missing" do
    statuses = %w[QUEUED IN_PROGRESS COMPLETED FAILED].map { { transcription_job: { transcription_job_status: it } } }
    client.stub_responses(:get_transcription_job, [*statuses, "NotFoundException"])

    expect(Array.new(5) { gateway.status("id-1") }).to eq(%i[in_progress in_progress completed failed missing])
  end

  it "jobを消す。既に無ければ成功" do
    client.stub_responses(:delete_transcription_job, [{}, "NotFoundException"])

    expect { gateway.delete("id-1") }.not_to raise_error
    expect { gateway.delete("id-1") }.not_to raise_error
  end

  it "BadRequestは状態を見直し、存在しなければ成功、非終端ならNotTerminal、終端なら失敗にする" do
    client.stub_responses(:delete_transcription_job, "BadRequestException")
    client.stub_responses(:get_transcription_job, [
                            "NotFoundException", { transcription_job: { transcription_job_status: "IN_PROGRESS" } },
                            { transcription_job: { transcription_job_status: "COMPLETED" } }
                          ])

    expect { gateway.delete("id-1") }.not_to raise_error
    expect { gateway.delete("id-1") }.to raise_error(TranscriptionGateway::NotTerminal)
    expect { gateway.delete("id-1") }.to raise_error(GenerationProviders::Error)
  end

  it "書き出された結果から全文を取り出す。形が違えばnil" do
    json = { results: { transcripts: [{ transcript: "今日は散歩した" }] } }.to_json

    expect(described_class.text_from(json)).to eq("今日は散歩した")
    expect(described_class.text_from("{}")).to be_nil
    expect(described_class.text_from("not json")).to be_nil
    expect(described_class.text_from("[1]")).to be_nil
    expect(described_class.text_from('{"results":"x"}')).to be_nil
  end
end
