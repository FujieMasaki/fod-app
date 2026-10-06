# JSONのrequest bodyを、本文をログへ出さずに解析する。どちらも`filter_parameters`が効かない経路である。
#
# 1. 不正なUTF-8を含む文字列（生の不正なbyte列、対のない`\udc00`のescape）は、jsonのgemが解析に成功し、
#    後でRailsが本文を含むmessageの`ActionController::BadRequest`にする。`rescue_from`の外で起きるため、
#    Problem形式でない`400`になり、messageが本番のログ（error）に残る。解析の時点で拒否し、壊れた
#    JSONと同じ`422 body invalid_format`にする。
# 2. 解析に失敗したとき、Railsは生のbody（`raw_post`）をdebugのログへ出す。失敗したことだけを記録する。
#    Railsの非公開のmethod（actionpack 8.1の`ActionDispatch::Http::Parameters#log_parse_error_once`）を
#    置き換えているため、Railsを上げて前提が崩れたら`spec/requests/api/v1/dots_spec.rb`の
#    「本文をログに出さない」が失敗して気づける。
module JsonRequestBody
  # Railsの既定のJSONのparserと同じく、objectでない値は`_json`に入れる。
  def self.call(raw_post)
    data = ActiveSupport::JSON.decode(raw_post)
    raise JSON::ParserError, "invalid UTF-8 in request body" unless valid_encoding?(data)

    data.is_a?(Hash) ? data : { _json: data }
  end

  def self.valid_encoding?(value)
    case value
    when String then value.valid_encoding?
    when Hash then value.all? { |key, item| valid_encoding?(key) && valid_encoding?(item) }
    when Array then value.all? { valid_encoding?(it) }
    else true
    end
  end

  # 解析の失敗をbodyなしで記録する（上の2）。
  module ParseErrorLogging
    private

    def log_parse_error_once
      return if @parse_error_logged

      @parse_error_logged = true
      (logger || ActiveSupport::Logger.new($stderr)).debug("Error occurred while parsing request parameters.")
    end
  end
end

ActiveSupport.on_load(:action_dispatch_request) do
  self.parameter_parsers = parameter_parsers.merge(json: JsonRequestBody)
  prepend JsonRequestBody::ParseErrorLogging
end
