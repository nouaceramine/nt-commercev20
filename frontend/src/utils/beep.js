// Beep sound utility for barcode scanner success
const audioContext = typeof window !== 'undefined' && window.AudioContext 
  ? new (window.AudioContext || window.webkitAudioContext)() 
  : null;

export const playBeep = (frequency = 800, duration = 150, volume = 0.3) => {
  if (!audioContext) return;
  
  try {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
  } catch (error) {
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
