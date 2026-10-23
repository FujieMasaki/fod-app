require "rails_helper"

# TASK-003 Plan §20の状態表のうち、cancel_requestedへ移る遷移（T3・T5・T7・T10・T13・T16・T22）を1本ずつ確かめる。
RSpec.describe "処理の記録の遷移: cancel_requestedへ" do # rubocop:disable RSpec/DescribeClass
  include ActiveJob::TestHelper

  def request(generation, reason)
    GenerationCancellation.request(user_id: generation.user_id, generation_id: generation.id, reason:)
  end

  def expect_canceled(generation, reason)
    expect(generation.reload).to have_attributes(state: "cancel_requested", cancel_reason: reason,
                                                 lease_token: nil, transcript_withheld_at: be_present)
    expect(GenerationCleanupJob).to have_been_enqueued.with(generation.id)
  end

  {
    "T3" => %w[uploading withdrawn],
    "T5" => %w[upload_failed canceled],
    "T7" => %w[accepted expired],
    "T10" => %w[transcribing withdrawn],
    "T13" => %w[generating canceled],
    "T16" => %w[failed expired]
  }.each do |id, (from, reason)|
    it "#{id}: #{from} → cancel_requested（#{reason}）。実行中の実行権を失効させる" do
      generation = create(:generation, state: from, lease_token: SecureRandom.uuid, lease_expires_at: 1.minute.from_now)

      request(generation, reason)

      expect_canceled(generation, reason)
    end
  end

  it "T22: succeeded_cleanup_pending → cancel_requested（Dotの完全削除）" do
    generation = create(:generation, :transcribed, state: "succeeded_cleanup_pending")

    request(generation, "dot_purged")

    expect_canceled(generation, "dot_purged")
  end

  it "T22: succeeded_cleanup_pending → cancel_requested（退会）" do
    generation = create(:generation, :transcribed, state: "succeeded_cleanup_pending")

    request(generation, "withdrawn")

    expect_canceled(generation, "withdrawn")
  end

  it "Dotを保存済みの記録は、処理の取り消し・期限では取り消さない" do
    generation = create(:generation, :transcribed, state: "succeeded_cleanup_pending")

    %w[canceled expired].each do |reason|
      expect { request(generation, reason) }.to raise_error(GenerationGate::Denied)
    end
    expect(generation.reload.state).to eq("succeeded_cleanup_pending")
  end

  it "取り消しの後に、実行権を失った実行は遷移できない" do
    generation = create(:generation, state: "generating", lease_token: SecureRandom.uuid)
    stale_token = generation.lease_token

    request(generation, "withdrawn")

    expect(Generation.transition(generation.id, from: "generating", to: "succeeded_cleanup_pending",
                                                holding: stale_token)).to be(false)
  end

  it "退会の受理後・期限切れでも受け付ける（cleanupにactive・期限内を求めない）" do
    user = create(:user, deletion_requested_at: Time.current, generation: 1)
    generation = create(:generation, user:, user_generation: 0, state: "failed", accepted_at: 30.hours.ago)

    request(generation, "withdrawn")

    expect(generation.reload.state).to eq("cancel_requested")
  end
end
