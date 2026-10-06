# JSON bodyの文字列項目を、契約の必須・最大長で受け取る。合わなければ`422 validation_failed`を返す。
# query stringからは読まない。password・tokenがURLに載ると、proxyのaccess logなどに残るため。
module JsonParams
  extend ActiveSupport::Concern

  private

  # limitsは{ field => maxLength }。全項目が合えば{ field => value }を、合わなければnilを返す
  # （その場合は応答を返し済み）。
  def require_strings(limits)
    errors = limits.filter_map { |field, max_length| string_param_error(field, max_length) }
    return limits.keys.index_with { |field| body_param(field) } if errors.empty?

    render_validation_failed(errors)
    nil
  end

  # 部分更新の文字列項目を受け取る（limitsは{ field => maxLength }）。空文字を許す。limitsに無い項目は
  # 黙って捨てず`not_allowed`にし、1つも無ければ`body`の`required`にする。合えば送られた項目だけの
  # { field => value }を、合わなければnilを返す（その場合は応答を返し済み）。
  # ParamsWrapperが包んだ項目まで数えないよう、使うcontrollerでは`wrap_parameters false`にする。
  def permit_optional_strings(limits)
    body = request.request_parameters
    errors = optional_strings_errors(body, limits)
    return body.slice(*limits.keys.map(&:to_s)).transform_keys(&:to_sym) if errors.empty?

    render_validation_failed(errors)
    nil
  end

  def optional_strings_errors(body, limits)
    return [{ field: "body", code: "required" }] if body.empty?
    # JSONのobjectでないbody（配列・文字列など）を、Railsは`_json`に入れる。
    return [{ field: "body", code: "invalid_format" }] if body.key?("_json")

    body.map do |field, value|
      max_length = limits[field.to_sym]
      next { field:, code: "not_allowed" } unless max_length

      optional_string_error(field, value, max_length)
    end.compact
  end

  # PostgreSQLのtextはNUL文字を保存できないため、形式の誤りとして先に拒否する。
  def optional_string_error(field, value, max_length)
    return { field:, code: "invalid_format" } unless value.is_a?(String) && value.exclude?("\u0000")

    { field:, code: "too_long" } if value.length > max_length
  end

  def string_param_error(field, max_length)
    value = body_param(field)
    # 空白だけの値も文字列として受け取る（passwordは文字種を問わない。契約のNewCredentials）。
    return { field: field.to_s, code: "required" } unless value.is_a?(String) && !value.empty?

    { field: field.to_s, code: "too_long" } if value.length > max_length
  end

  def body_param(field) = request.request_parameters[field.to_s]
end
