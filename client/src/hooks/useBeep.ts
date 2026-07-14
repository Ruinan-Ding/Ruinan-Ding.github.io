import { useCallback, useRef } from 'react';

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

// volume: 0-1, applied to every beep unless a call passes its own override
// (used to preview a specific level while dragging the volume slider)
export const useBeep = (volume: number = 1) => {
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const beep = useCallback((frequency: number = 800, duration: number = 200, volumeOverride?: number) => {
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
      // exponentialRampToValueAtTime requires values > 0
      const peak = Math.max(0.0001, volumeOverride ?? volumeRef.current);

      gainNode.gain.setValueAtTime(peak, startTime);
      gainNode.gain.exponentialRampToValueAtTime(peak * 0.01, endTime);

      oscillator.start(startTime);
      oscillator.stop(endTime);
    } catch (e) {
      console.error('Beep failed:', e);
    }
  }, []);

  return { beep };
};
