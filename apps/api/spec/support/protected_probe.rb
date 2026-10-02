# 認証concernを、後続タスクの保護APIと同じ使い方で確かめるためのspec専用のcontroller。
# 契約にないpathなので、これを叩くspecでは契約との照合をしない。
class ProtectedProbeController < ApplicationController
  before_action :authenticate_user!

  def show
    render json: { user_id: current_user.id, google_reauthenticated: recently_reauthenticated_with_google? }
  end

  # clientが送ったuser_idを所有者の根拠にしないことを確かめる。
  def create
    render json: { user_id: current_user.id }
  end
end

# ProtectedProbeControllerのrouteを、アプリのrouteに足す（置き換えない）。
module ProtectedProbeRoutes
  PATH = "/spec/protected".freeze

  def self.draw
    # Rails 8のroute遅延読み込みで、後から読み込まれたrouteに上書きされないよう先に読み込む。
    Rails.application.reload_routes_unless_loaded
    Rails.application.routes.disable_clear_and_finalize = true
    Rails.application.routes.draw do
      get PATH, to: "protected_probe#show"
      post PATH, to: "protected_probe#create"
    end
  ensure
    Rails.application.routes.disable_clear_and_finalize = false
  end
end

RSpec.configure do |config|
  config.before(:suite) { ProtectedProbeRoutes.draw }
end
