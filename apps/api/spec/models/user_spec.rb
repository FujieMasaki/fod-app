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

  it "72 byteより後ろだけが違うpasswordを一致させない（bcryptの切り詰め）" do
    user = create(:user, password: "#{'a' * 72}secret")

    expect(user.valid_password?("#{'a' * 72}wrong!")).to be(false)
    expect(user.valid_password?("#{'a' * 72}secret")).to be(true)
  end

  it "日本語でも25文字目以降の違いを区別する" do
    user = create(:user, password: "#{'あ' * 24}秘密")

    expect([user.valid_password?("#{'あ' * 24}別物"), user.valid_password?("#{'あ' * 24}秘密")]).to eq([false, true])
  end

  it "passwordでない値は一致させない" do
    expect([nil, 123].map { create(:user).valid_password?(it) }).to eq([false, false])
  end

  it "空白だけのpasswordも文字として受け付ける（文字種を問わない）。空文字は拒否する" do
    expect([build(:user, password: " " * 8).valid?, build(:user, password: "").valid?]).to eq([true, false])
  end

  it "空白だけのpasswordもhashを保存し、そのpasswordで照合できる" do
    user = create(:user, password: " " * 8)

    expect(user.reload).to be_password_user
    expect([user.valid_password?(" " * 8), user.valid_password?(" " * 9)]).to eq([true, false])
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
