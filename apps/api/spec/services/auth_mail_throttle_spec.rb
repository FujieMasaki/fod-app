require "rails_helper"

RSpec.describe AuthMailThrottle, :fixed_time do
  let(:email) { "person@example.com" }

  def deliveries_from(ip, times, email: self.email)
    sent = 0
    times.times do
      described_class.new(ip:).deliver(email) { sent += 1 }
      travel 61.seconds
    end
    sent
  end

  it "同じIPと宛先の組は、60秒に1回・1時間5回まで" do
    sent = 0
    2.times { described_class.new(ip: "192.0.2.1").deliver(email) { sent += 1 } }

    expect(sent).to eq(1)
    expect(deliveries_from("192.0.2.1", 6)).to eq(4) # 最初の1回と合わせて1時間5回
  end

  it "第三者が別のIPから枠を使い切っても、本人のIPからは送れる" do
    deliveries_from("198.51.100.7", 5)

    expect(deliveries_from("192.0.2.1", 1)).to eq(1)
  end

  it "宛先ごとには、全IPの合計で1時間20回まで" do
    sent = (1..25).sum { |n| deliveries_from("203.0.113.#{n}", 1) }

    expect(sent).to eq(20)
  end

  it "宛先は大文字小文字と前後の空白を区別しない" do
    described_class.new(ip: "192.0.2.1").deliver(" Person@Example.com ") { nil }
    sent = 0
    described_class.new(ip: "192.0.2.1").deliver(email) { sent += 1 }

    expect(sent).to eq(0)
  end
end
