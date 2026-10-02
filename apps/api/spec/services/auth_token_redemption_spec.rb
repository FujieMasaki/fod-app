require "rails_helper"

RSpec.describe AuthTokenRedemption do
  describe "#reset_password" do
    let(:user) { create(:user) }
    let(:token) { user.send(:set_reset_password_token) }

    it "行lockを取ってから再設定tokenで利用者を探す（同時の2つのrequestを直列にする）" do
      token
      allow(User).to receive(:lock).and_call_original

      described_class.new(token:).reset_password("brand new password")

      expect(User).to have_received(:lock)
    end

    it "成功すると再設定tokenを消し、同じtokenの2回目はtoken_invalid" do
      first = described_class.new(token:).reset_password("brand new password")
      second = described_class.new(token:).reset_password("another new password")

      expect([first.status, second.status]).to eq(%i[ok token_invalid])
      expect(user.reload.reset_password_token).to be_nil
      expect(user.valid_password?("brand new password")).to be(true)
    end

    it "空のtokenは、tokenを持たない利用者に一致しない" do
      user

      expect(described_class.new(token: "").reset_password("brand new password").status).to eq(:token_invalid)
    end
  end
end
