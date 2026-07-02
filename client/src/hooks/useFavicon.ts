import { useEffect } from 'react';

/**
 * useFavicon Hook - Update favicon with colored shapes based on timer state
 * 
 * Icons:
 * - Green triangle when running (solid)
 * - Yellow bars fading slowly when paused
 * - Red square fading quickly when finished
 * - ST (Study Timer) when stopped
 */

export const useFavicon = (
  isRunning: boolean,
  isPaused: boolean,
  isFinished: boolean,
  minutes: number,
  seconds: number,
  hours: number = 0
) => {
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const drawFavicon = (shape: 'triangle' | 'bars' | 'square' | 'default', opacity: number = 1) => {
      // Clear canvas and add gray background
      ctx.fillStyle = '#9ca3af'; // Gray background
      ctx.fillRect(0, 0, 64, 64);

      ctx.globalAlpha = opacity;

      if (shape === 'triangle') {
        // Green triangle pointing right - maximized - brighter
        ctx.fillStyle = '#4ade80'; // Brighter green
        ctx.beginPath();
        ctx.moveTo(8, 4);        // Top left
        ctx.lineTo(8, 60);       // Bottom left
        ctx.lineTo(60, 32);      // Right point
        ctx.closePath();
        ctx.fill();
      } else if (shape === 'bars') {
        // Two yellow horizontal bars (pause bars) - maximized with glow
        // Add glow effect
        ctx.shadowColor = '#eab308';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#ffeb3b'; // Brighter yellow
        // Left bar
        ctx.fillRect(6, 8, 20, 48);
        // Right bar
        ctx.fillRect(38, 8, 20, 48);
        // Reset shadow
        ctx.shadowBlur = 0;
      } else if (shape === 'square') {
        // Red square - maximized - brighter
        ctx.fillStyle = '#f87171'; // Brighter red
        ctx.fillRect(8, 8, 48, 48);
      } else if (shape === 'default') {
        // ST (Study Timer) text - maximized, darker on gray
        ctx.fillStyle = '#1a1a1a'; // Darker for better contrast
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ST', 32, 32);
      }
    };

    const getTimeDisplay = () => {
      if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      } else {
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      }
    };

    const timeDisplay = getTimeDisplay();

    const updateFavicon = () => {
      const now = Date.now();
      let opacity = 1;

      if (isFinished) {
        // Red square fades very quickly (300ms cycle - twice as fast)
        const cycleTime = 300;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('square', opacity);
      } else if (isPaused) {
        // Yellow bars fade slowly (1000ms cycle)
        const cycleTime = 1000;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('bars', opacity);
      } else if (isRunning) {
        // Green triangle (solid, no fade)
        document.title = `${timeDisplay} - Study Timer`;
        drawFavicon('triangle', 1);
      } else {
        // Default state - ST favicon
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

    // Initial draw
    updateFavicon();

    // Update favicon and tab title every 50ms for smooth animation
    const interval = setInterval(updateFavicon, 50);

    return () => clearInterval(interval);
  }, [isRunning, isPaused, isFinished, minutes, seconds, hours]);
};
