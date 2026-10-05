import { afterEach, describe, expect, it, vi } from "vitest";

import { createRecorder } from "./recorder";

// マイクの許可（getUserMedia）を差し替える。実際のマイクは使わない。
function stubMicrophone() {
  const stopTrack = vi.fn();
  let grant: (stream: MediaStream) => void = () => undefined;
  const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    },
  });
  // 許可の後の経路（AudioContext・MediaRecorder）がjsdomでも通るよう、最小の形で差し替える
  class FakeAudioContext {
    state = "running";
    createMediaStreamSource() {
      return { connect: () => undefined };
    }
    createAnalyser() {
      return { fftSize: 0, getByteTimeDomainData: () => undefined };
    }
    close() {
      this.state = "closed";
      return Promise.resolve();
    }
  }
  class FakeMediaRecorder {
    state = "inactive";
    ondataavailable: unknown = null;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
    }
  }
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  return { stopTrack, grantPermission: () => grant(stream) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRecorder", () => {
  it("片付けずに許可されたら、マイクで録音を始める（差し替えた経路が通ることの確認）", async () => {
    const { stopTrack, grantPermission } = stubMicrophone();
    const recorder = createRecorder();

    const starting = recorder.start();
    grantPermission();

    expect(await starting).toBe("mic");
    expect(stopTrack).not.toHaveBeenCalled();
    recorder.dispose();
  });

  it("許可を待っている間に片付けたら、許可の後にマイクのstreamを止めて録音を始めない", async () => {
    const { stopTrack, grantPermission } = stubMicrophone();
    const recorder = createRecorder();

    const starting = recorder.start();
    recorder.dispose();
    grantPermission();

    expect(await starting).toBe("silent");
    expect(stopTrack).toHaveBeenCalled();
  });
});
