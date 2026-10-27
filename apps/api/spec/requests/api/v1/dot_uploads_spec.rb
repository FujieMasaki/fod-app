require "rails_helper"

RSpec.describe "Dot uploads", :perform_jobs do
  include_context "with fake generation providers"

  let(:user) { create(:user) }
  let(:issued) { RecordingAttemptToken.issue(user) }
  let(:attempt) { issued.first }

  def upload(audio: audio_file, duration: "120", attempt_token: issued.last, content_type: nil)
    params = { duration_seconds: duration }
    params[:audio] = audio if audio
    headers = { "X-CSRF-Token" => csrf_token, "X-Recording-Attempt" => attempt_token }
    headers["CONTENT_TYPE"] = content_type if content_type
    post "/api/v1/dots", params:, headers:
  end

  def audio_file(content_type = "audio/webm;codecs=opus", body = "#{UploadHelpers::WEBM_HEAD}#{'\x00' * 64}")
    Rack::Test::UploadedFile.new(StringIO.new(body), content_type, original_filename: "recording.webm")
  end

  it "401 unauthenticated" do
    upload

    expect(problem_code).to eq("unauthenticated")
    assert_response_schema_confirm(401)
  end

  context "with login", perform_jobs: false do
    before { sign_in_with_password(user) }

    it "202で処理を返し、音声を預かって文字起こしを始める" do
      upload

      expect(response).to have_http_status(:accepted)
      expect(response.parsed_body).to include("id" => attempt.id, "status" => "processing", "stage" => "transcribing",
                                              "started_at" => attempt.started_at.utc.iso8601)
      expect(storage.keys).to eq(["audio/#{attempt.id}/1"])
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(202)
    end

    it "同じattemptの再送は、新しい処理を作らず既存の処理を返す" do
      2.times { upload }

      expect(response).to have_http_status(:accepted)
      expect(Generation.count).to eq(1)
      assert_response_schema_confirm(202)
    end

    it "音声を置けなければ、送り直せる失敗として返す" do
      storage.fail_next(:put)

      upload

      expect(response.parsed_body).to include("status" => "failed", "failure" => { "kind" => "upload_incomplete" },
                                              "retryable" => false)
      assert_response_schema_confirm(202)
    end

    {
      "attempt_invalid" => [422, { attempt_token: "forged" }],
      "unsupported_audio_type" => [415, { audio: :wav }],
      "validation_failed" => [422, { duration: "0" }]
    }.each do |code, (status, args)|
      it "#{status} #{code}" do
        args = args.merge(audio: audio_file("audio/wav")) if args[:audio] == :wav

        upload(**args)

        expect(response).to have_http_status(status)
        expect(problem_code).to eq(code)
        assert_response_schema_confirm(status)
      end
    end

    it "413 audio_too_large" do
      stub_const("UploadedAudio::MAX_BYTES", 10)

      upload

      expect(problem_code).to eq("audio_too_large")
      assert_response_schema_confirm(413)
    end

    it "422 attempt_expired（録り直しを案内する）" do
      issued
      travel(2.hours + 1.second)

      upload

      expect(problem_code).to eq("attempt_expired")
      assert_response_schema_confirm(422)
    end

    it "別の利用者のattemptは使えない" do
      other_token = RecordingAttemptToken.issue(create(:user)).last

      upload(attempt_token: other_token)

      expect(problem_code).to eq("attempt_invalid")
    end

    it "409 account_deletion_in_progress" do
      user.update!(deletion_requested_at: Time.current)

      upload

      expect(problem_code).to eq("account_deletion_in_progress")
      assert_response_schema_confirm(409)
    end

    it "上限を超えたら429", :fixed_time do
      GenerationThrottle::LIMITERS[:upload].map { it.instance_variable_get(:@limit) }.min.times { GenerationThrottle.hit(:upload, user) }

      upload

      expect(problem_code).to eq("rate_limited")
      assert_response_schema_confirm(429)
    end

    it "1日の上限は、1時間の枠が変わっても戻らず、1日の枠が変わるまで待たせる（Transcribeの費用の上限）" do
      travel_to(Time.utc(2026, 10, 2, 1)) do
        GenerationThrottle::LIMITERS[:upload].last.instance_variable_get(:@limit).times do
          GenerationThrottle.hit(:upload, user)
        end
      end

      travel_to(Time.utc(2026, 10, 2, 3)) { upload }

      expect(problem_code).to eq("rate_limited")
      expect(response.parsed_body["retry_after_seconds"]).to eq(21.hours.to_i)
    end

    it "音声をrequestのログに出さない" do
      log = captured_log { upload(audio: audio_file("audio/webm", "#{UploadHelpers::WEBM_HEAD}secret-voice")) }

      expect(log).not_to include("secret-voice")
      expect(log).not_to include(issued.last)
    end
  end
end
