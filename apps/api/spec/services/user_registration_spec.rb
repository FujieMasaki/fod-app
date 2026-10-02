require "rails_helper"

RSpec.describe UserRegistration do
  let(:password) { "correct horse battery" }

  it "同じメールアドレスの登録が同時に届き、保存が一意制約に当たったら、既登録として案内メールを送る" do
    existing = create(:user, email: "same@example.com")
    allow(User).to receive(:find_for_authentication).and_return(nil, existing)
    allow_any_instance_of(User).to receive(:save!).and_raise(ActiveRecord::RecordNotUnique) # rubocop:disable RSpec/AnyInstance

    result = perform_enqueued_jobs { described_class.new(email: "same@example.com", password:, ip: "192.0.2.1").call }

    expect(result.status).to eq(:accepted)
    expect(ActionMailer::Base.deliveries.last.subject).to include("登録済み")
  end
end
