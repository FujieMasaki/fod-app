# 失敗をRFC 9457のProblemで返す。想定外の例外も`internal_error`にし、内容をclientへ出さない。
module ProblemRendering
  extend ActiveSupport::Concern

  included do
    rescue_from StandardError, with: :render_internal_error
    rescue_from ActionController::InvalidAuthenticityToken, with: -> { render_problem(:csrf_invalid) }
    rescue_from ActionDispatch::Http::Parameters::ParseError,
                with: -> { render_validation_failed([{ field: "body", code: "invalid_format" }]) }
  end

  private

  def render_problem(code, **extensions)
    problem = ProblemDetails.new(code, **extensions)
    render json: problem.as_json, status: problem.status, content_type: ProblemDetails::CONTENT_TYPE
  end

  # 入力の不備を、契約のFieldErrorの形で返す。
  def render_validation_failed(errors) = render_problem(:validation_failed, errors:)

  # Serviceの結果（AuthResult）の失敗を、statusに対応するProblemで返す。
  def render_result_problem(result)
    case result.status
    when :rate_limited then render_problem(:rate_limited, retry_after_seconds: result.retry_after_seconds)
    when :validation_failed then render_validation_failed(result.errors)
    else render_problem(result.status)
    end
  end

  def render_internal_error(error)
    Rails.error.report(error, handled: true)
    render_problem(:internal_error)
  end
end
