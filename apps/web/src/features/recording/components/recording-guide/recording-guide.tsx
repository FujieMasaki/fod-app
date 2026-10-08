import { Button, Text } from "@/design-system";
import styles from "./recording-guide.module.css";

/**
 * 録音前の案内。認証を確かめた後、マイクを起動する前に出す（journaling.md §4）。
 * 文面はTASK-010 Plan §7-1。期間と削除の契機の正本はprivacy.md §5で、「保存しません」「◯時間で消えます」とは書かない。
 * 約束するのは、やり直せる期限と、いつ削除処理を始めるかまで（privacy.md §5-2）。
 */
const GUIDE_ITEMS: readonly { heading: string; body: string }[] = [
  {
    heading: "送る先",
    body: "録音した音声は、Focus on Dotのサーバーを経由して、文字起こし（Amazon Transcribe、東京リージョン）と、今日の一文と要約の生成（Amazon BedrockのClaude）へ渡ります。",
  },
  {
    // 生成の推論経路（国内か国外か）と、委託先での保持・人によるレビューの有無は、TASK-009の記録とTASK-025の
    // 確認が済むまで確定させない。未確認の事実（「国内で処理する」「保持しない」など）を書かない（TASK-010 Plan §5）。
    heading: "処理する場所",
    body: "生成を行う国と、委託先での保持や人による確認の有無は、確認が済んでからここに記載します。",
  },
  {
    heading: "音声の預かり",
    body: "音声は、Dotを作るあいだだけお預かりします。うまくいかなかったときは、受け付けから24時間はやり直せます。Dotができた時点、または期限を過ぎたあとに削除処理を始めます。",
  },
  {
    heading: "文字起こし",
    body: "文字起こしの全文も、この端末が受け取るまでお預かりします。受け取った時点、または受け付けから24時間を過ぎたあとに削除処理を始めます。全文はこのタブを閉じるまで、この端末で読めます。残るのは「今日の一文」と「話した内容の要約」です。",
  },
  {
    heading: "削除が遅れる場合",
    body: "障害が起きたときは、削除が遅れることがあります。外部へ渡った内容を、すぐに消せるとは約束できません。",
  },
  {
    heading: "Dot",
    body: "Dotはあなただけが見られます。1件ずつ削除でき、退会するとすべてが削除の対象になります。",
  },
  {
    heading: "ほかの人のこと",
    body: "ほかの人の実名や住所・連絡先は、必要がなければ言い換えて話せます（例:「同僚のAさん」）。",
  },
  {
    heading: "長さ",
    body: "1回の録音は30分までです。",
  },
];

type RecordingGuideProps = {
  onStart: () => void;
  onCancel: () => void;
};

export const RecordingGuide = ({ onStart, onCancel }: RecordingGuideProps) => {
  return (
    <section className={styles.root} aria-labelledby="recording-guide-title">
      <div className={styles.head}>
        <Text variant="title" as="h1" id="recording-guide-title">
          録音の前に
        </Text>
        <Text variant="body" tone="secondary">
          話した内容がどう扱われるかを確かめてから、始めてください。
        </Text>
      </div>

      <dl className={styles.items}>
        {GUIDE_ITEMS.map((item) => (
          <div key={item.heading} className={styles.item}>
            <dt className={styles.itemHeading}>{item.heading}</dt>
            <dd className={styles.itemBody}>{item.body}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.actions}>
        <Button onClick={onStart}>録音を始める</Button>
        <Text variant="small" tone="tertiary" align="center">
          始めると、ブラウザがマイクの使用の許可を求めます。
        </Text>
        <Button variant="ghost" onClick={onCancel}>
          やめる
        </Button>
      </div>
    </section>
  );
};
