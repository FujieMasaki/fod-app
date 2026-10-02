Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Deviseのmapping（sign_in等で使う）だけを作り、Deviseのcontroller・routeは使わない。
  devise_for :users, skip: :all

  # 認証（契約: contracts/openapi.yaml の session tag）
  namespace :api do
    namespace :v1 do
      resource :session, only: %i[show create destroy]
      resource :registration, only: :create
      resource :confirmation, only: %i[create update]
      resource :password, only: %i[create update]
      resource :unlock, only: :update
    end
  end
end
