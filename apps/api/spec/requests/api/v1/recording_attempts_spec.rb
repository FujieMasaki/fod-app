require "rails_helper"

RSpec.describe "Recording attempts" do
  let(:user) { create(:user) }

  def issue = json_request(:post, "/api/v1/recording_attempts")

  it "401 unauthenticated" do
    issue

    expect(problem_code).to eq("unauthenticated")
    assert_response_schema_confirm(401)
  end

  context "with login" do
    before { sign_in_with_password(user) }

    it "受理した時刻をstarted_atにしてattemptを発行し、serverには保存しない" do
      freeze_time do
        expect { issue }.not_to(change { [Generation.count, ConsumedRecordingAttempt.count] })

        expect(response).to have_http_status(:created)
        body = response.parsed_body
        expect(body).to include("started_at" => Time.current.utc.iso8601, "expires_at" => 2.hours.from_now.utc.iso8601)
        expect(RecordingAttemptToken.verify(body["attempt_token"], user).id).to eq(body["id"])
        expect(response.headers["Cache-Control"]).to eq("no-store")
        assert_response_schema_confirm(201)
      end
    end

    it "退会の受理後は409" do
      user.update!(deletion_requested_at: Time.current)

      issue

      expect(problem_code).to eq("account_deletion_in_progress")
      assert_response_schema_confirm(409)
    end

    it "1時間の上限を超えたら429", :fixed_time do
      GenerationThrottle::LIMITERS[:recording_attempt].instance_variable_get(:@limit).times { issue }
      issue

      expect(problem_code).to eq("rate_limited")
      expect(response.parsed_body["retry_after_seconds"]).to be_positive
      assert_response_schema_confirm(429)
    end
  end
end
