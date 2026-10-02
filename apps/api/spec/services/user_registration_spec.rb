require "rails_helper"

RSpec.describe UserRegistration do
  let(:password) { "correct horse battery" }

  it "検索の後に同じメールアドレスが保存され、保存時のvalidation（taken）で失敗したら、既登録として案内メールを送る" do
    existing = create(:user, email: "same@example.com")
    # 自分の検索の時点ではまだ無く、保存の直前に別のrequestが保存した状況を作る（save!は本物のまま）。
    allow(User).to receive(:find_for_authentication).and_return(nil, existing)

    result = perform_enqueued_jobs { described_class.new(email: "same@example.com", password:, ip: "192.0.2.1").call }

    expect(result.status).to eq(:accepted)
    expect(ActionMailer::Base.deliveries.last.subject).to include("登録済み")
  end

  it "保存がemailの重複以外のvalidationで失敗したら、隠さずに投げ直す" do
    allow(User).to receive(:find_for_authentication).and_return(nil)
    allow_any_instance_of(User).to receive(:save!) do |user| # rubocop:disable RSpec/AnyInstance
      user.errors.add(:base, :invalid)
      raise ActiveRecord::RecordInvalid, user
    end

    expect { described_class.new(email: "new@example.com", password:, ip: "192.0.2.1").call }
      .to raise_error(ActiveRecord::RecordInvalid)
  end

  it "同じメールアドレスの登録が同時に届き、保存が一意制約に当たったら、既登録として案内メールを送る" do
    existing = create(:user, email: "same@example.com")
    allow(User).to receive(:find_for_authentication).and_return(nil, existing)
    allow_any_instance_of(User).to receive(:save!).and_raise(ActiveRecord::RecordNotUnique) # rubocop:disable RSpec/AnyInstance

    result = perform_enqueued_jobs { described_class.new(email: "same@example.com", password:, ip: "192.0.2.1").call }

    expect(result.status).to eq(:accepted)
    expect(ActionMailer::Base.deliveries.last.subject).to include("登録済み")
  end
end
