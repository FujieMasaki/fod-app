require_relative "boot"

require "rails"
# Pick the frameworks you want:
require "active_model/railtie"
require "active_job/railtie"
require "active_record/railtie"
require "active_storage/engine"
require "action_controller/railtie"
require "action_mailer/railtie"
# require "action_mailbox/engine"
# require "action_text/engine"
require "action_view/railtie"
# require "action_cable/engine"
# require "rails/test_unit/railtie"

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module FocusOnDotApi
  # Rails application configuration for the API backend.
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 8.1

    # Please, add to the `ignore` list any other `lib` subdirectories that do
    # not contain `.rb` files, or that should not be reloaded or eager loaded.
    # Common ones are `templates`, `generators`, or `middleware`, for example.
    # omniauth/はinitializerでOmniAuthへ登録するため、再読込の対象から外してrequireで読む。middleware/も
    # middlewareの列に積むため同じく外す。
    config.autoload_lib(ignore: %w[assets tasks omniauth middleware])

    # Configuration for the application, engines, and railties goes here.
    #
    # These settings can be overridden in specific environments using the files
    # in config/environments, which are processed later.
    #
    # config.time_zone = "Central Time (US & Canada)"
    # config.eager_load_paths << Rails.root.join("extras")

    # Only loads a smaller set of middleware suitable for API only apps.
    # Middleware like session, flash, cookies can be added back manually.
    # Skip views, helpers and assets when generating a new resource.
    config.api_only = true

    # 認証はRails標準のCookieStore（TASK-001で採用）。API-onlyは既定でsessionを持たないので明示的に足す。
    # 期限（認証から7日・延長なし）はCookieに任せず、Authentication concernがserverで検証する。
    config.session_store :cookie_store,
                         key: "_focus_on_dot_session",
                         httponly: true,
                         same_site: :lax,
                         secure: Rails.env.production?
    config.middleware.use ActionDispatch::Cookies
    config.middleware.use config.session_store, config.session_options

    # `/api/`のJSON以外のbodyと、解釈できないparamsを、本文をログへ出さずにProblemで返す。Railsが
    # 起こすBadRequestを捕まえるため、DebugExceptions（errorのログを出す）の内側に置く。
    require_relative "../lib/middleware/api_request_guard"
    config.middleware.insert_after ActionDispatch::DebugExceptions, ApiRequestGuard

    # 確認・再設定・解除のメールに載せるSPAのorigin（例: https://app.example.com）。
    config.x.app_base_url = ENV.fetch("APP_BASE_URL", "http://localhost:5173")

    config.generators do |generator|
      generator.orm :active_record, primary_key_type: :uuid
      generator.test_framework :rspec,
                               fixtures: false,
                               view_specs: false,
                               helper_specs: false,
                               routing_specs: false,
                               controller_specs: false,
                               request_specs: true
      generator.fixture_replacement :factory_bot, dir: "spec/factories"
    end
  end
end
