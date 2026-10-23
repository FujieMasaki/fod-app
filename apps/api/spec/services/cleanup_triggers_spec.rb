require "rails_helper"

# cleanupの5つの契機（TASK-003 Plan §20の認可表）それぞれで、認可の条件・消す対象・他の処理への非波及を確かめる。
# 遷移テストだけでは網羅できない（ACKは状態遷移を伴わず、契機ごとに消す範囲が違うため）。
RSpec.describe "cleanupの5つの契機" do # rubocop:disable RSpec/DescribeClass
  include ActiveJob::TestHelper

  include_context "with fake generation providers"

  let(:user) { create(:user) }
  # 同じ利用者の別の録音（再試行待ち）。どの契機でも巻き込まないことを確かめる
  let!(:bystander) { create(:generation, :transcribed, user:, state: "failed", failure_kind: "generation_failed") }

  before { seed_resources(bystander) }

  def succeeded(owner = user)
    create(:generation, :transcribed, user: owner, state: "succeeded_cleanup_pending").tap do |generation|
      create(:dot, user: owner, generation_id: generation.id)
      seed_resources(generation)
    end
  end

  def expect_bystander_untouched
    expect([bystander.reload.state, resource_keys(bystander).size, job_names(bystander).size]).to eq(["failed", 2, 1])
  end

  it "成功の確定: 音声だけを消し、文字起こし結果とjobはACKまで残す" do
    generation = succeeded

    perform_enqueued_jobs { GenerationCleanupJob.perform_later(generation.id) }

    expect(resource_keys(generation)).to eq([generation.transcript_key])
    expect(job_names(generation)).to eq([generation.transcription_job_name])
    expect(generation.reload.transcript_returnable?).to be(true)
    expect_bystander_untouched
  end

  describe "ACKの受領" do
    it "文字起こし結果とjobを消し、受理の時点から全文を返さない。Dotは消さない" do
      generation = succeeded

      result = TranscriptAcknowledgement.acknowledge(user:, generation_id: generation.id)

      expect(result).to eq(:accepted)
      expect(generation.reload.transcript_returnable?).to be(false)
      perform_enqueued_jobs
      expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
      expect(user.dots.exists?(generation_id: generation.id)).to be(true)
      expect_bystander_untouched
    end

    it "認可は本人のDotと(user_id, 処理ID)の両方。他人の処理・ゴミ箱の中のDotは404" do
      other = succeeded(create(:user))
      trashed = succeeded.tap { Dot.find_by(generation_id: it.id).update!(trashed_at: Time.current) }

      expect(TranscriptAcknowledgement.acknowledge(user:, generation_id: other.id)).to eq(:not_found)
      expect(TranscriptAcknowledgement.acknowledge(user:, generation_id: trashed.id)).to eq(:not_found)
      expect(other.reload.transcript_withheld_at).to be_nil
    end

    it "Dotがまだ無い処理（生成中）にはACKを受け付けない" do
      expect(TranscriptAcknowledgement.acknowledge(user:, generation_id: bystander.id)).to eq(:not_found)
    end

    it "重複・後片付けの後に届いたACKも、本人の処理なら同じ結果にする" do
      generation = succeeded
      TranscriptAcknowledgement.acknowledge(user:, generation_id: generation.id)
      perform_enqueued_jobs

      expect(Generation.exists?(generation.id)).to be(false)
      expect(TranscriptAcknowledgement.acknowledge(user:, generation_id: generation.id)).to eq(:accepted)
    end
  end

  it "期限到来: その処理の全部を消す（期限内の他の処理は残す）" do
    expiring = create(:generation, :transcribed, user:, state: "failed", failure_kind: "generation_failed",
                                                 accepted_at: 25.hours.ago)
    seed_resources(expiring)

    perform_enqueued_jobs { GenerationExpiry.sweep }

    expect(Generation.exists?(expiring.id)).to be(false)
    expect([resource_keys(expiring), job_names(expiring)]).to eq([[], []])
    expect_bystander_untouched
  end

  it "期限到来: Dotを保存済みなら、全文を返さない印を付けて文字起こし結果とjobまで消す" do
    generation = succeeded

    travel(25.hours) { perform_enqueued_jobs { GenerationExpiry.sweep } }

    expect(Generation.exists?(generation.id)).to be(false)
    expect(resource_keys(generation)).to eq([])
    expect(user.dots.exists?(generation_id: generation.id)).to be(true)
  end

  it "Dotの完全削除: そのDotを作った処理の分だけを消す" do
    generation = succeeded

    perform_enqueued_jobs { GenerationDotPurge.accept(user:, dot: Dot.find_by(generation_id: generation.id)) }

    expect(Generation.exists?(generation.id)).to be(false)
    expect([resource_keys(generation), job_names(generation)]).to eq([[], []])
    expect(ConsumedRecordingAttempt.exists?(generation.id)).to be(false) # 2時間を過ぎたattemptは残さない
    expect_bystander_untouched
  end

  it "Dotの完全削除: 記録が先に消えていても、同じattemptで作り直されないよう使用済みにする" do
    dot = create(:dot, user:, started_at: 10.minutes.ago)

    GenerationDotPurge.accept(user:, dot:)

    expect(ConsumedRecordingAttempt.consumed?(dot.generation_id)).to be(true)
  end

  it "退会: 読んだ後に別の遷移が勝った記録があっても、受理全体を巻き戻さない" do
    allow(GenerationCancellation).to receive(:request).and_call_original
    allow(GenerationCancellation).to receive(:request)
      .with(hash_including(generation_id: bystander.id)).and_raise(GenerationGate::Denied, :state)

    GenerationWithdrawal.accept(user)

    expect(user.reload).to have_attributes(deletion_requested_at: be_present, generation: 1)
  end

  it "Dotの完全削除: 他人のDotは受け付けない" do
    other_dot = create(:dot)

    expect { GenerationDotPurge.accept(user:, dot: other_dot) }.to raise_error(ArgumentError)
  end

  it "退会: 本人の全処理の分を消し、他の利用者の処理には触れない。全部消えたら完了" do
    generation = succeeded
    other_user_generation = create(:generation, :transcribed, state: "failed", failure_kind: "generation_failed")
    seed_resources(other_user_generation)

    GenerationWithdrawal.accept(user)
    expect(GenerationWithdrawal.settled?(user)).to be(false)
    perform_enqueued_jobs

    expect([generation, bystander].map { resource_keys(it) }).to eq([[], []])
    expect(GenerationWithdrawal.settled?(user)).to be(true)
    expect(resource_keys(other_user_generation).size).to eq(2)
    expect(other_user_generation.reload.state).to eq("failed")
  end
end
