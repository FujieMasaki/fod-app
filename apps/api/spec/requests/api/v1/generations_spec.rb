require "rails_helper"

RSpec.describe "Generations", perform_jobs: false do
  include_context "with fake generation providers"

  let(:user) { create(:user) }

  def show(id) = get("/api/v1/generations/#{id}")

  def succeeded_generation
    create(:generation, :transcribed, user:, state: "succeeded_cleanup_pending").tap do |generation|
      storage.objects[generation.transcript_key] =
        { body: { results: { transcripts: [{ transcript: "今日は散歩した" }] } }.to_json }
      create(:dot, user:, generation_id: generation.id, started_at: generation.started_at)
    end
  end

  it "401 unauthenticated" do
    show(SecureRandom.uuid)

    expect(problem_code).to eq("unauthenticated")
    assert_response_schema_confirm(401)
  end

  context "with login" do
    before { sign_in_with_password(user) }

    describe "GET /api/v1/generations/{id}" do
      it "処理中は段階と次に取得するまでの秒数を返す" do
        generation = create(:generation, user:, state: "generating")

        show(generation.id)

        expect(response.parsed_body).to include("status" => "processing", "stage" => "generating",
                                                "poll_after_seconds" => 5, "retryable" => false)
        expect(response.headers["Cache-Control"]).to eq("no-store")
        assert_response_schema_confirm(200)
      end

      it "Dotがあれば、後片付けが残っていても成功として、Dotと全文を返す" do
        generation = succeeded_generation

        show(generation.id)

        expect(response.parsed_body).to include("status" => "succeeded",
                                                "transcript" => { "status" => "available", "text" => "今日は散歩した" })
        expect(response.parsed_body["dot"]["id"]).to eq(Dot.find_by(generation_id: generation.id).id)
        assert_response_schema_confirm(200)
      end

      it "ACKの後は、後片付けが終わる前でも全文を返さない（物理削除の完了に依存しない）" do
        generation = succeeded_generation
        delete "/api/v1/generations/#{generation.id}/transcript", headers: { "X-CSRF-Token" => csrf_token }

        show(generation.id)

        expect(storage.objects).to have_key(generation.transcript_key)
        expect(response.parsed_body["transcript"]).to eq("status" => "unavailable")
        assert_response_schema_confirm(200)
      end

      it "期限を過ぎていればDotは返すが全文は返さない" do
        generation = succeeded_generation

        travel(25.hours) { show(generation.id) }

        expect(response.parsed_body).to include("status" => "succeeded", "transcript" => { "status" => "unavailable" })
      end

      it "失敗は、再試行できるかと失敗の種類を返す" do
        generation = create(:generation, user:, state: "failed", failure_kind: "generation_failed")

        show(generation.id)

        expect(response.parsed_body).to include("status" => "failed", "retryable" => true,
                                                "failure" => { "kind" => "processing_failed" })
        assert_response_schema_confirm(200)
      end

      it "録り直しが要る失敗は再試行できないと返す" do
        generation = create(:generation, user:, state: "failed", failure_kind: "empty_recording")

        show(generation.id)

        expect(response.parsed_body).to include("retryable" => false, "failure" => { "kind" => "empty_recording" })
        assert_response_schema_confirm(200)
      end

      it "期限を過ぎて後片付けに入った処理はexpired" do
        generation = create(:generation, user:, state: "cleanup_pending", cancel_reason: "expired")

        show(generation.id)

        expect(response.parsed_body).to include("status" => "expired", "retryable" => false)
        assert_response_schema_confirm(200)
      end

      it "他人の処理・ゴミ箱の中のDotの処理・取り消した処理・Dotの完全削除を受理した処理は404" do
        others = create(:generation, state: "generating")
        trashed = create(:dot, :trashed, user:)
        canceled = create(:generation, user:, state: "cancel_requested", cancel_reason: "canceled")
        purged = create(:generation, user:, state: "cancel_requested", cancel_reason: "dot_purged")

        [others.id, trashed.generation_id, canceled.id, purged.id].each do |id|
          show(id)
          expect(response).to have_http_status(:not_found)
        end
        assert_response_schema_confirm(404)
      end

      it "退会の受理後は409" do
        user.update!(deletion_requested_at: Time.current)

        show(SecureRandom.uuid)

        expect(problem_code).to eq("account_deletion_in_progress")
        assert_response_schema_confirm(409)
      end
    end

    describe "DELETE /api/v1/generations/{id}" do
      def cancel(id) = delete("/api/v1/generations/#{id}", headers: { "X-CSRF-Token" => csrf_token })

      it "Dotになる前の処理を取り消し、以後の照会は404" do
        generation = create(:generation, user:, state: "transcribing")

        cancel(generation.id)
        expect(response).to have_http_status(:accepted)
        assert_response_schema_confirm(202)

        show(generation.id)
        expect(response).to have_http_status(:not_found)
      end

      it "Dotの保存まで終わった処理は409 generation_completed" do
        cancel(succeeded_generation.id)

        expect(problem_code).to eq("generation_completed")
        assert_response_schema_confirm(409)
      end

      it "他人の処理は404" do
        cancel(create(:generation).id)

        expect(response).to have_http_status(:not_found)
        assert_response_schema_confirm(404)
      end
    end

    describe "POST /api/v1/generations/{id}/retry" do
      def retry_generation(id) = post("/api/v1/generations/#{id}/retry", headers: { "X-CSRF-Token" => csrf_token })

      it "失敗した処理を再試行し、処理中として返す" do
        generation = create(:generation, :transcribed, user:, state: "failed", failure_kind: "generation_failed")

        retry_generation(generation.id)

        expect(response).to have_http_status(:accepted)
        expect(response.parsed_body).to include("status" => "processing", "stage" => "generating")
        assert_response_schema_confirm(202)
      end

      it "期限を過ぎていれば409 retry_expired と過ぎた期限を返す" do
        generation = create(:generation, user:, state: "failed", failure_kind: "generation_failed",
                                         accepted_at: 25.hours.ago)

        retry_generation(generation.id)

        expect(response.parsed_body).to include("code" => "retry_expired",
                                                "retry_expires_at" => generation.retry_expires_at.utc.iso8601)
        assert_response_schema_confirm(409)
      end

      it "いまの状態では再試行できなければ409 retry_not_allowed" do
        retry_generation(create(:generation, user:, state: "transcribing").id)

        expect(problem_code).to eq("retry_not_allowed")
        assert_response_schema_confirm(409)
      end

      it "1時間の上限を超えたら429", :fixed_time do
        GenerationThrottle::LIMITERS[:retry].instance_variable_get(:@limit).times { GenerationThrottle.hit(:retry, user) }

        retry_generation(create(:generation, user:, state: "failed", failure_kind: "generation_failed").id)

        expect(problem_code).to eq("rate_limited")
        assert_response_schema_confirm(429)
      end

      it "他人の処理は404" do
        retry_generation(create(:generation, state: "failed", failure_kind: "generation_failed").id)

        expect(response).to have_http_status(:not_found)
        assert_response_schema_confirm(404)
      end
    end

    describe "DELETE /api/v1/generations/{id}/transcript" do
      def acknowledge(id)
        delete("/api/v1/generations/#{id}/transcript", headers: { "X-CSRF-Token" => csrf_token })
      end

      it "何度呼んでも202で、Dotは消さない" do
        generation = succeeded_generation

        2.times { acknowledge(generation.id) }

        expect(response).to have_http_status(:accepted)
        expect(user.dots.count).to eq(1)
        assert_response_schema_confirm(202)
      end

      it "Dotの無い処理・他人の処理は404" do
        acknowledge(create(:generation, user:, state: "generating").id)
        expect(response).to have_http_status(:not_found)

        others = create(:generation, :transcribed, state: "succeeded_cleanup_pending")
        create(:dot, user: others.user, generation_id: others.id)
        acknowledge(others.id)
        expect(response).to have_http_status(:not_found)
        expect(others.reload.transcript_withheld_at).to be_nil
        assert_response_schema_confirm(404)
      end
    end
  end
end
