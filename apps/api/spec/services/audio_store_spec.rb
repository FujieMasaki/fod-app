require "rails_helper"

RSpec.describe AudioStore do
  let(:client) { Aws::S3::Client.new(stub_responses: true, region: "ap-northeast-1") }
  let(:store) { described_class.new(client:, bucket: "bucket") }

  it "指定したbucketとkeyへ置く" do
    store.put("audio/x/1", "bytes", content_type: "audio/webm")

    expect(client.api_requests.last[:params]).to include(bucket: "bucket", key: "audio/x/1", content_type: "audio/webm")
  end

  it "objectの有無を返す（無ければfalse）" do
    client.stub_responses(:head_object, ["NotFound", {}])

    expect(store.exists?("audio/x/1")).to be(false)
    expect(store.exists?("audio/x/1")).to be(true)
  end

  it "読み出す。無ければnil" do
    client.stub_responses(:get_object, ["NoSuchKey", { body: "text" }])

    expect(store.read("transcripts/x/1.json")).to be_nil
    expect(store.read("transcripts/x/1.json")).to eq("text")
  end

  it "prefixの下をすべて消す（古い試行のobjectも含む）" do
    client.stub_responses(:list_objects_v2, contents: [{ key: "audio/x/1" }, { key: "audio/x/2" }])

    store.delete_prefix("audio/x/")

    delete = client.api_requests.find { it[:operation_name] == :delete_objects }
    expect(delete[:params][:delete][:objects]).to eq([{ key: "audio/x/1" }, { key: "audio/x/2" }])
  end

  it "prefixの下が空なら何も消さず成功する（冪等）" do
    client.stub_responses(:list_objects_v2, contents: [])

    expect { store.delete_prefix("audio/x/") }.not_to raise_error
    expect(client.api_requests.pluck(:operation_name)).not_to include(:delete_objects)
  end

  it "一部を消せなければ失敗にする（消し残しを成功と扱わない）" do
    client.stub_responses(:list_objects_v2, contents: [{ key: "audio/x/1" }])
    client.stub_responses(:delete_objects, errors: [{ key: "audio/x/1", code: "AccessDenied" }])

    expect { store.delete_prefix("audio/x/") }.to raise_error(GenerationProviders::Error)
  end

  it "外部の失敗はmessageを写さずに包む" do
    client.stub_responses(:put_object, Aws::S3::Errors::ServiceError.new(nil, "secret detail"))

    expect { store.put("k", "b", content_type: "audio/webm") }
      .to raise_error(GenerationProviders::Error) { expect(it.message).not_to include("secret detail") }
  end
end
