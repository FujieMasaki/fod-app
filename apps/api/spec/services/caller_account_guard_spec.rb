require "rails_helper"

RSpec.describe CallerAccountGuard do
  let(:sts) { Aws::STS::Client.new(stub_responses: true, region: "ap-northeast-1") }

  before { described_class.reset }
  after { described_class.reset }

  def caller_account(account) = sts.stub_responses(:get_caller_identity, account:, arn: "arn", user_id: "u")

  it "呼び出し元が設定のアプリ用アカウントなら通し、以後は確かめ直さない" do
    allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
    caller_account("111111111111")

    described_class.verify!(sts:)
    described_class.verify!(sts:)

    expect(sts.api_requests.size).to eq(1)
  end

  it "違うアカウントなら止める" do
    allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
    caller_account("222222222222")

    expect { described_class.verify!(sts:) }.to raise_error(CallerAccountGuard::Mismatch)
  end

  it "比べる値が設定されていなければ、呼び出し元を確かめる前に止める" do
    expect { described_class.verify!(sts:) }.to raise_error(GenerationSettings::NotConfigured)
    expect(sts.api_requests).to be_empty
  end
end
