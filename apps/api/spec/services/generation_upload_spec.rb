require "rails_helper"

RSpec.describe GenerationUpload do
  include ActiveJob::TestHelper

  include_context "with fake generation providers"

  let(:user) { create(:user) }
  let(:issued) { RecordingAttemptToken.issue(user) }
  let(:attempt) { issued.first }
  let(:token) { issued.last }

  def upload(audio = uploaded_audio, as: user, with: token)
    reads = 0
    read_audio = lambda do
      reads += 1
      audio
    end
    result = described_class.call(user: as, token: with, read_audio:)
    [result, reads]
  end

  def generation = Generation.find(attempt.id)

  describe "受理（T1）" do
    it "記録を作ってから音声を置き、acceptedにして文字起こしをenqueueする" do
      result, = upload

      expect(result).to have_attributes(outcome: :created, generation_id: attempt.id)
      expect(generation).to have_attributes(state: "accepted", started_at: attempt.started_at, lease_token: nil,
                                            user_generation: 0)
      expect(generation.retry_expires_at).to be_within(1.second).of(24.hours.from_now)
      expect(storage.objects.keys).to eq(["audio/#{attempt.id}/1"])
      expect(GenerationTranscribeJob).to have_been_enqueued.with(attempt.id)
    end

    it "S3のkeyは処理IDとupload試行番号からserverが決める（利用者・日付を含まない）" do
      upload

      expect(generation.audio_key).to eq("audio/#{attempt.id}/1")
      expect(generation.audio_key).not_to include(user.id)
    end
  end

  it "T2: 音声を置けなければupload_failed（upload_incomplete）にし、既存の処理として返す" do
    storage.fail_next(:put)

    result, = upload

    expect(result.outcome).to eq(:existing)
    expect(generation).to have_attributes(state: "upload_failed", failure_kind: "upload_incomplete", lease_token: nil)
  end

  describe "PUTが失敗に見えたとき（応答を失っただけかもしれない）" do
    it "objectが完成していれば、送り直させずに確定へ進める" do
      allow(storage).to receive(:put).and_wrap_original do |original, *args, **opts|
        original.call(*args, **opts)
        raise GenerationProviders::Error, "response lost"
      end

      result, = upload

      expect(result.outcome).to eq(:created)
      expect(generation.state).to eq("accepted")
      expect(GenerationTranscribeJob).to have_been_enqueued.with(attempt.id)
    end

    it "実体を確かめられなければuploadingのまま残し、watchdogに任せる" do
      storage.fail_next(:put)
      storage.fail_next(:exists?)

      result, = upload

      expect(result.outcome).to eq(:existing)
      expect(generation.state).to eq("uploading")
    end
  end

  describe "再送（T4）" do
    before do
      storage.fail_next(:put)
      upload
    end

    it "upload_failedからは、新しい実行権と新しい試行番号のkeyで受け取り直す" do
      result, = upload

      expect(result.outcome).to eq(:created)
      expect(generation).to have_attributes(state: "accepted", upload_attempt: 2, audio_key: "audio/#{attempt.id}/2")
      expect(generation.started_at).to eq(attempt.started_at)
    end

    it "attemptの期限が切れていれば受け付けず、録り直しを案内する（再uploadの窓はattemptの期限を超えない）" do
      travel(2.hours + 1.second) do
        result, reads = upload

        expect([result.problem, reads]).to eq([:attempt_expired, 0])
        expect(generation.state).to eq("upload_failed")
      end
    end

    it "本文を読む間にattemptの期限が来ていれば、受け取り直さない" do
      read_audio = lambda do
        travel_to(attempt.expires_at + 1.second)
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result.problem).to eq(:attempt_expired)
      expect(generation).to have_attributes(state: "upload_failed", upload_attempt: 1)
    end
  end

  describe "同じattemptの再送（冪等）" do
    it "本文を読まずに既存の処理を返し、2件目の記録もJobも作らない" do
      upload
      clear_enqueued_jobs

      result, reads = upload

      expect([result.outcome, result.generation_id, reads]).to eq([:existing, attempt.id, 0])
      expect(Generation.count).to eq(1)
      expect(GenerationTranscribeJob).not_to have_been_enqueued
    end

    it "Dotを保存済みならそのまま返し、ゴミ箱の中なら不正として扱う" do
      create(:dot, user:, generation_id: attempt.id)
      result, reads = upload
      expect([result.outcome, reads]).to eq([:existing, 0])

      Dot.find_by(generation_id: attempt.id).update!(trashed_at: Time.current)
      expect(upload.first.problem).to eq(:attempt_invalid)
    end

    it "取り消し・完全削除・退会で消した後は作り直さない" do
      ConsumedRecordingAttempt.record(attempt.id, expires_at: attempt.expires_at)

      expect(upload.first.problem).to eq(:attempt_invalid)
      expect(Generation.exists?(attempt.id)).to be(false)
    end

    it "本文を読んでいる間に、先に届いた送信が保存と後片付けまで終えていても、記録を作り直さない" do
      read_audio = lambda do
        create(:dot, user:, generation_id: attempt.id)
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result).to have_attributes(outcome: :existing, generation_id: attempt.id)
      expect(Generation.exists?(attempt.id)).to be(false)
      expect(storage.objects).to be_empty
    end

    it "本文を読む間にattemptの期限が来ていれば、使用済みの記録が消えていても作らない" do
      read_audio = lambda do
        travel_to(attempt.expires_at + 1.second)
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result.problem).to eq(:attempt_expired)
      expect(Generation.exists?(attempt.id)).to be(false)
    end

    it "同時に届いた送信は、主キーの一意制約で1件に絞って既存を返す" do
      # 既存の処理を確かめた後（本文を読んでいる間）に、先に届いた側が記録を作る
      read_audio = lambda do
        create(:generation, id: attempt.id, user:)
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result).to have_attributes(outcome: :existing, problem: nil)
      expect(Generation.where(id: attempt.id).count).to eq(1)
    end
  end

  describe "本文を読んでいる間に、同じattemptの処理が取り消された" do
    it "取り消しと後片付けが終わって記録が消えていても、使用済みのattemptとして作り直さない" do
      read_audio = lambda do
        ConsumedRecordingAttempt.record(attempt.id, expires_at: attempt.expires_at)
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result.problem).to eq(:attempt_invalid)
      expect(Generation.exists?(attempt.id)).to be(false)
    end

    it "先に届いた側の記録が取り消し済みなら、既存の処理として返さない" do
      read_audio = lambda do
        create(:generation, id: attempt.id, user:, state: "cancel_requested", cancel_reason: "canceled")
        uploaded_audio
      end

      result = described_class.call(user:, token:, read_audio:)

      expect(result.problem).to eq(:attempt_invalid)
    end
  end

  it "別の利用者のattempt・改ざんしたattemptは、本文を読まずに不正として拒否する" do
    result, reads = upload(as: create(:user))
    expect([result.problem, reads]).to eq([:attempt_invalid, 0])
    expect(upload(with: "#{token}x").first.problem).to eq(:attempt_invalid)
  end

  it "attemptの期限が切れていれば受け付けない" do
    token
    travel(2.hours + 1.second) { expect(upload.first.problem).to eq(:attempt_expired) }
  end

  it "形式・大きさ・録音時間の問題は、記録を作らずに返す" do
    expect(upload(uploaded_audio(size: 33.megabytes)).first.problem).to eq(:audio_too_large)
    expect(upload(nil).first.problem).to eq(:validation_failed)
    expect(Generation.exists?(attempt.id)).to be(false)
  end

  it "退会の受理後は記録を作らない" do
    user.update!(deletion_requested_at: Time.current)

    expect(upload.first.problem).to eq(:account_deletion_in_progress)
    expect(Generation.exists?(attempt.id)).to be(false)
  end

  it "T3: 音声を置いている間に退会を受理したら、置いた音声を消して取り消しへ回す（record-first）" do
    storage.before_next(:put) { GenerationWithdrawal.accept(user) }

    result, = upload

    expect(result.problem).to eq(:account_deletion_in_progress)
    expect(storage.objects).to be_empty
    expect(generation).to have_attributes(state: "cancel_requested", cancel_reason: "withdrawn")
    expect(GenerationTranscribeJob).not_to have_been_enqueued
  end

  it "音声を置いている間に利用者が取り消したら、置いた音声を消して、もう使えないattemptとして答える" do
    storage.before_next(:put) { GenerationCancellation.cancel_by_user(user:, generation_id: attempt.id) }

    result, = upload

    expect(result.problem).to eq(:attempt_invalid)
    expect(storage.objects).to be_empty
    expect(GenerationTranscribeJob).not_to have_been_enqueued
  end

  it "T3: 記録が消えた後に音声が置かれても、手元のprefixで消す" do
    storage.before_next(:put) do
      GenerationWithdrawal.accept(user)
      Generation.where(id: attempt.id).delete_all
    end

    upload

    expect(storage.objects).to be_empty
  end

  describe "置いている間に実行権を失った（PUTが実行権の期限とwatchdogの猶予を超えた）" do
    let(:late) { (GenerationUpload::LEASE_DURATION + GenerationWatchdog::STALE_AFTER + 1.second).from_now }

    it "watchdogがupload_failedにした後に再送された音声を、古いPUTの後始末で消さない" do
      storage.before_next(:put) do
        GenerationWatchdog.sweep(now: late)
        expect(upload.first.outcome).to eq(:created)
      end

      result, = upload

      expect(result.outcome).to eq(:existing)
      expect(generation).to have_attributes(state: "accepted", upload_attempt: 2)
      expect(storage.keys).to include(generation.audio_key)
    end

    it "止まっていた古い要求が、再送された試行のkeyへ古い音声を上書きしない" do
      interrupted = false
      allow(GenerationUploadCompletion).to receive(:put).and_wrap_original do |original, *args|
        unless interrupted
          interrupted = true
          GenerationWatchdog.sweep(now: late)
          expect(upload(uploaded_audio(body: "#{UploadHelpers::WEBM_HEAD}new")).first.outcome).to eq(:created)
        end
        original.call(*args)
      end

      result, = upload(uploaded_audio(body: "#{UploadHelpers::WEBM_HEAD}old"))

      expect(result.outcome).to eq(:existing)
      expect(generation).to have_attributes(state: "accepted", upload_attempt: 2)
      expect(storage.objects.transform_values { it[:body] }).to eq(generation.audio_key => "#{UploadHelpers::WEBM_HEAD}new")
    end

    it "置き終わった音声をwatchdogが確定した後も、古い要求の後始末で消さない" do
      storage.before_next(:put) do
        storage.objects[generation.audio_key] = { body: "audio" }
        GenerationWatchdog.sweep(now: late)
      end

      result, = upload

      expect(result.outcome).to eq(:existing)
      expect(generation.state).to eq("accepted")
      expect(storage.keys).to include(generation.audio_key)
    end
  end
end
