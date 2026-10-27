require "rails_helper"

RSpec.describe GenerationWatchdog do
  include ActiveJob::TestHelper

  include_context "with fake generation providers"

  def stale(state, **attrs)
    traits = %w[transcribing generating].include?(state) ? [:transcribing] : []
    create(:generation, *traits, state:, last_progress_at: 10.minutes.ago, **attrs)
  end

  describe "放置されたuploading（Jobが無いのでSolid Queueは知らない）" do
    it "音声が完成していれば、acceptedへ進めてenqueueする" do
      generation = stale("uploading", lease_token: SecureRandom.uuid, lease_expires_at: 5.minutes.ago)
      seed_resources(generation)

      described_class.sweep

      expect(generation.reload.state).to eq("accepted")
      expect(GenerationTranscribeJob).to have_been_enqueued.with(generation.id)
    end

    it "音声が無ければupload_failedにする" do
      generation = stale("uploading", lease_token: SecureRandom.uuid, lease_expires_at: 5.minutes.ago)

      described_class.sweep

      expect(generation.reload).to have_attributes(state: "upload_failed", failure_kind: "upload_incomplete")
    end

    it "世代がずれていれば（退会の受理後）、音声を消して取り消しへ回す" do
      user = create(:user, generation: 1, deletion_requested_at: Time.current)
      generation = stale("uploading", user:, user_generation: 0, lease_expires_at: 5.minutes.ago)
      seed_resources(generation)

      described_class.sweep

      expect(resource_keys(generation)).to be_empty
      expect(generation.reload.state).to eq("cancel_requested")
    end

    it "uploadの実行権が生きている間は手を出さない（生きているuploadと放置を区別する）" do
      generation = stale("uploading", lease_token: SecureRandom.uuid, lease_expires_at: 1.minute.from_now)

      described_class.sweep

      expect(generation.reload.state).to eq("uploading")
    end
  end

  it "止まったaccepted・transcribing・generatingを、それぞれの続きからenqueueし直す" do
    accepted = stale("accepted")
    transcribing = stale("transcribing")
    generating = stale("generating")

    described_class.sweep

    expect(GenerationTranscribeJob).to have_been_enqueued.with(accepted.id)
    expect(GenerationTranscriptionCheckJob).to have_been_enqueued.with(transcribing.id)
    expect(GenerationComposeJob).to have_been_enqueued.with(generating.id)
  end

  it "最終進捗から上限の時間を過ぎた生成は、拾い直さずに再試行できる失敗にする" do
    generating = stale("generating", last_progress_at: (described_class::GIVE_UP_AFTER + 1.minute).ago)

    described_class.sweep

    expect(generating.reload).to have_attributes(state: "failed", failure_kind: "generation_failed")
    expect(GenerationComposeJob).not_to have_been_enqueued
  end

  it "最終進捗から上限の時間を過ぎた文字起こしも失敗にせず、AWS側の状態を見に行く（終わった結果を捨てない）" do
    generation = stale("transcribing", last_progress_at: (described_class::GIVE_UP_AFTER + 1.minute).ago)
    transcriber.jobs[generation.transcription_job_name] =
      { status: :in_progress, output_key: generation.transcript_key }
    transcriber.complete(generation.transcription_job_name, "今日は朝に近所を散歩した")

    described_class.sweep
    perform_enqueued_jobs(only: GenerationTranscriptionCheckJob)

    expect(generation.reload.state).to eq("generating")
    expect(transcriber.started).to be_empty
  end

  it "拾った後に失敗と再試行を経ていれば、始め直したばかりの処理を失敗にしない" do
    generating = stale("generating", last_progress_at: (described_class::GIVE_UP_AFTER + 1.minute).ago)
    retried = false
    allow(Generation).to receive(:acquire_lease).and_wrap_original do |original, *args, **opts|
      unless retried
        retried = true
        generating.update!(last_progress_at: Time.current)
      end
      original.call(*args, **opts)
    end

    described_class.sweep

    expect(generating.reload).to have_attributes(state: "generating", lease_token: nil)
  end

  it "Transcribeの完了を待っている処理は、最終進捗が古くても拾わない（生きているjobを二重に開始しない）" do
    waiting = stale("transcribing", lease_expires_at: 10.seconds.from_now)

    described_class.sweep

    expect(GenerationTranscriptionCheckJob).not_to have_been_enqueued.with(waiting.id)
  end

  it "実行権が切れていても、最終進捗が新しい処理は拾わない（進んでいる処理を二重に動かさない）" do
    fresh = create(:generation, state: "accepted", last_progress_at: 30.seconds.ago, lease_expires_at: nil)

    described_class.sweep

    expect(GenerationTranscribeJob).not_to have_been_enqueued.with(fresh.id)
  end

  it "拾い直した完了待ちも、生きているjobに合流して新しいjobを作らない" do
    generation = stale("transcribing")
    transcriber.jobs[generation.transcription_job_name] =
      { status: :in_progress, output_key: generation.transcript_key }

    described_class.sweep
    perform_enqueued_jobs(only: GenerationTranscriptionCheckJob)

    expect(transcriber.started).to be_empty
    expect(generation.reload.state).to eq("transcribing")
  end

  it "開始のresponseを失いjobが見つからなければ、同じ名前で始め直す" do
    generation = stale("transcribing")

    GenerationTranscription.check(generation.id)

    expect(transcriber.started).to eq([generation.transcription_job_name])
  end
end
