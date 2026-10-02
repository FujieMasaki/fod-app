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

  def string_param_error(field, max_length)
    value = body_param(field)
    # 空白だけの値も文字列として受け取る（passwordは文字種を問わない。契約のNewCredentials）。
    return { field: field.to_s, code: "required" } unless value.is_a?(String) && !value.empty?

    { field: field.to_s, code: "too_long" } if value.length > max_length
  end

  def body_param(field) = request.request_parameters[field.to_s]
end
