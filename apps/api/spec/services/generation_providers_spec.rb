require "rails_helper"

RSpec.describe GenerationProviders do
  after { described_class.reset }

  it "呼び出し元のアカウントを確かめてから、東京・loggerなしのclientを作る" do
    allow(described_class::CallerAccountGuard).to receive(:verify!)
    allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
    described_class.reset

    client = described_class.storage.instance_variable_get(:@client)

    expect(described_class::CallerAccountGuard).to have_received(:verify!)
    expect(client.config).to have_attributes(region: "ap-northeast-1", logger: nil, http_wire_trace: false)
  end

  it "BedrockのclientはSDKに自動で再送させない（同じ生成を二重に消費しない）。環境変数で再送の方式や回数を変えても同じ" do
    allow(described_class::CallerAccountGuard).to receive(:verify!)
    allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("AWS_RETRY_MODE").and_return("adaptive")
    allow(ENV).to receive(:[]).with("AWS_MAX_ATTEMPTS").and_return("5")
    described_class.reset

    expect(described_class.composer.instance_variable_get(:@client).config).to have_attributes(retry_mode: "standard",
                                                                                               max_attempts: 1)
  end

  it "呼び出し元を確かめられなければclientを作らない（外部へ送らない）" do
    allow(described_class::CallerAccountGuard).to receive(:verify!).and_raise(described_class::CallerAccountGuard::Mismatch)
    allow(Aws::S3::Client).to receive(:new)
    described_class.reset

    expect { described_class.storage }.to raise_error(GenerationProviders::NotReady)
    expect(Aws::S3::Client).not_to have_received(:new)
  end

  it "認証情報が無ければ、外部へ送る準備ができていない失敗として返す" do
    allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
    allow(described_class::CallerAccountGuard).to receive(:verify!).and_raise(Aws::Errors::MissingCredentialsError)
    described_class.reset

    expect { described_class.transcriber }.to raise_error(GenerationProviders::NotReady) { expect(it.cause).to be_nil }
  end

  it "model idが未設定の間は、S3・Transcribeのclientも作らない（音声だけを外部へ送らない）" do
    allow(described_class::CallerAccountGuard).to receive(:verify!)
    allow(GenerationSettings).to receive(:bedrock_model_id).and_raise(GenerationSettings::NotConfigured)
    allow(Aws::S3::Client).to receive(:new)
    described_class.reset

    expect { described_class.storage }.to raise_error(GenerationProviders::NotReady)
    expect(described_class::CallerAccountGuard).not_to have_received(:verify!)
    expect(Aws::S3::Client).not_to have_received(:new)
  end

  describe GenerationProviders::CallerAccountGuard do
    let(:sts) { Aws::STS::Client.new(stub_responses: true, region: "ap-northeast-1") }

    before { described_class.reset }
    after { described_class.reset }

    def caller_account(account) = sts.stub_responses(:get_caller_identity, account:, arn: "arn", user_id: "u")

    it "呼び出し元が設定のアプリ用アカウントなら通し、以後は確かめ直さない" do
      allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
      caller_account("111111111111")

      2.times { described_class.verify!(sts:) }

      expect(sts.api_requests.size).to eq(1)
    end

    it "違うアカウントなら止める" do
      allow(GenerationSettings).to receive(:app_account_id).and_return("111111111111")
      caller_account("222222222222")

      expect { described_class.verify!(sts:) }.to raise_error(described_class::Mismatch)
    end

    it "比べる値が設定されていなければ、呼び出し元を確かめる前に止める" do
      expect { described_class.verify!(sts:) }.to raise_error(GenerationSettings::NotConfigured)
      expect(sts.api_requests).to be_empty
    end
  end
end
