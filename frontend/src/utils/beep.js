// Beep sound utility for barcode scanner success.
// AudioContext is created lazily on the first beep — constructing it at module-load
// time can throw "Illegal constructor" on browsers that block it before a user
// gesture, breaking pages that import this file.
let audioContext = null;

const getCtx = () => {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (typeof Ctor !== 'function') return null;
  try {
    audioContext = new Ctor();
    return audioContext;
  } catch (_e) {
    return null;
  }
};

export const playBeep = (frequency = 800, duration = 150, volume = 0.3) => {
  const ctx = getCtx();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch (_error) {
    /* ignore */
  }
};

// Success beep - higher pitch
export const playSuccessBeep = () => playBeep(1000, 100, 0.3);

// Error beep - lower pitch, longer
export const playErrorBeep = () => playBeep(300, 300, 0.3);

// Double beep for special actions
export const playDoubleBeep = () => {
  playBeep(800, 80, 0.2);
  setTimeout(() => playBeep(1000, 80, 0.2), 100);
};
