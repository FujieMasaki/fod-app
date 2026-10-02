require "rails_helper"

RSpec.describe GoogleAuthIntent do
  describe ".sanitize_return_to" do
    it "素のpathはそのまま使う" do
      expect(%w[/ /record /settings/account /a-b_c].map { described_class.sanitize_return_to(it) })
        .to eq(%w[/ /record /settings/account /a-b_c])
    end

    it "合わない値は/に置き換える（文字列全体で照合する）" do
      bad = ["/\n/evil.example", "/record\n", "https://evil.example", "//evil.example", "/record?x=1",
             "/../x", "record", "", nil, ["/"], "/#{'a' * 512}"]

      expect(bad.map { described_class.sanitize_return_to(it) }).to all(eq("/"))
    end
  end

  it "未知のintentはsign_inとして扱う" do
    expect(described_class.from_params("intent" => "delete_everything").intent).to eq("sign_in")
  end
end
