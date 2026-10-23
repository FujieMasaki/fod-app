require "rails_helper"

RSpec.describe GenerationRetry do
  include ActiveJob::TestHelper

  let(:user) { create(:user) }

  def retry_generation(generation) = described_class.call(user:, generation_id: generation.id)

  it "attemptが使用済み・期限切れでも、受理後の再試行は処理の記録で認可する。started_atは変えない" do
    generation = create(:generation, user:, state: "failed", failure_kind: "generation_failed",
                                     transcript_ready_at: Time.current, started_at: 3.hours.ago)

    started_at = generation.reload.started_at

    expect(retry_generation(generation)).to eq(:accepted)
    expect(generation.reload.started_at).to eq(started_at)
  end

  it "録り直しが要る失敗は再試行させない" do
    upload = create(:generation, user:, state: "failed", failure_kind: "upload_incomplete")
    empty = create(:generation, user:, state: "failed", failure_kind: "empty_recording")

    expect([retry_generation(upload), retry_generation(empty)]).to all(eq(:retry_not_allowed))
  end

  it "期限を過ぎていれば受け付けない（期限到来で後片付けに入った記録も同じ）" do
    expired = create(:generation, user:, state: "failed", failure_kind: "generation_failed", accepted_at: 25.hours.ago)
    swept = create(:generation, user:, state: "cleanup_pending", cancel_reason: "expired", accepted_at: 25.hours.ago)

    expect([retry_generation(expired), retry_generation(swept)]).to eq(%i[retry_expired retry_expired])
  end

  it "失敗していない処理・Dotを保存済みの処理は再試行しない" do
    running = create(:generation, user:, state: "transcribing")
    saved = create(:dot, user:)

    expect(retry_generation(running)).to eq(:retry_not_allowed)
    expect(described_class.call(user:, generation_id: saved.generation_id)).to eq(:retry_not_allowed)
  end

  it "他人の処理・取り消した処理・ゴミ箱の中のDotの処理は404" do
    others = create(:generation, state: "failed", failure_kind: "generation_failed")
    canceled = create(:generation, user:, state: "cancel_requested", cancel_reason: "canceled")
    trashed = create(:dot, :trashed, user:)

    expect([others.id, canceled.id, trashed.generation_id].map { described_class.call(user:, generation_id: it) })
      .to all(eq(:not_found))
  end

  it "退会の受理後は受け付けない" do
    generation = create(:generation, user:, state: "failed", failure_kind: "generation_failed")
    user.update!(deletion_requested_at: Time.current)

    expect(retry_generation(generation)).to eq(:account_deletion_in_progress)
  end

  it "再試行と取り消しが同じ記録を奪い合っても、片方だけが勝つ" do
    generation = create(:generation, user:, state: "failed", failure_kind: "generation_failed")
    GenerationCancellation.request(user_id: user.id, generation_id: generation.id, reason: "canceled")

    expect(retry_generation(generation)).to eq(:not_found)
    expect(generation.reload.state).to eq("cancel_requested")
  end
end
