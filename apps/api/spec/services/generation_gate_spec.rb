require "rails_helper"

RSpec.describe GenerationGate do
  let(:generation) { create(:generation, state: "failed", failure_kind: "generation_failed") }

  def enter(from: "failed", to: "generating", user_id: generation.user_id, &)
    described_class.enter(user_id:, generation_id: generation.id, from:, to:, &)
  end

  it "遷移元と認可を確かめてから、実行権を発行して状態を移す" do
    entry = enter { nil }

    expect(entry.lease_token).to be_present
    expect(entry.generation).to have_attributes(state: "generating", lease_token: entry.lease_token,
                                                lease_expires_at: be > Time.current)
  end

  it "利用者の行をlockしてから確かめる" do
    allow(User).to receive(:lock).and_call_original

    enter

    expect(User).to have_received(:lock)
  end

  it "他人の処理は存在しない扱いにする（処理IDを知っていることを権限にしない）" do
    expect { enter(user_id: create(:user).id) }.to raise_error(GenerationGate::Denied) { expect(it.reason).to eq(:not_found) }
  end

  it "遷移元でなければ拒否し、何も書かない" do
    expect { enter(from: "accepted") }.to raise_error(GenerationGate::Denied) { expect(it.reason).to eq(:state) }
    expect(generation.reload.state).to eq("failed")
  end

  it "blockが理由を返したら拒否する" do
    expect { enter { :expired } }.to raise_error(GenerationGate::Denied) { expect(it.reason).to eq(:expired) }
    expect(generation.reload.state).to eq("failed")
  end

  describe ".proceed_denial" do
    def denial(generation) = described_class.proceed_denial(generation.user, generation)

    it "active・世代一致・期限内なら通す" do
      expect(denial(generation)).to be_nil
    end

    it "退会の受理後・世代のずれ・期限切れを拒否する" do
      withdrawn = create(:generation, user: create(:user, deletion_requested_at: Time.current))
      shifted = create(:generation, user_generation: 0, user: create(:user, generation: 1))
      expired = create(:generation, accepted_at: 25.hours.ago)

      expect([withdrawn, shifted, expired].map { denial(it) })
        .to eq(%i[account_deletion_in_progress generation_mismatch expired])
    end
  end
end
