require "rails_helper"

RSpec.describe User do
  it "メールアドレスを小文字・前後の空白なしで保存し、大文字小文字違いの重複を拒否する" do
    user = create(:user, email: " Person@Example.COM ")

    expect(user.email).to eq("person@example.com")
    expect(build(:user, email: "PERSON@example.com")).not_to be_valid
  end

  it "passwordは8〜128文字" do
    expect(%w[1234567 12345678].map { build(:user, password: it).valid? }).to eq([false, true])
    expect([build(:user, password: "a" * 128).valid?, build(:user, password: "a" * 129).valid?]).to eq([true, false])
  end

  it "Googleの利用者だけはpasswordなしで作れる" do
    expect(build(:user, :google_only)).to be_valid
    expect(build(:user, password: nil)).not_to be_valid
  end

  it "同じGoogleの利用者を2人に対応付けない" do
    create(:user, :google_only, google_uid: "same")

    expect { create(:user, :google_only, google_uid: "same") }.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "ログインの手段を返す" do
    expect([create(:user).sign_in_methods, create(:user, :google_only).sign_in_methods])
      .to eq([["password"], ["google"]])
  end
end
