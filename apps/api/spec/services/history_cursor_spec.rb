require "rails_helper"

RSpec.describe HistoryCursor do
  it "日のcursorは往復で同じ日に戻る" do
    expect(described_class.after_day(described_class.for_day(Date.new(2026, 9, 28)))).to eq(Date.new(2026, 9, 28))
  end

  it "Dotのcursorはstarted_atをマイクロ秒まで保ち、idと一緒に戻す" do
    dot = create(:dot, started_at: Time.zone.parse("2026-09-28 03:00:00.123456 UTC")).reload

    started_at, id = described_class.after_dot(described_class.for_dot(dot), date: dot.date)

    expect([started_at, id]).to eq([dot.started_at, dot.id])
    expect(started_at.usec).to eq(123_456)
  end

  it "別の日のDotのcursorは使い回せない" do
    dot = create(:dot).reload

    expect { described_class.after_dot(described_class.for_dot(dot), date: dot.date + 1) }
      .to raise_error(HistoryCursor::Invalid)
  end

  it "一覧のcursorと日の詳細のcursorを取り違えない" do
    dot = create(:dot).reload

    expect { described_class.after_day(described_class.for_dot(dot)) }.to raise_error(HistoryCursor::Invalid)
    expect { described_class.after_dot(described_class.for_day(dot.date), date: dot.date) }
      .to raise_error(HistoryCursor::Invalid)
  end

  it "解釈できない値はInvalidにする" do
    encoded = ["v2:2026-09-28", "v1:2026-02-30", "v1:2026-9-28", "v1:2026-09-28\n", "v1:2026-09-28:x:y"]
              .map { Base64.urlsafe_encode64(it, padding: false) }
    invalid = ["", "not base64!", "a" * 513, *encoded]

    invalid.each do |cursor|
      expect { described_class.after_day(cursor) }.to raise_error(HistoryCursor::Invalid), cursor.inspect
    end
  end

  it "日の詳細のcursorの時刻とidの形を確かめる" do
    date = Date.new(2026, 9, 28)
    invalid = ["v1:2026-09-28:-1:#{SecureRandom.uuid}", "v1:2026-09-28:1:not-a-uuid", "v1:2026-09-28:1"]
              .map { Base64.urlsafe_encode64(it, padding: false) }

    invalid.each do |cursor|
      expect { described_class.after_dot(cursor, date:) }.to raise_error(HistoryCursor::Invalid), cursor.inspect
    end
  end
end
