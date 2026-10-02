require "omniauth-google-oauth2"

module OmniAuth
  module Strategies
    # omniauth-google-oauth2に、退会前の再認証（intent=reauthenticate）で使うmax_ageを足す。
    # 1.2.3はmax_ageを送らず、ID tokenのauth_timeも検証しない（TASK-006 Plan §4）。
    # auth_timeの検証はGoogleSignIn#reauthenticateで行う。
    class FocusGoogleOauth2 < GoogleOauth2
      option :name, "google_oauth2"
      # requestのparameterからprompt・redirect_uri・hdなどを上書きさせない。
      option :overridable_authorize_options, []

      def authorize_params
        super.tap do |params|
          if request.params["intent"] == "reauthenticate"
            params[:max_age] = 0
            params[:prompt] = "select_account"
          end
        end
      end
    end
  end
end
