# JSONなどのbodyを解析できなかったとき、Railsは生のbody（`raw_post`）をdebugのログへ出す。
# `filter_parameters`が効かないため、Dotの本文やpasswordがそのまま残る（RAILS_LOG_LEVEL=debugや
# developmentで）。解析に失敗したことだけを記録し、bodyは出さない。
#
# Railsの非公開のmethod（actionpack 8.1の`ActionDispatch::Http::Parameters#log_parse_error_once`）を
# 置き換えている。Railsを上げて名前や呼び方が変わったら、`spec/requests/api/v1/dots_spec.rb`の
# 「壊れたJSONの本文をdebugのログにも出さない」が失敗して気づける。
module ParseErrorLogging
  private

  def log_parse_error_once
    return if @parse_error_logged

    @parse_error_logged = true
    (logger || ActiveSupport::Logger.new($stderr)).debug("Error occurred while parsing request parameters.")
  end
end

ActiveSupport.on_load(:action_dispatch_request) { prepend ParseErrorLogging }
