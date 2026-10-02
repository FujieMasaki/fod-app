require "rails_helper"

# 確認メールの再送・password再設定は、登録の有無にかかわらずrequestの中で同じ処理をする
# （利用者を探すところからjobへ渡す）。応答時間から登録の有無が分からないようにするため。
RSpec.describe "Auth mail requests", perform_jobs: false do
  let(:user) { create(:user) }
  let(:unconfirmed) { create(:user, :unconfirmed) }

  it "password再設定は、登録の有無にかかわらずjobを1つ積むだけで、requestの中でtokenを作らない" do
    user
    expect do
      json_request(:post, "/api/v1/password", { email: user.email })
      json_request(:post, "/api/v1/password", { email: "nobody@example.com" })
    end.to have_enqueued_job(AuthMailJob).exactly(2).times

    expect(user.reload.reset_password_token).to be_nil
    expect(ActionMailer::Base.deliveries).to be_empty
  end

  it "確認メールの再送も、登録の有無にかかわらずjobを1つ積むだけ" do
    unconfirmed
    travel 61.seconds
    expect do
      json_request(:post, "/api/v1/confirmation", { email: unconfirmed.email })
      json_request(:post, "/api/v1/confirmation", { email: "nobody@example.com" })
    end.to have_enqueued_job(AuthMailJob).exactly(2).times
  end

  # productionと同じinfoレベルで確かめる。debugではActionMailerがメール本文（宛先・token）を出すため、
  # productionでRAILS_LOG_LEVELをdebugにしない（architecture「認証詳細」）。
  it "jobの引数（メールアドレス・token）をinfoのログに出さない" do
    log = StringIO.new
    logger = ActiveSupport::Logger.new(log, level: :info)
    Rails.logger.broadcast_to(logger)

    perform_enqueued_jobs { json_request(:post, "/api/v1/password", { email: user.email }) }
    token = token_from(last_mail)

    expect(log.string).to include("AuthMailJob")
    expect(log.string).not_to include(user.email, token)
  ensure
    Rails.logger.stop_broadcasting_to(logger)
  end
end
