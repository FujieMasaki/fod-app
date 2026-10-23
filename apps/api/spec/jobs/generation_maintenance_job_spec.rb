require "rails_helper"

RSpec.describe GenerationMaintenanceJob do
  include ActiveJob::TestHelper

  it "期限の到来した処理を後片付けへ回す" do
    expired = create(:generation, state: "failed", accepted_at: 25.hours.ago)

    described_class.perform_now

    expect(expired.reload).to have_attributes(state: "cancel_requested", cancel_reason: "expired")
  end

  it "再実行が要る後片付けだけを拾い直す" do
    lapsed = create(:generation, state: "cleanup_pending", lease_token: SecureRandom.uuid,
                                 lease_expires_at: 1.second.ago)
    running = create(:generation, state: "cleanup_pending", lease_token: SecureRandom.uuid,
                                  lease_expires_at: 1.minute.from_now)
    waiting_for_ack = create(:generation, :transcribed, state: "succeeded_cleanup_pending")
    acknowledged = create(:generation, :transcribed, state: "succeeded_cleanup_pending",
                                                     transcript_withheld_at: Time.current)

    described_class.perform_now

    enqueued = enqueued_jobs.select { it["job_class"] == "GenerationCleanupJob" }.map { it["arguments"].first }
    expect(enqueued).to contain_exactly(lapsed.id, acknowledged.id)
    expect(enqueued).not_to include(running.id, waiting_for_ack.id)
  end

  it "期限の過ぎた使用済みattemptを消す" do
    ConsumedRecordingAttempt.create!(id: SecureRandom.uuid, expires_at: 1.second.ago)
    live = ConsumedRecordingAttempt.create!(id: SecureRandom.uuid, expires_at: 1.hour.from_now)

    described_class.perform_now

    expect(ConsumedRecordingAttempt.pluck(:id)).to eq([live.id])
  end

  it "定期実行に登録されている" do
    recurring = YAML.load(Rails.root.join("config/recurring.yml").read, aliases: true)

    expect(recurring.dig("production", "generation_maintenance", "class")).to eq(described_class.name)
  end
end
