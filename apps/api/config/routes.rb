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

      # Day・日単位の一覧・日の詳細（契約のhistory tag）。todayを`days/:date`より先に置く。
      get "days/today", to: "days#today"
      resources :days, only: %i[index show], param: :date

      # Dotの編集（契約のdot tag）。ゴミ箱・完全削除はTASK-013で足す。
      patch "dots/:dot_id", to: "dots#update", as: :dot
    end
  end

  # Googleログインの開始（POST /auth/google_oauth2）はOmniAuthのmiddlewareが受ける。
  get "auth/google_oauth2/callback", to: "auth/google_callbacks#create"
end
