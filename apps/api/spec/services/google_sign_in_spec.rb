require "rails_helper"

RSpec.describe GoogleSignIn do
  def auth(uid: "google-uid", email: "person@example.com", email_verified: true)
    OmniAuth::AuthHash.new(uid:, extra: { raw_info: { sub: uid, email:, email_verified: } })
  end

  describe "#sign_in" do
    it "同じGoogleの利用者のcallbackが同時に届き、作成が一意制約に当たったら、先に作られた利用者へloginする" do
      winner = create(:user, :google_only, google_uid: "google-uid", email: "winner@example.com")
      # 自分の検索の時点ではまだ無く、作成で一意制約に当たった状況を作る。
      allow(UserIdentity).to receive(:includes).and_wrap_original do |original, *args|
        allow(UserIdentity).to receive(:includes).and_call_original
        original.call(*args).where.not(user_id: winner.id)
      end

      result = described_class.new(auth(email: "loser@example.com")).sign_in

      expect(result.status).to eq(:ok)
      expect(result.user).to eq(winner)
    end

    it "loginできない状態の利用者には、identityが一致してもloginしない" do
      user = create(:user, :google_only, google_uid: "google-uid")
      user.lock_access!(send_instructions: false)

      expect(described_class.new(auth).sign_in.status).to eq(:failed)
    end

    it "一意制約に当たったのがメールアドレスなら、どの利用者にもloginしない" do
      allow(User).to receive(:create!).and_raise(ActiveRecord::RecordNotUnique)

      expect(described_class.new(auth).sign_in.status).to eq(:failed)
    end
  end
end
