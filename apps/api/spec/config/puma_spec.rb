require "rails_helper"
require "puma/configuration"

RSpec.describe "config/puma.rb" do # rubocop:disable RSpec/DescribeClass
  it "本文の大きさの上限は、ApiRequestGuardの上限より大きい（guardが契約の形で413を返せる範囲を残す）" do
    config = Puma::Configuration.new({}, {}, { "SOLID_QUEUE_IN_PUMA" => "false" }) do |user_config|
      user_config.load Rails.root.join("config/puma.rb").to_s
    end
    config.clamp

    expect(config.options[:http_content_length_limit]).to be > ApiRequestGuard::NON_JSON_BODY_LIMIT
  end
end
