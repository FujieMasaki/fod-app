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
    end

    it "sentenceとsummaryはnilにできない" do
      expect([build(:dot, sentence: nil).valid?, build(:dot, summary: nil).valid?]).to eq([false, false])
    end

    it "durationは1〜1800秒の整数" do
      expect([0, 1, 1800, 1801].map { build(:dot, duration_seconds: it).valid? }).to eq([false, true, true, false])
    end

    it "sentenceとsummaryにNUL文字を含めない（DBに保存できないため、validationで止める）" do
      expect([build(:dot, sentence: "一\u0000文").valid?, build(:dot, summary: "\u0000").valid?]).to eq([false, false])
    end

    # validationを通らない保存（SQL・一括更新）でも上限を超えないことを確かめるため、あえてvalidationを飛ばす。
    # 1件ごとにsavepointで包む。包まないと、最初の違反でtestのtransactionが中断し、後の更新が制約と
    # 関係なく失敗してしまう。どの制約で失敗したかも、制約の名前で確かめる。
    it "validationを通らない保存でも、DBの制約が上限を守る" do
      scope = described_class.where(id: create(:dot).id)
      cases = { dots_sentence_length: { sentence: "あ" * 201 }, dots_summary_length: { summary: "あ" * 2001 },
                dots_duration_seconds_range: { duration_seconds: 1801 } }

      cases.each do |constraint, values|
        expect { described_class.transaction(requires_new: true) { scope.update_all(values) } } # rubocop:disable Rails/SkipsModelValidations
          .to raise_error(ActiveRecord::StatementInvalid, /#{constraint}/)
      end
    end

    it "started_atを書き換えればdateも追従する（DBが算出する生成列である）" do
      dot = create(:dot, started_at: Time.zone.parse("2026-09-27 14:00:00 UTC"))

      described_class.where(id: dot.id).update_all(started_at: Time.zone.parse("2026-09-27 15:00:00 UTC")) # rubocop:disable Rails/SkipsModelValidations

      expect(dot.reload.date).to eq(Date.new(2026, 9, 28))
    end
  end

  describe "ログ" do
    let(:log) { StringIO.new }

    around do |example|
      logger = ActiveSupport::Logger.new(log)
      Rails.logger.broadcast_to(logger)
      example.run
    ensure
      Rails.logger.stop_broadcasting_to(logger)
    end

    it "保存・更新のSQLのログにDotの本文を出さない" do
      dot = create(:dot, sentence: "ログに出したくない一文", summary: "ログに出したくない要約")
      dot.update!(sentence: "直したあとの一文")

      expect(log.string).to include("[FILTERED]")
      expect(log.string).not_to include("ログに出したくない", "直したあとの一文")
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

    it "with_total_countは、1件に絞る前の件数を各行に付ける" do
      user = create(:user)
      3.times { create(:dot, user:, started_at: Time.zone.parse("2026-09-28 0#{it}:00:00 UTC")) }

      latest = user.dots.newest_first.with_total_count.first

      expect([latest.total_count, latest]).to eq([3, user.dots.newest_first.first])
    end

    it "by_dayとpluck_day_summariesは、日ごとの件数と、newest_firstの先頭と同じDotのidを新しい日から返す" do
      user = create(:user)
      started_at = Time.zone.parse("2026-09-28 03:00:00 UTC")
      same_time = Array.new(2) { create(:dot, user:, started_at:) }
      older_day = create(:dot, user:, started_at: started_at - 1.day)

      expect(user.dots.by_day.pluck_day_summaries).to eq(
        [[Date.new(2026, 9, 28), 2, user.dots.on_date(Date.new(2026, 9, 28)).newest_first.first.id],
         [Date.new(2026, 9, 27), 1, older_day.id]]
      )
      expect(same_time.map(&:id)).to include(user.dots.by_day.pluck_day_summaries.first.last)
    end

    it "newest_firstはstarted_atの降順、同値ならidの降順" do
      started_at = Time.zone.parse("2026-09-28 03:00:00 UTC")
      same = Array.new(2) { create(:dot, started_at:) }
      newer = create(:dot, started_at: started_at + 1.second)

      expect(described_class.newest_first.to_a).to eq([newer, *same.sort_by(&:id).reverse])
    end
  end
end
