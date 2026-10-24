require "rails_helper"

# TASK-003 Plan §20の状態表のうち、受理から保存までの遷移（T6・T8・T9・T11・T12・T14・T15）を1本ずつ確かめる。
# T1・T2・T3・T4はGenerationUploadのspec、それ以外のcancel_requestedへの遷移と後片付けは同じディレクトリの別のspec。
RSpec.describe "処理の記録の遷移: 受理から保存まで" do # rubocop:disable RSpec/DescribeClass
  include ActiveJob::TestHelper

  include_context "with fake generation providers"

  let(:user) { create(:user) }

  def transcribing(**attrs)
    create(:generation, :transcribing, user:, **attrs).tap { |generation| seed_resources(generation) }
  end

  def complete_transcription(generation, text = "今日は朝に近所を散歩した")
    transcriber.jobs[generation.transcription_job_name] =
      { status: :in_progress, output_key: generation.transcript_key }
    transcriber.complete(generation.transcription_job_name, text)
  end

  def generating(**attrs)
    transcribing(**attrs).tap do |generation|
      complete_transcription(generation)
      generation.update!(state: "generating", transcript_ready_at: Time.current)
    end
  end

  it "T6: accepted → transcribing。試行番号を進め、自前のbucketへ書き出すjobを始めて完了待ちをenqueueする" do
    generation = create(:generation, user:, state: "accepted").tap { seed_resources(it) }

    expect(GenerationTranscription.start(generation.id)).to eq(:started)

    expect(generation.reload).to have_attributes(state: "transcribing", transcription_attempt: 1,
                                                 transcription_job_name: "#{generation.id}-1",
                                                 transcript_key: "transcripts/#{generation.id}/1.json")
    expect(transcriber.jobs[generation.transcription_job_name])
      .to include(media_key: generation.audio_key, output_key: generation.transcript_key)
    expect(GenerationTranscriptionCheckJob).to have_been_enqueued.with(generation.id)
  end

  describe "T8: transcribing → generating" do
    it "Transcribeが終端したら入口を通して生成へ進み、生成をenqueueする" do
      generation = transcribing
      complete_transcription(generation)

      expect(GenerationTranscription.check(generation.id)).to eq(:generating)
      expect(generation.reload).to have_attributes(state: "generating", transcript_ready_at: be_present)
      expect(GenerationComposeJob).to have_been_enqueued.with(generation.id)
    end

    it "終端の後、Bedrockへ送る前に退会を受理していれば、生成へ進まず後片付けへ回す（T10）" do
      generation = transcribing
      complete_transcription(generation)
      user.update!(deletion_requested_at: Time.current, generation: 1)

      expect(GenerationTranscription.check(generation.id)).to eq(:canceled)
      expect(generation.reload).to have_attributes(state: "cancel_requested", cancel_reason: "withdrawn")
      expect(GenerationComposeJob).not_to have_been_enqueued
    end
  end

  describe "T9: transcribing → failed" do
    it "Transcribeが失敗したら、再試行できる失敗にする" do
      generation = transcribing
      transcriber.jobs[generation.transcription_job_name] = { status: :failed }

      GenerationTranscription.check(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "transcription_failed")
      expect(generation.contract_failure_kind).to eq("processing_failed")
    end

    it "文字起こしが空（無音・極端に短い）なら生成へ進まず、録り直しの失敗にする" do
      generation = transcribing
      complete_transcription(generation, " 。 ")

      GenerationTranscription.check(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "empty_recording")
      expect(composer.calls).to be_empty
    end
  end

  describe "完了待ちで外部が失敗したとき" do
    it "一時的な失敗なら、記録を変えずに次の確認を積み直す" do
      generation = transcribing
      transcriber.fail_next(:status)

      expect(GenerationTranscription.check(generation.id)).to eq(:waiting)
      expect(generation.reload.state).to eq("transcribing")
      expect(GenerationTranscriptionCheckJob).to have_been_enqueued.with(generation.id)
    end

    it "設定の不足・呼び出し元の違いは待っても直らないので、すぐ失敗にする" do
      generation = transcribing
      allow(transcriber).to receive(:status).and_raise(GenerationProviders::NotReady, "not ready")

      GenerationTranscription.check(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "transcription_failed")
    end

    it "文字起こしを始めてから上限の時間を過ぎても失敗が続けば、失敗にする" do
      generation = transcribing(last_progress_at: (GenerationTranscription::GIVE_UP_AFTER + 1.minute).ago)
      transcriber.fail_next(:status)

      GenerationTranscription.check(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "transcription_failed")
      expect(GenerationTranscriptionCheckJob).not_to have_been_enqueued
    end

    it "終端した結果がTranscribeの形でなければ、文字起こしの失敗にする" do
      generation = transcribing
      complete_transcription(generation)
      storage.objects[generation.transcript_key] = { body: "not json" }

      GenerationTranscription.check(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "transcription_failed")
      expect(GenerationComposeJob).not_to have_been_enqueued
    end
  end

  describe "T11: generating → succeeded_cleanup_pending" do
    it "Dotの保存と記録の更新を同じtransactionで行い、音声の後片付けをenqueueする" do
      generation = generating

      expect(GenerationComposition.perform(generation.id)).to eq(:succeeded)

      dot = user.dots.find_by!(generation_id: generation.id)
      expect(dot).to have_attributes(started_at: generation.started_at, duration_seconds: 120,
                                     sentence: composer.output["sentence"], summary: composer.output["summary"])
      expect(generation.reload.state).to eq("succeeded_cleanup_pending")
      expect(GenerationCleanupJob).to have_been_enqueued.with(generation.id)
    end

    it "生成には全文・録音日・録音時間だけを渡す" do
      generation = generating

      GenerationComposition.perform(generation.id)

      expect(composer.calls.sole).to eq(transcript: "今日は朝に近所を散歩した",
                                        date: Dot.date_for(generation.started_at), duration_seconds: 120)
    end

    it "保存の直前に退会を受理していれば、Dotを保存しない（世代番号の確認とinsertを同じtransactionで行う）" do
      generation = generating
      composer.before_next(:compose) { GenerationWithdrawal.accept(user) }

      GenerationComposition.perform(generation.id)

      expect(user.dots).to be_empty
      expect(generation.reload.state).to eq("cancel_requested")
    end
  end

  it "T11の直前に取り消された（実行権を失った）なら、Dotのinsertを巻き戻して保存しない" do
    generation = generating
    composer.before_next(:compose) { GenerationCancellation.cancel_by_user(user:, generation_id: generation.id) }

    expect(GenerationComposition.perform(generation.id)).to eq(:skipped)
    expect(user.dots).to be_empty
    expect(generation.reload).to have_attributes(state: "cancel_requested", cancel_reason: "canceled")
  end

  it "文字起こしを始める直前に取り消されたら、音声を送らない" do
    generation = create(:generation, user:, state: "accepted").tap { seed_resources(it) }
    allow(Generation).to receive(:exists?).and_wrap_original do |original, *args, **kwargs|
      GenerationCancellation.cancel_by_user(user:, generation_id: generation.id)
      original.call(*args, **kwargs)
    end

    expect(GenerationTranscription.start(generation.id)).to eq(:canceled)
    expect(transcriber.started).to be_empty
  end

  describe "T12: generating → failed（失敗の種類を分ける）" do
    it "外部AIの失敗" do
      generation = generating
      composer.fail_next(:compose)

      GenerationComposition.perform(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "generation_failed")
    end

    [nil, {}, { "sentence" => "", "summary" => "x" }, { "sentence" => "あ" * 201, "summary" => "x" },
     { "sentence" => "a\u0000", "summary" => "x" }, { "sentence" => "x", "summary" => "あ" * 2001 }].each do |output|
      it "生成結果が検証を通らない（#{output.inspect.truncate(40)}）" do
        generation = generating
        composer.output = output

        GenerationComposition.perform(generation.id)

        expect(generation.reload).to have_attributes(state: "failed", failure_kind: "invalid_output")
        expect(user.dots).to be_empty
      end
    end

    it "保存の失敗。未保存なのに保存済みと返さない" do
      generation = generating
      allow(Dot).to receive(:new).and_raise(ActiveRecord::StatementInvalid)

      GenerationComposition.perform(generation.id)

      expect(generation.reload).to have_attributes(state: "failed", failure_kind: "persist_failed")
      expect(Dot.where(generation_id: generation.id)).to be_empty
    end
  end

  it "生成の前に全文が読めなければ、全文の印を外して失敗にする（次の再試行を文字起こしから行う）" do
    generation = generating
    storage.objects.delete(generation.transcript_key)

    GenerationComposition.perform(generation.id)

    expect(generation.reload).to have_attributes(state: "failed", failure_kind: "transcription_failed",
                                                 transcript_ready_at: nil)
    expect(composer.calls).to be_empty
  end

  describe "再試行" do
    it "T14: 全文が無ければ、failed → transcribingで次の試行番号から文字起こしをやり直す" do
      generation = transcribing(state: "failed", failure_kind: "transcription_failed")

      expect(GenerationRetry.call(user:, generation_id: generation.id)).to eq(:accepted)
      expect(generation.reload).to have_attributes(state: "transcribing", transcription_attempt: 2,
                                                   transcription_job_name: "#{generation.id}-2", failure_kind: nil)
      expect(GenerationTranscribeJob).to have_been_enqueued.with(generation.id)
    end

    it "T15: 全文が残っていれば、failed → generatingで生成からやり直す（Transcribeを再実行しない）" do
      generation = transcribing(state: "failed", failure_kind: "generation_failed", transcript_ready_at: Time.current)

      expect(GenerationRetry.call(user:, generation_id: generation.id)).to eq(:accepted)
      expect(generation.reload).to have_attributes(state: "generating", transcription_attempt: 1)
      expect(GenerationComposeJob).to have_been_enqueued.with(generation.id)
    end
  end
end
