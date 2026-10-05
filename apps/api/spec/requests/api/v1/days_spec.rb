require "rails_helper"

RSpec.describe "Days" do
  let(:user) { create(:user) }
  # 2026-09-28 09:00 JST。今日はAsia/Tokyoの2026-09-28
  let(:now) { Time.zone.parse("2026-09-28 00:00:00 UTC") }

  def dot_at(time, owner: user, **) = create(:dot, user: owner, started_at: Time.zone.parse(time), **)

  before { travel_to(now) }

  describe "認証" do
    %w[/api/v1/days /api/v1/days/today /api/v1/days/2026-09-28].each do |path|
      it "未loginなら#{path}は401 unauthenticated" do
        get path

        expect(response).to have_http_status(:unauthorized)
        expect(problem_code).to eq("unauthenticated")
        expect(response.headers["Cache-Control"]).to eq("no-store")
        assert_response_schema_confirm(401)
      end
    end

    it "7日を過ぎたsessionは401 session_expired" do
      sign_in_with_password(user)
      travel 7.days + 1.second

      get "/api/v1/days"

      expect(problem_code).to eq("session_expired")
      assert_response_schema_confirm(401)
    end
  end

  describe "GET /api/v1/days" do
    before { sign_in_with_password(user) }

    it "履歴が無ければ空の一覧と今日の日付を返す" do
      get "/api/v1/days"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("today" => "2026-09-28", "items" => [], "next_cursor" => nil)
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(200)
    end

    it "本人の記録のある日だけを新しい順に返し、他人のDotを含めない" do
      dot_at("2026-09-26 08:00:00 +09:00")
      latest = dot_at("2026-09-26 21:00:00 +09:00")
      today = dot_at("2026-09-28 08:00:00 +09:00")
      dot_at("2026-09-27 08:00:00 +09:00", owner: create(:user))

      get "/api/v1/days"

      expect(response.parsed_body["items"]).to eq(
        [{ "date" => "2026-09-28", "dot_count" => 1, "latest_dot_id" => today.id },
         { "date" => "2026-09-26", "dot_count" => 2, "latest_dot_id" => latest.id }]
      )
      assert_response_schema_confirm(200)
    end

    it "next_cursorをたどると最後の日まで届き、終わりはnull" do
      %w[2026-09-28 2026-09-20 2026-08-31].each { dot_at("#{it} 12:00:00 +09:00") }

      get "/api/v1/days", params: { limit: 2 }
      first = response.parsed_body
      get "/api/v1/days", params: { limit: 2, cursor: first["next_cursor"] }

      expect(first["items"].pluck("date")).to eq(%w[2026-09-28 2026-09-20])
      expect(response.parsed_body).to include("items" => [include("date" => "2026-08-31")], "next_cursor" => nil)
      assert_response_schema_confirm(200)
    end

    it "解釈できないcursorは400 cursor_invalid" do
      get "/api/v1/days", params: { cursor: "broken" }

      expect(response).to have_http_status(:bad_request)
      expect(problem_code).to eq("cursor_invalid")
      assert_response_schema_confirm(400)
    end

    it "limitが整数でない・範囲の外なら422 validation_failed" do
      results = %w[abc 1.5 0 101].map do |limit|
        get "/api/v1/days", params: { limit: }
        assert_response_schema_confirm(422)
        [response.status, response.parsed_body["errors"]]
      end

      invalid_format = [422, [{ "field" => "limit", "code" => "invalid_format" }]]
      out_of_range = [422, [{ "field" => "limit", "code" => "out_of_range" }]]
      expect(results).to eq([invalid_format, invalid_format, out_of_range, out_of_range])
    end
  end

  describe "GET /api/v1/days/today" do
    before { sign_in_with_password(user) }

    it "今日の記録が無ければdot_count 0でlatest_dotを省く。昨日のDotを今日として返さない" do
      dot_at("2026-09-27 23:59:59 +09:00")

      get "/api/v1/days/today"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("date" => "2026-09-28", "dot_count" => 0)
      assert_response_schema_confirm(200)
    end

    it "今日の最新のDotを、契約の項目だけで返す" do
      dot_at("2026-09-28 00:00:00 +09:00")
      latest = dot_at("2026-09-28 08:30:15 +09:00", duration_seconds: 95, sentence: "一文", summary: "")

      get "/api/v1/days/today"

      expect(response.parsed_body).to eq(
        "date" => "2026-09-28", "dot_count" => 2,
        "latest_dot" => { "id" => latest.id, "date" => "2026-09-28", "started_at" => "2026-09-27T23:30:15Z",
                          "duration_seconds" => 95, "sentence" => "一文", "summary" => "" }
      )
      assert_response_schema_confirm(200)
    end

    it "ゴミ箱の中のDotと他人のDotを選ばない" do
      kept = dot_at("2026-09-28 07:00:00 +09:00")
      dot_at("2026-09-28 08:00:00 +09:00", trashed_at: Time.current)
      dot_at("2026-09-28 08:30:00 +09:00", owner: create(:user))

      get "/api/v1/days/today"

      expect(response.parsed_body).to include("dot_count" => 1, "latest_dot" => include("id" => kept.id))
    end

    it "今日の日付はAsia/Tokyoの0:00で切り替わる" do
      travel_to(Time.zone.parse("2026-09-28 14:59:59 UTC")) do
        get "/api/v1/days/today"
        expect(response.parsed_body["date"]).to eq("2026-09-28")
      end
      travel_to(Time.zone.parse("2026-09-28 15:00:00 UTC")) do
        get "/api/v1/days/today"
        expect(response.parsed_body["date"]).to eq("2026-09-29")
      end
    end
  end

  describe "GET /api/v1/days/{date}" do
    before { sign_in_with_password(user) }

    it "その日のDotをstarted_atの降順で返す" do
      morning = dot_at("2026-09-28 08:00:00 +09:00")
      evening = dot_at("2026-09-28 22:00:00 +09:00")

      get "/api/v1/days/2026-09-28"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["dots"].pluck("id")).to eq([evening.id, morning.id])
      expect(response.parsed_body["next_cursor"]).to be_nil
      expect(response.headers["Cache-Control"]).to eq("no-store")
      assert_response_schema_confirm(200)
    end

    it "0:00 JSTの前後のDotを別の日に分ける" do
      before_midnight = dot_at("2026-09-27 23:59:59 +09:00")
      dot_at("2026-09-28 00:00:00 +09:00")

      get "/api/v1/days/2026-09-27"

      expect(response.parsed_body["dots"].pluck("id")).to eq([before_midnight.id])
    end

    it "記録の無い日と、他人のDotしか無い日は、200で0件を返す" do
      dot_at("2026-09-25 08:00:00 +09:00", owner: create(:user))

      results = %w[2026-09-24 2026-09-25].map do |date|
        get "/api/v1/days/#{date}"
        assert_response_schema_confirm(200)
        [response.status, response.parsed_body["dots"]]
      end

      expect(results).to eq([[200, []], [200, []]])
    end

    it "その日のDotが完全削除されて0件になっても、200で0件を返す（取得失敗と区別する）" do
      dot_at("2026-09-28 08:00:00 +09:00").destroy!

      get "/api/v1/days/2026-09-28"

      expect(response).to have_http_status(:ok)
      expect(response.parsed_body).to eq("date" => "2026-09-28", "dots" => [], "next_cursor" => nil)
      assert_response_schema_confirm(200)
    end

    it "同日の多数のDotをcursorでたどると、すべてのDotへ1回ずつ届く" do
      dots = (0...5).map { dot_at(format("2026-09-28 %02d:00:00 +09:00", it)) }

      ids = []
      cursor = nil
      loop do
        get "/api/v1/days/2026-09-28", params: { limit: 2, cursor: }.compact
        assert_response_schema_confirm(200)
        ids.concat(response.parsed_body["dots"].pluck("id"))
        break unless (cursor = response.parsed_body["next_cursor"])
      end

      expect(ids).to eq(dots.reverse.map(&:id))
    end

    it "別の日のcursorは400 cursor_invalid" do
      2.times { dot_at("2026-09-28 0#{it}:00:00 +09:00") }
      get "/api/v1/days/2026-09-28", params: { limit: 1 }

      get "/api/v1/days/2026-09-27", params: { cursor: response.parsed_body["next_cursor"] }

      expect(problem_code).to eq("cursor_invalid")
      assert_response_schema_confirm(400)
    end

    it "DBの範囲を超える時刻のcursorは500にせず400 cursor_invalid" do
      cursor = Base64.urlsafe_encode64("v1:2026-09-28:#{'9' * 20}:#{SecureRandom.uuid}", padding: false)

      get "/api/v1/days/2026-09-28", params: { cursor: }

      expect(problem_code).to eq("cursor_invalid")
      assert_response_schema_confirm(400)
    end

    it "日付の形が違う、または存在しない暦日なら422 validation_failed" do
      %w[2026-9-28 2026-02-30 today2].each do |date|
        get "/api/v1/days/#{date}"

        expect(response).to have_http_status(:unprocessable_content)
        expect(response.parsed_body["errors"]).to eq([{ "field" => "date", "code" => "invalid_format" }])
        assert_response_schema_confirm(422)
      end
    end
  end

  describe "ゴミ箱" do
    before { sign_in_with_password(user) }

    def fetch_all
      %w[/api/v1/days /api/v1/days/today /api/v1/days/2026-09-28].map do |path|
        get path
        response.parsed_body
      end
    end

    it "ゴミ箱へ移したDotは一覧・Day・日の詳細から外れ、戻すと元の日へ戻る" do
      dot = dot_at("2026-09-28 08:00:00 +09:00")

      dot.update!(trashed_at: Time.current)
      trashed = fetch_all
      dot.update!(trashed_at: nil)
      restored = fetch_all

      expect(trashed).to eq([{ "today" => "2026-09-28", "items" => [], "next_cursor" => nil },
                             { "date" => "2026-09-28", "dot_count" => 0 },
                             { "date" => "2026-09-28", "dots" => [], "next_cursor" => nil }])
      expect(restored.map { it.except("today") }).to match(
        [{ "items" => [{ "date" => "2026-09-28", "dot_count" => 1, "latest_dot_id" => dot.id }], "next_cursor" => nil },
         { "date" => "2026-09-28", "dot_count" => 1, "latest_dot" => include("id" => dot.id) },
         { "date" => "2026-09-28", "dots" => [include("id" => dot.id)], "next_cursor" => nil }]
      )
    end
  end
end
