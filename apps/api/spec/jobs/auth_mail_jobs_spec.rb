require "rails_helper"

# 認証メールのJobの引数（メールアドレス・確認・再設定・解除のtoken）を、DBのqueue（Solid Queue）に保存しない。
# testでは全体のtest adapterに任せるので、開発・本番の設定を読んで確かめる。
RSpec.describe "認証メールのJob" do # rubocop:disable RSpec/DescribeClass
  it "開発・本番では認証メール用の設定（async）のadapterで動き、Solid Queueに載らない" do
    expect(Rails.root.join("config/application.rb").read).to include("config.x.auth_mail_queue_adapter = :async")
    expect(Rails.root.glob("config/environments/{development,production}.rb").map(&:read).join)
      .not_to include("auth_mail_queue_adapter")
  end

  it "Jobは認証メール用の設定があれば、それを使う" do
    %w[auth_mail_job auth_mail_delivery_job].each do |name|
      source = Rails.root.join("app/jobs/#{name}.rb").read
      expect(source).to include("self.queue_adapter = Rails.configuration.x.auth_mail_queue_adapter"), name
    end
  end
end
