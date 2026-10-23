require "rails_helper"

# 利用者による処理の取り消し（architecture「処理の取り消し」）
RSpec.describe GenerationCancellation do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }

  def cancel(generation_id) = described_class.cancel_by_user(user:, generation_id:)

  it "Dotがまだ無い処理を取り消し、同じattemptで作り直されないようattemptを期限まで残す" do
    generation = create(:generation, user:, state: "transcribing", started_at: 10.minutes.ago)

    expect(cancel(generation.id)).to eq(:accepted)
    expect(generation.reload).to have_attributes(state: "cancel_requested", cancel_reason: "canceled")
    expect(ConsumedRecordingAttempt.consumed?(generation.id)).to be(true)
    expect(GenerationCleanupJob).to have_been_enqueued.with(generation.id)
  end

  it "期限到来で後片付けに入った処理も、状態を変えずに取り消しとして受け付ける" do
    generation = create(:generation, user:, state: "cleanup_pending", cancel_reason: "expired")

    expect(cancel(generation.id)).to eq(:accepted)
    expect(generation.reload).to have_attributes(state: "cleanup_pending", cancel_reason: "canceled")
  end

  it "取り消し済み・退会・完全削除で後片付け中の処理、存在しない処理、他人の処理は404" do
    canceled, withdrawn, purged = %w[canceled withdrawn dot_purged].map do |reason|
      create(:generation, user:, state: "cancel_requested", cancel_reason: reason)
    end
    others = create(:generation, state: "failed")

    expect([canceled, withdrawn, purged, others].map { cancel(it.id) } + [cancel(SecureRandom.uuid)])
      .to all(eq(:not_found))
    expect([withdrawn, purged].map { it.reload.cancel_reason }).to eq(%w[withdrawn dot_purged])
    expect(others.reload.state).to eq("failed")
  end

  it "Dotの保存まで終わった処理は取り消さない。ゴミ箱の中のDotは示さない" do
    kept = create(:dot, user:)
    trashed = create(:dot, :trashed, user:)

    expect([cancel(kept.generation_id), cancel(trashed.generation_id)]).to eq(%i[generation_completed not_found])
  end

  it "成功の確定が先に勝ったときは、取り消さずに完了を返す" do
    generation = create(:generation, user:, state: "generating")
    allow(GenerationGate).to receive(:enter).and_wrap_original do |original, **args, &block|
      Generation.transition(generation.id, from: "generating", to: "succeeded_cleanup_pending")
      original.call(**args, &block)
    end

    expect(cancel(generation.id)).to eq(:generation_completed)
    expect(generation.reload.state).to eq("succeeded_cleanup_pending")
  end

  it "退会の受理と並んだときは、利用者の行をlockした後に確かめて受け付けない" do
    generation = create(:generation, user:, state: "failed")
    allow(GenerationGate).to receive(:enter).and_wrap_original do |original, **args, &block|
      User.where(id: user.id).update_all(deletion_requested_at: Time.current) # rubocop:disable Rails/SkipsModelValidations
      original.call(**args, &block)
    end

    expect(cancel(generation.id)).to eq(:account_deletion_in_progress)
    expect(generation.reload.state).to eq("failed")
  end

  it "退会の受理後は受け付けない" do
    user.update!(deletion_requested_at: Time.current)

    expect(cancel(create(:generation, user:).id)).to eq(:account_deletion_in_progress)
  end
end
