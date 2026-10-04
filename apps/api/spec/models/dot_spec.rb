require "rails_helper"

RSpec.describe Dot do
  describe "date" do
    it "started_atのAsia/Tokyoの暦日をDBが算出する。0:00 JSTの前後で日が変わる" do
      before_midnight = create(:dot, started_at: Time.zone.parse("2026-09-27 14:59:59.999999 UTC"))
      at_midnight = create(:dot, started_at: Time.zone.parse("2026-09-27 15:00:00 UTC"))

      expected = [Date.new(2026, 9, 27), Date.new(2026, 9, 28)]

      expect([before_midnight.date, at_midnight.date]).to eq(expected)
      expect([before_midnight, at_midnight].map { it.reload.date }).to eq(expected)
    end

    it "保存した時刻ではなくstarted_atで決まる（日をまたいで保存しても話した日のまま）" do
      travel_to(Time.zone.parse("2026-09-29 01:00:00 UTC")) do
        dot = create(:dot, started_at: Time.zone.parse("2026-09-28 14:50:00 UTC"))

        expect(dot.reload.date).to eq(Date.new(2026, 9, 28))
      end
    end

    it "DBの算出とdate_forが同じ規則で日を決める" do
      times = ["2026-09-27 14:59:59.999999 UTC", "2026-09-27 15:00:00 UTC", "2026-12-31 15:00:00 UTC"]
              .map { Time.zone.parse(it) }

      expect(times.map { create(:dot, started_at: it).reload.date }).to eq(times.map { described_class.date_for(it) })
    end

    it "dateは代入できない（started_atと食い違う値を手元にも作らない）" do
      expect { build(:dot, date: Date.new(2000, 1, 1)) }.to raise_error(ActiveRecord::ReadonlyAttributeError)
    end
  end

  describe "保存" do
    it "同じ日に録音しても追記で、過去のDotを上書きしない" do
      user = create(:user)
      first = create(:dot, user:, started_at: Time.zone.parse("2026-09-28 00:00:00 UTC"), sentence: "朝")
      create(:dot, user:, started_at: Time.zone.parse("2026-09-28 12:00:00 UTC"), sentence: "夜")

      expect(user.dots.order(:started_at).pluck(:sentence)).to eq(%w[朝 夜])
      expect(first.reload.sentence).to eq("朝")
    end

    it "同じ処理から2件目のDotを作らない。別の利用者なら同じ値でも衝突しない" do
      dot = create(:dot)

      expect { create(:dot, user: dot.user, generation_id: dot.generation_id) }
        .to raise_error(ActiveRecord::RecordNotUnique)
      expect(create(:dot, generation_id: dot.generation_id)).to be_persisted
    end

    it "保存に失敗したら行を残さない" do
      expect { create(:dot, duration_seconds: 0) }.to raise_error(ActiveRecord::RecordInvalid)
      expect(described_class.count).to eq(0)
    end

    it "所有者・処理・開始時刻・長さは保存後に変えられない" do
      dot = create(:dot)

      %i[user_id generation_id started_at duration_seconds].each do |attribute|
        expect { dot.public_send(:"#{attribute}=", dot.public_send(attribute)) }
          .to raise_error(ActiveRecord::ReadonlyAttributeError)
      end
    end
  end

  describe "validation" do
    it "sentenceは200文字・summaryは2,000文字まで。空文字は許す" do
      expect(build(:dot, sentence: "あ" * 200, summary: "あ" * 2000)).to be_valid
      expect(build(:dot, sentence: "", summary: "")).to be_valid
      expect(build(:dot, sentence: "あ" * 201)).not_to be_valid
      expect(build(:dot, summary: "あ" * 2001)).not_to be_valid
      expect(build(:dot, sentence: nil)).not_to be_valid
    end

    it "durationは1〜1800秒の整数" do
      expect([0, 1, 1800, 1801].map { build(:dot, duration_seconds: it).valid? }).to eq([false, true, true, false])
    end

    # validationを通らない保存（SQL・一括更新）でも上限を超えないことを確かめるため、あえてvalidationを飛ばす。
    it "validationを通らない保存でも、DBの制約が上限を守る" do
      scope = described_class.where(id: create(:dot).id)

      [{ sentence: "あ" * 201 }, { summary: "あ" * 2001 }, { duration_seconds: 1801 }].each do |values|
        expect { scope.update_all(values) }.to raise_error(ActiveRecord::StatementInvalid) # rubocop:disable Rails/SkipsModelValidations
      end
    end
  end

  describe "scope" do
    it "keptはゴミ箱の外、trashedはゴミ箱の中だけを返す" do
      kept = create(:dot)
      trashed = create(:dot, :trashed)

      expect([described_class.kept.to_a, described_class.trashed.to_a]).to eq([[kept], [trashed]])
    end

    it "既定ではゴミ箱の中も含めて返す（除外は明示する）" do
      create(:dot)
      create(:dot, :trashed)

      expect(described_class.count).to eq(2)
    end

    it "newest_firstはstarted_atの降順、同値ならidの降順" do
      started_at = Time.zone.parse("2026-09-28 03:00:00 UTC")
      same = Array.new(2) { create(:dot, started_at:) }
      newer = create(:dot, started_at: started_at + 1.second)

      expect(described_class.newest_first.to_a).to eq([newer, *same.sort_by(&:id).reverse])
    end
  end
end
