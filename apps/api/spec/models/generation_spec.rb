require "rails_helper"

RSpec.describe Generation do
  describe ".transition" do
    it "遷移元が一致するときだけ移し、最終進捗時刻を進める" do
      generation = create(:generation, last_progress_at: 1.hour.ago)

      expect(described_class.transition(generation.id, from: "uploading", to: "accepted")).to be(true)
      expect(generation.reload)
        .to have_attributes(state: "accepted", last_progress_at: be_within(1.second).of(Time.current))
    end

    it "遷移元が違えば移さずfalseを返す（読んでから書く競合で両方が勝たない）" do
      generation = create(:generation, state: "failed")

      first = described_class.transition(generation.id, from: "failed", to: "transcribing")
      second = described_class.transition(generation.id, from: "failed", to: "cancel_requested")

      expect([first, second]).to eq([true, false])
      expect(generation.reload.state).to eq("transcribing")
    end

    it "知らない状態へは移さない" do
      generation = create(:generation)

      expect { described_class.transition(generation.id, from: "uploading", to: "done") }.to raise_error(ArgumentError)
    end
  end

  describe "DBの制約" do
    %w[state failure_kind cancel_reason].each do |column|
      it "#{column}の値を限る" do
        generation = create(:generation)

        expect { generation.update_column(column, "unknown") } # rubocop:disable Rails/SkipsModelValidations
          .to raise_error(ActiveRecord::StatementInvalid, /check constraint/)
      end
    end

    it "処理IDは一意で、同じattemptの2件目の記録を作れない" do
      generation = create(:generation)

      expect { create(:generation, id: generation.id) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "記録が残っている利用者の行は消せない（後片付けの情報を黙って失わない）" do
      generation = create(:generation)

      expect { generation.user.delete }.to raise_error(ActiveRecord::InvalidForeignKey)
    end
  end

  describe "#contract_failure_kind" do
    it "送信の失敗と無音はそのまま、それ以外はprocessing_failedにまとめる" do
      kinds = Generation::FAILURE_KINDS.index_with { build(:generation, failure_kind: it).contract_failure_kind }

      expect(kinds).to eq(
        "upload_incomplete" => "upload_incomplete", "empty_recording" => "empty_recording",
        "transcription_failed" => "processing_failed", "generation_failed" => "processing_failed",
        "invalid_output" => "processing_failed", "persist_failed" => "processing_failed"
      )
    end
  end

  describe "#transcript_returnable?" do
    it "書き出し済みで、返さない印が無く、期限内で、取り消されていないときだけ返す" do
      returnable = build(:generation, :transcribed)

      expect(returnable.transcript_returnable?).to be(true)
      expect(build(:generation, :transcribing).transcript_returnable?).to be(false)
      expect(build(:generation, :transcribed, transcript_withheld_at: Time.current).transcript_returnable?).to be(false)
      expect(build(:generation, :transcribed, accepted_at: 25.hours.ago).transcript_returnable?).to be(false)
      expect(build(:generation, :transcribed, state: "cleanup_pending").transcript_returnable?).to be(false)
    end
  end
end
