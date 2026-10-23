require "rails_helper"

RSpec.describe GenerationProviders do
  after { described_class.reset }

  it "呼び出し元のアカウントを確かめてから、東京・loggerなしのclientを作る" do
    allow(CallerAccountGuard).to receive(:verify!)
    described_class.reset

    client = described_class.storage.instance_variable_get(:@client)

    expect(CallerAccountGuard).to have_received(:verify!)
    expect(client.config).to have_attributes(region: "ap-northeast-1", logger: nil, http_wire_trace: false)
  end

  it "呼び出し元を確かめられなければclientを作らない（外部へ送らない）" do
    allow(CallerAccountGuard).to receive(:verify!).and_raise(CallerAccountGuard::Mismatch)
    allow(Aws::S3::Client).to receive(:new)
    described_class.reset

    expect { described_class.storage }.to raise_error(CallerAccountGuard::Mismatch)
    expect(Aws::S3::Client).not_to have_received(:new)
  end
end
