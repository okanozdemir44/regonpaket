/** Web Audio API ile dikkat çekici yeni paket bildirimi */
export function playNewPackageAlert(): void {
  if (typeof window === "undefined") return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const tones = [
      { freq: 880, start: 0, dur: 0.14 },
      { freq: 1175, start: 0.16, dur: 0.14 },
      { freq: 1397, start: 0.32, dur: 0.22 },
    ];

    for (const tone of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = tone.freq;
      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.22, now + tone.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.start + tone.dur
      );
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.dur + 0.02);
    }

    window.setTimeout(() => {
      void ctx.close();
    }, 900);
  } catch {
    // Ses engelli ortamlarda sessiz geç
  }
}
