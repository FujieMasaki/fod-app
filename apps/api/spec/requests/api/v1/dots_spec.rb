require "rails_helper"

RSpec.describe "Dots" do
  let(:user) { create(:user) }
  let(:dot) { create(:dot, user:, sentence: "元の一文", summary: "元の要約") }

  def update_dot(body, id: dot.id, **) = json_request(:patch, "/api/v1/dots/#{id}", body, **)

  def field_errors = response.parsed_body["errors"]

  describe "PATCH /api/v1/dots/{dot_id}" do
    context "without login" do
      it "401 unauthenticated" do
        update_dot({ sentence: "変更" })

        expect(response).to have_http_status(:unauthorized)
        expect(problem_code).to eq("unauthenticated")
        expect(dot.reload.sentence).to eq("元の一文")
        assert_response_schema_confirm(401)
      end
    end

    context "with login" do
      before { sign_in_with_password(user) }

      it "sentenceとsummaryを更新し、契約の項目だけを返す" do
        update_dot({ sentence: "直した一文", summary: "直した要約" })

        expect(response).to have_http_status(:ok)
        expect(response.parsed_body).to eq(
          "id" => dot.id, "date" => dot.date.iso8601, "started_at" => dot.started_at.utc.iso8601,
          "duration_seconds" => dot.duration_seconds, "sentence" => "直した一文", "summary" => "直した要約"
        )
        expect(response.headers["Cache-Control"]).to eq("no-store")
        assert_response_schema_confirm(200)
      end

      it "送った項目だけを変え、空文字も許す" do
        update_dot({ summary: "" })

        expect(dot.reload.attributes.slice("sentence", "summary")).to eq("sentence" => "元の一文", "summary" => "")
        assert_response_schema_confirm(200)
      end

      it "編集前の値をどこにも残さない（同じ行を書き換え、版や履歴の行を増やさない）" do
        update_dot({ sentence: "直した一文" })

        expect(Dot.count).to eq(1)
        expect(Dot.where(sentence: "元の一文")).not_to exist
      end

      it "編集で日付・開始時刻・長さ・所有者・処理IDが動かない" do
        before = dot.attributes.slice("date", "started_at", "duration_seconds", "user_id", "generation_id")
        travel 3.days

        update_dot({ sentence: "直した一文" })

        expect(dot.reload.attributes.slice(*before.keys)).to eq(before)
      end

      it "他人のDot・存在しないDot・ゴミ箱の中のDot・UUIDでない値は404 not_found" do
        others = create(:dot)
        trashed = create(:dot, :trashed, user:)

        [others.id, SecureRandom.uuid, trashed.id, "not-a-uuid"].each do |id|
          update_dot({ sentence: "変更" }, id:)

          expect(response).to have_http_status(:not_found)
          expect(problem_code).to eq("not_found")
          assert_response_schema_confirm(404)
        end
        expect([others.reload.sentence, trashed.reload.sentence]).not_to include("変更")
      end

      it "CSRF tokenが無ければ403 csrf_invalid" do
        update_dot({ sentence: "変更" }, token: :none)

        expect(problem_code).to eq("csrf_invalid")
        expect(dot.reload.sentence).to eq("元の一文")
        assert_response_schema_confirm(403)
      end

      it "編集できない項目は無視せず422 not_allowed（date・started_at・duration_seconds・未知の項目）" do
        update_dot({ sentence: "変更", date: "2026-01-01", started_at: "2026-01-01T00:00:00Z",
                     duration_seconds: 1, user_id: create(:user).id })

        expect(response).to have_http_status(:unprocessable_content)
        expect(field_errors).to match_array(
          %w[date started_at duration_seconds user_id].map { { "field" => it, "code" => "not_allowed" } }
        )
        expect(dot.reload.sentence).to eq("元の一文")
        assert_response_schema_confirm(422)
      end

      it "項目が1つも無ければ422 required" do
        update_dot({})

        expect(field_errors).to eq([{ "field" => "body", "code" => "required" }])
        assert_response_schema_confirm(422)
      end

      it "上限を超えたら422 too_long。上限ちょうどは受け付ける" do
        update_dot({ sentence: "あ" * 201, summary: "あ" * 2001 })
        too_long = field_errors
        update_dot({ sentence: "あ" * 200, summary: "あ" * 2000 })

        expect(too_long).to contain_exactly({ "field" => "sentence", "code" => "too_long" },
                                            { "field" => "summary", "code" => "too_long" })
        expect(response).to have_http_status(:ok)
      end

      it "文字列でない値・NUL文字を含む値は422 invalid_format" do
        [nil, 1, ["一文"], { "text" => "一文" }, "一\u0000文"].each do |value|
          update_dot({ sentence: value })

          expect(field_errors).to eq([{ "field" => "sentence", "code" => "invalid_format" }]), value.inspect
          assert_response_schema_confirm(422)
        end
        expect(dot.reload.sentence).to eq("元の一文")
      end

      it "JSONのobjectでないbodyは422 invalid_format" do
        [["一文"], "一文"].each do |body|
          json_request(:patch, "/api/v1/dots/#{dot.id}", body)

          expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), body.inspect
          assert_response_schema_confirm(422)
        end
      end

      it "壊れたJSONは422 invalid_format" do
        patch "/api/v1/dots/#{dot.id}", params: "{",
                                        headers: { "CONTENT_TYPE" => "application/json", "X-CSRF-Token" => csrf_token }

        expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }])
        assert_response_schema_confirm(422)
      end

      # 壊れたJSON・不正なUTF-8（生の不正なbyte列、対のない下位のsurrogate）。Railsの既定では、生のbodyが
      # debugのログへ、本文を含む例外のmessageがerrorのログへ出る（config/initializers/json_request_body.rb）。
      it "解析できないbodyは422 invalid_formatにし、本文をdebugのログにも出さない" do
        [%({"sentence":"ログに出したくない一文"), %({"sentence":"ログに出したくない一文\xff"}).b,
         %({"sentence":"ログに出したくない一文\\udc00"}), %({"ログに出したくない一文\\udc00":"x"})].each do |body|
          headers = { "CONTENT_TYPE" => "application/json", "X-CSRF-Token" => csrf_token }
          log = captured_log { patch "/api/v1/dots/#{dot.id}", params: body, headers: }

          expect(field_errors).to eq([{ "field" => "body", "code" => "invalid_format" }]), body.inspect
          assert_response_schema_confirm(422)
          expect(log).to include("Error occurred while parsing request parameters")
          expect(log).not_to include("ログに出したくない一文"), body.inspect
        end
        expect(dot.reload.sentence).to eq("元の一文")
      end

      it "編集した内容は履歴の取得にも反映される" do
        update_dot({ sentence: "直した一文" })

        get "/api/v1/days/#{dot.date.iso8601}"

        expect(response.parsed_body["dots"].pluck("sentence")).to eq(["直した一文"])
      end
    end
  end
end
