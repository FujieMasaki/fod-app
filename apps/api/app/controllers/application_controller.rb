# API-onlyに、Cookie sessionのCSRF保護・認証・Problemの応答を足す（TASK-006）。
#
# - GET/HEAD以外は`X-CSRF-Token`とOriginを検証し、合わなければ`403 csrf_invalid`。
# - 個人に関わるresponseはすべて`Cache-Control: no-store`。
class ApplicationController < ActionController::API
  include ActionController::RequestForgeryProtection
  include ProblemRendering
  include JsonParams
  include Authentication

  # API-onlyではconfig.action_controllerの値がこのmoduleに渡らないので、ここで明示する。
  self.allow_forgery_protection = true
  self.forgery_protection_origin_check = true
  protect_from_forgery with: :exception

  before_action :prevent_caching

  private

  def prevent_caching = response.headers["Cache-Control"] = "no-store"
end
