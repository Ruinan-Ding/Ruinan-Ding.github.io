import { useCallback } from 'react';

// Single shared AudioContext — browsers cap how many can exist
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
  const beep = useCallback((frequency: number = 800, duration: number = 200) => {
    try {
      const audioContext = getAudioContext();

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
  }, []);

  return { beep };
};
