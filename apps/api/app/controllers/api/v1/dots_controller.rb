module Api
  module V1
    # 録音した音声を送ってDotの生成を始める（契約のcreateDot）と、Dotの`sentence`と`summary`の編集（updateDot）。
    # 編集は本人のゴミ箱の外のDotだけを対象にし、編集前の値は残さない（版も履歴も持たない）。
    class DotsController < ApplicationController
      EDITABLE_FIELDS = { sentence: Dot::SENTENCE_MAX_LENGTH, summary: Dot::SUMMARY_MAX_LENGTH }.freeze

      # 項目を`dot`で包まない。包んだ項目が許可しない項目として数えられるため。
      wrap_parameters false
      before_action :authenticate_user!

      # 生成は非同期で、`202`で処理を返して終わる。attemptは本文を読む前に検証し、同じattemptの既存の処理が
      # あれば本文を使わずに返す（GenerationUpload）。
      def create
        retry_after = GenerationThrottle.hit(:upload, current_user)
        return render_problem(:rate_limited, retry_after_seconds: retry_after) if retry_after

        result = GenerationUpload.call(user: current_user, token: request.headers["X-Recording-Attempt"],
                                       read_audio: -> { uploaded_audio })
        result.outcome == :problem ? render_upload_problem(result.problem) : render_generation(result.generation_id)
      end

      # 入力を先に確かめ、存在しない・他人の・ゴミ箱の中のDotかで応答を変えない（どれも404）。
      def update
        input = permit_optional_strings(EDITABLE_FIELDS)
        return unless input

        dot = current_user.dots.kept.find(params.expect(:dot_id))
        dot.update!(input)
        render json: DotSerializer.new(dot)
      end

      private

      # multipartの`audio`と`duration_seconds`。partのContent-Typeの引数（`;codecs=opus`）は外して比べる
      def uploaded_audio
        audio = params[:audio]
        return unless audio.is_a?(ActionDispatch::Http::UploadedFile)

        UploadedAudio.new(io: audio.tempfile, content_type: audio_media_type(audio), size: audio.size,
                          duration_seconds:)
      end

      def audio_media_type(audio) = audio.content_type.to_s.split(";").first.to_s.strip.downcase

      def duration_seconds
        value = params[:duration_seconds]
        value.to_i if value.is_a?(String) && value.match?(/\A\d{1,4}\z/)
      end

      def render_upload_problem(code)
        code == :validation_failed ? render_validation_failed(upload_field_errors) : render_problem(code)
      end

      # 契約のFieldError。音声の形式と大きさは別のcode（415・413）で返す
      def upload_field_errors
        errors = []
        errors << { field: "audio", code: "required" } unless params[:audio].is_a?(ActionDispatch::Http::UploadedFile)
        duration_error = duration_seconds_error
        errors << { field: "duration_seconds", code: duration_error } if duration_error
        errors
      end

      def duration_seconds_error
        value = params[:duration_seconds]
        return "required" if value.blank?
        return "invalid_format" unless duration_seconds

        "out_of_range" unless Dot::DURATION_RANGE.cover?(duration_seconds)
      end

      def render_generation(generation_id)
        view = GenerationStatus.lookup(user: current_user, generation_id:)
        view ? render(json: GenerationSerializer.new(view), status: :accepted) : render_problem(:not_found)
      end
    end
  end
end
