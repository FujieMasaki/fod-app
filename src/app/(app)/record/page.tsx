import { ScreenLayout } from "@/components/screen-layout/screen-layout";
import { RecordingStage } from "@/features/recording";

// フロー中は没入のため TabBar を表示しない。
export default function RecordPage() {
  return (
    <ScreenLayout>
      <RecordingStage />
    </ScreenLayout>
  );
}
