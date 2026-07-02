/**
 * useBeep Hook - Generate beeping sounds
 * 
 * Uses Web Audio API to create beeping tones without external audio files
 * IMPORTANT: Uses a singleton AudioContext to avoid browser limits
 */

// Singleton AudioContext - shared across all beep calls
let audioContextInstance: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContextInstance) {
    try {
      audioContextInstance = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error('Failed to create AudioContext:', e);
      throw e;
    }
  }
  return audioContextInstance;
};

export const useBeep = () => {
  const beep = (frequency: number = 800, duration: number = 200) => {
    try {
      const audioContext = getAudioContext();
      
      // Resume audio context if suspended (required by some browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      const startTime = audioContext.currentTime;
      const endTime = startTime + duration / 1000;

      gainNode.gain.setValueAtTime(1, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

      oscillator.start(startTime);
      oscillator.stop(endTime);
    } catch (e) {
      console.error('Beep failed:', e);
    }
  };

  const beepSequence = async (count: number = 3, frequency: number = 800, duration: number = 200, interval: number = 300) => {
    for (let i = 0; i < count; i++) {
      beep(frequency, duration);
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  };

  return { beep, beepSequence };
};
