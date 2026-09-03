"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import styles from "./waveform.module.css";

type WaveformProps = {
  /** 現在の声量(0..1)を返す関数。マイク未接続時は 0 付近を返す想定。 */
  getAmplitude: () => number;
  barCount?: number;
  active?: boolean;
};

const MIN_SCALE = 0.12;

/**
 * マイク入力の振幅にバー高さを追随させる（rAF で更新）。無音時は静止に近い。
 * reduced-motion では追随を止め、静かな一定表示にする。
 */
export function Waveform({ getAmplitude, barCount = 28, active = true }: WaveformProps) {
  const reduce = useReducedMotion();
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);

  // 中央が高い左右対称のプロファイル（波形の見た目づくり）
  const profile = useRef<number[]>(
    Array.from({ length: barCount }, (_, i) => {
      const t = i / (barCount - 1); // 0..1
      const centered = 1 - Math.abs(t - 0.5) * 2; // 0..1..0
      return 0.35 + centered * 0.65;
    }),
  );

  useEffect(() => {
    if (reduce || !active) {
      barsRef.current.forEach((bar, i) => {
        if (bar) bar.style.transform = `scaleY(${MIN_SCALE + profile.current[i] * 0.12})`;
      });
      return;
    }

    let raf = 0;
    const smoothed = new Array(barCount).fill(MIN_SCALE);

    const tick = () => {
      const amp = Math.min(1, Math.max(0, getAmplitude()));
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        // 声量 × バーごとの重み + わずかな揺らぎ
        const jitter = 0.85 + Math.sin(Date.now() / 120 + i) * 0.15;
        const target = MIN_SCALE + amp * profile.current[i] * jitter;
        smoothed[i] += (target - smoothed[i]) * 0.35; // 補間で滑らかに
        bar.style.transform = `scaleY(${Math.min(1, smoothed[i])})`;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getAmplitude, reduce, active, barCount]);

  return (
    <div className={styles.root} aria-hidden>
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className={styles.bar}
        />
      ))}
    </div>
  );
}
