require "rails_helper"

RSpec.describe PasswordSignIn do
  let(:ip) { "192.0.2.10" }
  let(:password) { AuthRequestHelpers::DEFAULT_PASSWORD }

  def sign_in(email: "nobody@example.com", password: "wrong password")
    described_class.new(email:, password:, ip:).call
  end

  it "失敗49回のとき、照合の途中に届いた2つ目のrequestは上限を超えて照合へ進めない", :fixed_time do
    49.times { |n| sign_in(email: "nobody#{n}@example.com") }
    second = nil
    # 1つ目が照合している間に、2つ目が割り込む順序を作る。
    allow(User).to receive(:find_for_authentication).and_wrap_original do |original, *args, **kwargs|
      if second.nil?
        second = :running
        second = sign_in
      end
      original.call(*args, **kwargs)
    end

    first = sign_in

    expect([first.status, second.status]).to eq(%i[invalid_credentials rate_limited])
  end

  it "loginに成功した回は数えない", :fixed_time do
    user = create(:user)
    60.times { sign_in(email: user.email, password:) }

    expect(sign_in.status).to eq(:invalid_credentials)
  end

  it "上限に掛かって照合しなかった回は、数を増やし続けない", :fixed_time do
    50.times { |n| sign_in(email: "nobody#{n}@example.com") }
    3.times { sign_in }

    expect(RateLimitCounter.sum(:count)).to eq(50)
  end
end
