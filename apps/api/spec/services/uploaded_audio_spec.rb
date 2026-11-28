require "rails_helper"

RSpec.describe UploadedAudio do
  it "webm（opus）とmp4（aac）を受け付ける" do
    expect([uploaded_audio.problem, uploaded_audio(content_type: "audio/mp4").problem]).to eq([nil, nil])
  end

  it "32MBを超えたら大きすぎる" do
    expect(uploaded_audio(size: 32.megabytes + 1).problem).to eq(:audio_too_large)
  end

  it "受容しない形式と、申告と中身が合わない音声を拒否する" do
    expect(uploaded_audio(content_type: "audio/wav").problem).to eq(:unsupported_audio_type)
    expect(uploaded_audio(content_type: "audio/webm", body: "#{UploadHelpers::MP4_HEAD}xx").problem)
      .to eq(:unsupported_audio_type)
  end

  it "録音時間が1〜1800秒の整数でなければ検証の失敗" do
    expect([0, 1801, "120", nil].map { uploaded_audio(duration_seconds: it).problem }).to all(eq(:validation_failed))
  end

  it "中身を確かめた後も、先頭から読める" do
    audio = uploaded_audio
    audio.problem

    expect(audio.io.read(4)).to eq(UploadHelpers::WEBM_HEAD)
  end
end
