require "rails_helper"

# 受理から保存・後片付けまでを、Jobを順に実行して通しで確かめる（providerは偽物）。
RSpec.describe "音声からのDot生成の流れ" do # rubocop:disable RSpec/DescribeClass
  include ActiveJob::TestHelper

  include_context "with fake generation providers"

  let(:user) { create(:user) }
  let(:transcript) { "今日は朝に近所を散歩した。秘密の話もした" }

  def run_until_saved(attempt, token)
    GenerationUpload.call(user:, token:, read_audio: -> { uploaded_audio })
    perform_enqueued_jobs(only: GenerationTranscribeJob)
    complete_transcription(attempt)
    # 完了待ちのJobは、開始から確認の間隔をあけて動く
    travel(GenerationTranscription::CHECK_INTERVAL + 1.second)
    GenerationTranscription.check(attempt.id)
    perform_enqueued_jobs(only: GenerationComposeJob)
    perform_enqueued_jobs(only: GenerationCleanupJob)
  end

  def complete_transcription(attempt)
    transcriber.complete(Generation.find(attempt.id).transcription_job_name, transcript)
  end

  it "録音の内容がDotになり、started_atは録音attemptの受理時刻のまま。音声だけが先に消える" do
    attempt, token = RecordingAttemptToken.issue(user)

    travel(10.minutes)
    run_until_saved(attempt, token)

    dot = user.dots.find_by!(generation_id: attempt.id)
    expect(dot.started_at).to eq(attempt.started_at)
    expect(composer.calls.sole[:transcript]).to eq(transcript)
    expect(storage.keys).to eq(["transcripts/#{attempt.id}/1.json"])

    TranscriptAcknowledgement.acknowledge(user:, generation_id: attempt.id)
    perform_enqueued_jobs(only: GenerationCleanupJob)
    expect([storage.keys, transcriber.jobs, Generation.count]).to eq([[], {}, 0])
  end

  it "文字起こし・生成の入出力をログに出さない" do
    attempt, token = RecordingAttemptToken.issue(user)

    log = captured_log { run_until_saved(attempt, token) }

    expect(user.dots.exists?(generation_id: attempt.id)).to be(true)
    expect(log).not_to include(transcript, composer.output["sentence"], composer.output["summary"])
    expect(log).not_to include("秘密")
  end
end
