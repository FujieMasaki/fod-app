import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dot, Ripple, Text, Waveform, StopIcon } from "@/design-system";
import { useSession } from "@/features/session";
import { formatDuration } from "@/utils/format-duration";
import { useRecorder } from "../../hooks/use-recorder";
import styles from "./recording-stage.module.css";

const CIRCLE_SIZE = 176;

/** 録音中の主要ブロック。マウントで録音開始、停止で Processing へ委ねる。 */
export function RecordingStage() {
  const navigate = useNavigate();
  const { setRecordedDuration } = useSession();
  const { elapsedSec, isRecording, getAmplitude, start, stop } = useRecorder();
  const [stopping, setStopping] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
  }, [start]);

  const handleStop = async () => {
    if (stopping) return;
    setStopping(true);
    const { durationSec } = await stop();
    setRecordedDuration(durationSec || elapsedSec);
    navigate({ to: "/processing" });
  };

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Text variant="title" as="h1">
          話しています…
        </Text>
        <Text variant="body" tone="secondary">
          安心して、自由に話してください。
        </Text>
      </div>

      <div className={styles.middle}>
        <div
          className={styles.stage}
          role="status"
          aria-label={`録音中 ${formatDuration(elapsedSec)}`}
        >
          <Ripple size={CIRCLE_SIZE} />
          <Dot size={CIRCLE_SIZE} variant="solid" breathe>
            <span className={styles.timer}>{formatDuration(elapsedSec)}</span>
          </Dot>
        </div>

        <Waveform getAmplitude={getAmplitude} active={isRecording} />
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.stopButton}
          onClick={handleStop}
          disabled={stopping}
          aria-label="話し終える"
        >
          <StopIcon />
        </button>
        <Text variant="small" tone="tertiary">
          話し終える
        </Text>
      </div>
    </div>
  );
}
