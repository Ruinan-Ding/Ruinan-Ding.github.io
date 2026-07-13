import { useEffect, useRef } from 'react';

// Draws the timer state into the favicon: green triangle while running,
// pulsing yellow bars when paused, pulsing red square when finished

interface FaviconState {
  isRunning: boolean;
  isPaused: boolean;
  isFinished: boolean;
  minutes: number;
  seconds: number;
  hours: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

export const useFavicon = (
  isRunning: boolean,
  isPaused: boolean,
  isFinished: boolean,
  minutes: number,
  seconds: number,
  hours: number = 0
) => {
  // ref carries the latest values into the redraw interval's callback
  const stateRef = useRef<FaviconState>({ isRunning, isPaused, isFinished, minutes, seconds, hours });
  stateRef.current = { isRunning, isPaused, isFinished, minutes, seconds, hours };

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const drawFavicon = (shape: 'triangle' | 'bars' | 'square' | 'default', opacity: number = 1) => {
      ctx.fillStyle = '#9ca3af';
      ctx.fillRect(0, 0, 64, 64);

      ctx.globalAlpha = opacity;

      if (shape === 'triangle') {
        ctx.fillStyle = '#4ade80';
        ctx.beginPath();
        ctx.moveTo(8, 4);
        ctx.lineTo(8, 60);
        ctx.lineTo(60, 32);
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'bars') {
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#ffeb3b';
        ctx.fillRect(6, 8, 20, 48);
        ctx.fillRect(38, 8, 20, 48);
        ctx.shadowBlur = 0;
      } else if (shape === 'square') {
        ctx.fillStyle = '#f87171';
        ctx.fillRect(8, 8, 48, 48);
      } else if (shape === 'default') {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ST', 32, 32);
      }
    };

    const getTimeDisplay = () => {
      const { hours, minutes, seconds } = stateRef.current;
      return hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
    };

    const updateFavicon = () => {
      const { isRunning, isPaused, isFinished } = stateRef.current;
      const timeDisplay = getTimeDisplay();
      const now = Date.now();
      let opacity = 1;

      if (isFinished) {
        const cycleTime = 300;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('square', opacity);
      } else if (isPaused) {
        const cycleTime = 1000;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('bars', opacity);
      } else if (isRunning) {
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('triangle', 1);
      } else {
        document.title = `Study Timer`;
        drawFavicon('default', 1);
      }

      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.type = 'image/x-icon';
        document.head.appendChild(favicon);
      }
      favicon.href = canvas.toDataURL();
    };

    updateFavicon();
    const interval = setInterval(updateFavicon, 50);

    return () => clearInterval(interval);
  }, []);
};
