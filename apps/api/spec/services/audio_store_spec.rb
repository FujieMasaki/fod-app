require "rails_helper"

RSpec.describe AudioStore do
  let(:client) { Aws::S3::Client.new(stub_responses: true, region: "ap-northeast-1") }
  let(:store) { described_class.new(client:, bucket: "bucket") }
  let(:prefix) { "audio/#{SecureRandom.uuid}/" }

  it "指定したbucketとkeyへ置く" do
    store.put("audio/x/1", "bytes", content_type: "audio/webm")

    expect(client.api_requests.last[:params]).to include(bucket: "bucket", key: "audio/x/1", content_type: "audio/webm")
  end

  it "objectの有無を返す（無ければfalse）" do
    client.stub_responses(:head_object, ["NotFound", {}])

    expect(store.exists?("audio/x/1")).to be(false)
    expect(store.exists?("audio/x/1")).to be(true)
  end

  it "読み出す。無ければnil、空なら空文字列" do
    client.stub_responses(:get_object, ["NoSuchKey", { body: "text" }, "InvalidRange"])

    expect(store.read("transcripts/x/1.json", max_bytes: 4)).to be_nil
    expect(store.read("transcripts/x/1.json", max_bytes: 4)).to eq("text")
    expect(store.read("transcripts/x/1.json", max_bytes: 4)).to eq("")
  end

  it "上限より1byte多い範囲だけを取り、上限を超えていれば読まずに失敗にする" do
    client.stub_responses(:get_object, body: "texts")

    expect { store.read("transcripts/x/1.json", max_bytes: 4) }.to raise_error(GenerationProviders::TooLarge)
    expect(client.api_requests.last[:params]).to include(key: "transcripts/x/1.json", range: "bytes=0-4")
  end

  it "prefixの下をすべて消す（古い試行のobjectも含む）" do
    client.stub_responses(:list_objects_v2, contents: [{ key: "#{prefix}1" }, { key: "#{prefix}2" }])

    store.delete_prefix(prefix)

    delete = client.api_requests.find { it[:operation_name] == :delete_objects }
    expect(delete[:params][:delete][:objects]).to eq([{ key: "#{prefix}1" }, { key: "#{prefix}2" }])
  end

  it "処理IDのprefixの形でなければ消さない（bucket全体や別の処理を誤って消さない）" do
    ["", "audio/", "audio/x/", "audio/#{SecureRandom.uuid}"].each do |value|
      expect { store.delete_prefix(value) }.to raise_error(ArgumentError)
    end
    expect(client.api_requests).to be_empty
  end

  it "prefixの下が空なら何も消さず成功する（冪等）" do
    client.stub_responses(:list_objects_v2, contents: [])

    expect { store.delete_prefix(prefix) }.not_to raise_error
    expect(client.api_requests.pluck(:operation_name)).not_to include(:delete_objects)
  end

  it "一部を消せなければ失敗にする（消し残しを成功と扱わない）" do
    client.stub_responses(:list_objects_v2, contents: [{ key: "#{prefix}1" }])
    client.stub_responses(:delete_objects, errors: [{ key: "#{prefix}1", code: "AccessDenied" }])

    expect { store.delete_prefix(prefix) }.to raise_error(GenerationProviders::Error)
  end

  it "外部の失敗はmessageを写さず、元の例外もcauseに残さずに包む" do
    client.stub_responses(:put_object, Aws::S3::Errors::ServiceError.new(nil, "secret detail"))

    expect { store.put("k", "b", content_type: "audio/webm") }.to raise_error(GenerationProviders::Error) do |error|
      expect(error.message).not_to include("secret detail")
      expect(error.cause).to be_nil
    end
  end
end
