module Api
  module V1
    # Day・日単位の一覧・日の詳細（契約のgetToday・listDays・getDay）。
    # 本人（`current_user`）のゴミ箱の外のDotだけを返す。
    class DaysController < ApplicationController
      MAX_LIMIT = 100
      DATE_FORMAT = /\A\d{4}-\d{2}-\d{2}\z/
      LIMIT_FORMAT = /\A\d+\z/

      before_action :authenticate_user!
      rescue_from HistoryCursor::Invalid, with: -> { render_problem(:cursor_invalid) }

      def index
        limit = limit_param(DayList::DEFAULT_LIMIT)
        return unless limit

        page = DayList.new(user: current_user, cursor: cursor_param, limit:).call
        render json: DayListSerializer.new(page, today: Dot.date_for(Time.current))
      end

      def today
        render json: TodaySerializer.new(TodaySummary.new(user: current_user).call)
      end

      def show
        date = date_param
        limit = date && limit_param(DayDots::DEFAULT_LIMIT)
        return unless limit

        render json: DayDetailSerializer.new(DayDots.new(user: current_user, date:, cursor: cursor_param, limit:).call)
      end

      private

      def cursor_param = request.query_parameters["cursor"]

      # 日付の形はrouteの制約にせずここで確かめる（routeで外すと契約に無い404になるため）。
      # 存在しない暦日（2026-02-30）も`invalid_format`。
      def date_param
        date = parse_date(params[:date])
        return date if date

        render_validation_failed([{ field: "date", code: "invalid_format" }])
        nil
      end

      def parse_date(value)
        Date.strptime(value, "%Y-%m-%d") if value.is_a?(String) && DATE_FORMAT.match?(value)
      rescue Date::Error
        nil
      end

      def limit_param(default)
        value = request.query_parameters["limit"]
        return default if value.nil?
        return render_limit_error("invalid_format") unless value.is_a?(String) && LIMIT_FORMAT.match?(value)

        limit = value.to_i
        limit.between?(1, MAX_LIMIT) ? limit : render_limit_error("out_of_range")
      end

      def render_limit_error(code)
        render_validation_failed([{ field: "limit", code: }])
        nil
      end
    end
  end
end
