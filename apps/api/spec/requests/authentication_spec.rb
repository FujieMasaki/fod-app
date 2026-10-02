require "rails_helper"

# 後続のDot APIが使う認証concern（authenticate_user! / current_user）の振る舞い。
RSpec.describe "Authentication concern" do
  let(:user) { create(:user) }
  let(:path) { ProtectedProbeRoutes::PATH }

  it "未loginなら401 unauthenticated" do
    get path

    expect(response).to have_http_status(:unauthorized)
    expect(problem_code).to eq("unauthenticated")
    expect(response.media_type).to eq("application/problem+json")
    expect(response.headers["Cache-Control"]).to eq("no-store")
  end

  it "login中はcurrent_userを渡す" do
    sign_in_with_password(user)
    get path

    expect(response.parsed_body["user_id"]).to eq(user.id)
  end

  it "認証から7日ちょうどで401 session_expiredになり、利用しても延長しない" do
    sign_in_with_password(user)
    travel 6.days
    get path
    expect(response).to have_http_status(:ok)

    travel 1.day
    get path
    expect(problem_code).to eq("session_expired")

    get path
    expect(problem_code).to eq("unauthenticated")
  end

  it "認証から8日を過ぎたCookieは、コピーして送っても読めない" do
    sign_in_with_password(user)
    copied = cookies["_focus_on_dot_session"]
    travel 8.days + 1.second
    cookies["_focus_on_dot_session"] = copied

    get path

    expect(problem_code).to eq("unauthenticated")
  end

  it "Cookieの有効期限は認証から8日（期限切れを伝える1日を足す）で、利用しても延ばさない" do
    freeze_time do
      sign_in_with_password(user)
      expires = 8.days.from_now.utc.httpdate

      expect(response.headers["Set-Cookie"]).to include("expires=#{expires}")
      travel 1.day
      get path
      expect(response.headers["Set-Cookie"]).to include("expires=#{expires}")
    end
  end

  it "clientが送ったuser_idを所有者の根拠にしない" do
    other = create(:user)
    sign_in_with_password(user)

    json_request(:post, path, { user_id: other.id })

    expect(response.parsed_body["user_id"]).to eq(user.id)
  end

  it "2人の利用者を混同しない" do
    other = create(:user)
    sign_in_with_password(user)
    get path
    first_id = response.parsed_body["user_id"]

    reset!
    sign_in_with_password(other)
    get path

    expect([first_id, response.parsed_body["user_id"]]).to eq([user.id, other.id])
  end

  it "改ざんしたCookieでは401 unauthenticated" do
    sign_in_with_password(user)
    cookies["_focus_on_dot_session"] = "#{cookies['_focus_on_dot_session']}tampered"

    get path

    expect(problem_code).to eq("unauthenticated")
  end

  it "削除された利用者のsessionは401 unauthenticated" do
    sign_in_with_password(user)
    user.destroy!

    get path

    expect(problem_code).to eq("unauthenticated")
  end

  it "loginしている利用者がロックされると401 unauthenticated" do
    sign_in_with_password(user)
    user.lock_access!(send_instructions: false)

    get path

    expect(problem_code).to eq("unauthenticated")
  end

  it "passwordを再設定すると、それ以前のCookieは使えなくなる" do
    sign_in_with_password(user)
    user.reset_password("another good password", "another good password")

    get path

    expect(problem_code).to eq("unauthenticated")
  end
end
