require "rails_helper"

# TASK-003 Plan §20の状態表のうち、後片付けの遷移（T17〜T21）を1本ずつ確かめる。
RSpec.describe "処理の記録の遷移: 後片付け" do # rubocop:disable RSpec/DescribeClass
  include_context "with fake generation providers"

  def cleanup(generation) = GenerationCleanup.perform(generation.id)

  describe "succeeded_cleanup_pending" do
    let(:generation) { create(:generation, :transcribed, state: "succeeded_cleanup_pending") }

    before { seed_resources(generation) }

    it "T18: 全文を返さない印があれば、音声・文字起こし結果・jobを消してから記録を消す" do
      generation.update!(transcript_withheld_at: Time.current)

      expect(cleanup(generation)).to eq(:done)
      expect(Generation.exists?(generation.id)).to be(false)
      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    end

    it "T17: 失敗したら状態を保ったまま、実行権の期限を切って再実行を待つ。再実行で終わる" do
      generation.update!(transcript_withheld_at: Time.current)
      storage.fail_next(:delete_prefix)

      expect(cleanup(generation)).to eq(:retry)
      expect(generation.reload).to have_attributes(state: "succeeded_cleanup_pending",
                                                   lease_expires_at: be > Time.current)

      travel(2.minutes) { expect(cleanup(generation)).to eq(:done) }
      expect(Generation.exists?(generation.id)).to be(false)
    end

    it "実行権を他の実行が持っている間は手を出さない" do
      Generation.acquire_lease(generation.id, state: "succeeded_cleanup_pending", duration: 5.minutes)

      expect(cleanup(generation)).to eq(:skipped)
      expect(resource_keys(generation).size).to eq(2)
    end
  end

  describe "cancel_requested / cleanup_pending" do
    let(:generation) do
      create(:generation, :transcribed, state: "cancel_requested", cancel_reason: "canceled",
                                        transcript_withheld_at: Time.current)
    end

    before { seed_resources(generation) }

    it "T19→T21: cleanup_pendingへ移り、その処理の全部を消してから記録を消す" do
      expect(cleanup(generation)).to eq(:done)
      expect(Generation.exists?(generation.id)).to be(false)
      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    end

    it "T19: Transcribeのjobが非終端なら、cleanup_pendingのまま終端を待つ（削除要求だけで終わらせない）" do
      transcriber.jobs[generation.transcription_job_name][:status] = :in_progress

      expect(cleanup(generation)).to eq(:waiting)
      expect(generation.reload.state).to eq("cleanup_pending")
      expect(resource_keys(generation).size).to eq(2)
    end

    it "T20: 失敗したらcleanup_pendingのまま、新しい実行権で再実行して終わる" do
      transcriber.fail_next(:delete)

      expect(cleanup(generation)).to eq(:retry)
      expect(generation.reload.state).to eq("cleanup_pending")

      travel(2.minutes) { expect(cleanup(generation)).to eq(:done) }
      expect(Generation.exists?(generation.id)).to be(false)
    end

    it "T19: 取り消す前に動いていた実行の期限が残っていれば、その期限が切れるまで始めない" do
      generation.update_columns(lease_expires_at: 3.minutes.from_now) # rubocop:disable Rails/SkipsModelValidations

      expect(cleanup(generation)).to eq(:waiting)
      expect(generation.reload.state).to eq("cancel_requested")

      travel(4.minutes) { expect(cleanup(generation)).to eq(:done) }
    end

    it "古い試行の音声とjobも消す（記録が持つ現在のkey以外も、prefixと試行番号で拾う）" do
      generation.update!(upload_attempt: 2, transcription_attempt: 2)
      storage.objects["audio/#{generation.id}/2"] = { body: "audio" }
      transcriber.jobs["#{generation.id}-2"] = { status: :completed }

      cleanup(generation)

      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    end

    it "記録が持つkey・job名が命名規則と違っても、それも消す" do
      legacy_key = "transcripts/#{SecureRandom.uuid}/legacy.json"
      generation.update_columns(transcript_key: legacy_key, transcription_job_name: "legacy-job") # rubocop:disable Rails/SkipsModelValidations
      storage.objects[legacy_key] = { body: "{}" }
      transcriber.jobs["legacy-job"] = { status: :completed }

      cleanup(generation)

      expect([storage.objects.key?(legacy_key), transcriber.jobs.key?("legacy-job")]).to eq([false, false])
    end

    it "失敗したら、処理IDと例外の種類だけをログに残す" do
      transcriber.fail_next(:delete)

      log = captured_log { cleanup(generation) }

      expect(log).to include("generation cleanup deferred", generation.id, "GenerationProviders::Error")
    end

    it "既に消えている資源への再実行は成功として扱う" do
      storage.objects.clear
      transcriber.jobs.clear

      expect(cleanup(generation)).to eq(:done)
    end

    it "同じ記録への2本目の実行は何もしない（二重に後片付けしない）" do
      first = GenerationCleanup.perform(generation.id)
      expect([first, cleanup(generation)]).to eq(%i[done skipped])
    end
  end

  # T17（後片付けの再実行）とT22（Dotの完全削除・退会の受理）の競合。T22が優先し、cancel側の後片付けへ収束する。
  describe "T17とT22の競合" do
    let(:generation) do
      create(:generation, :transcribed, state: "succeeded_cleanup_pending", transcript_withheld_at: Time.current)
    end

    before { seed_resources(generation) }

    def accept_purge
      GenerationCancellation.request(user_id: generation.user_id, generation_id: generation.id, reason: "dot_purged")
    end

    it "T22が先: 以後の後片付けはcancel側（T19→T21）として進み、全文は返さない" do
      accept_purge

      expect(generation.reload.transcript_returnable?).to be(false)
      expect(cleanup(generation)).to eq(:done)
      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    end

    it "T17の実行中にT22: 実行中の後片付けは記録を消さず、cancel側の後片付けが終える" do
      storage.before_next(:delete_prefix) { accept_purge }

      expect(cleanup(generation)).to eq(:superseded)
      expect(generation.reload).to have_attributes(state: "cancel_requested", cancel_reason: "dot_purged")
      expect(generation.transcript_returnable?).to be(false)

      expect(cleanup(generation)).to eq(:done)
      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    end
  end
end
