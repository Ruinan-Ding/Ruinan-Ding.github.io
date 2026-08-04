import { useEffect, useRef } from 'react';

// Draws the timer state into the favicon: a green triangle while running,
// pulsing yellow bars when paused, a pulsing red square when finished, and
// a "WT" logo that writes itself stroke by stroke while idle.

interface FaviconState {
  isRunning: boolean;
  isPaused: boolean;
  isFinished: boolean;
  minutes: number;
  seconds: number;
  hours: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

// Blocky polylines in 64x64 canvas coordinates, so the logo can be drawn
// stroke by stroke: the W first, then the T's bar and stem.
const WT_STROKES: [number, number][][] = [
  [[2, 14], [9, 50], [15, 26], [21, 50], [28, 14]],
  [[36, 14], [58, 14]],
  [[47, 14], [47, 50]],
];
const WT_TOTAL_LENGTH = WT_STROKES.reduce((total, stroke) => {
  for (let i = 1; i < stroke.length; i++) {
    total += Math.hypot(stroke[i][0] - stroke[i - 1][0], stroke[i][1] - stroke[i - 1][1]);
  }
  return total;
}, 0);
// One cycle: the writing portion, then a hold at the full logo.
const WT_DRAW_MS = 2200;
const WT_CYCLE_MS = 3200;

export const useFavicon = (
  isRunning: boolean,
  isPaused: boolean,
  isFinished: boolean,
  minutes: number,
  seconds: number,
  hours: number = 0
) => {
  // Carries the latest values into the redraw interval's callback.
  const stateRef = useRef<FaviconState>({ isRunning, isPaused, isFinished, minutes, seconds, hours });
  stateRef.current = { isRunning, isPaused, isFinished, minutes, seconds, hours };

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    const drawFavicon = (shape: 'triangle' | 'bars' | 'square' | 'default', opacity: number = 1) => {
      // Opaque for the background specifically. A canvas keeps its alpha
      // between calls, so this fill ran at whatever the last frame faded
      // to: at 0.02 it cleared almost nothing and the pulse stacked frame
      // on frame instead of fading.
      ctx.globalAlpha = 1;
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
        // Spends the length budget stroke by stroke; the redraw interval
        // advances it every 50ms.
        ctx.strokeStyle = '#1a1a1a';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'miter';
        let budget = Math.min(1, (Date.now() % WT_CYCLE_MS) / WT_DRAW_MS) * WT_TOTAL_LENGTH;
        for (const stroke of WT_STROKES) {
          if (budget <= 0) break;
          ctx.beginPath();
          ctx.moveTo(stroke[0][0], stroke[0][1]);
          for (let i = 1; i < stroke.length; i++) {
            const [x1, y1] = stroke[i - 1];
            const [x2, y2] = stroke[i];
            const segment = Math.hypot(x2 - x1, y2 - y1);
            if (budget >= segment) {
              ctx.lineTo(x2, y2);
              budget -= segment;
            } else {
              ctx.lineTo(x1 + ((x2 - x1) * budget) / segment, y1 + ((y2 - y1) * budget) / segment);
              budget = 0;
              break;
            }
          }
          ctx.stroke();
        }
      }
    };

    const getTimeDisplay = () => {
      const { hours, minutes, seconds, isFinished } = stateRef.current;
      const base = hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${pad(minutes)}:${pad(seconds)}`;
      // The values are magnitudes; overtime shows as negative in the tab.
      return isFinished ? `-${base}` : base;
    };

    // The running triangle is static and the idle logo saturates once it
    // finishes drawing, so this tracks what was last drawn and skips the
    // canvas redraw and favicon re-encode once the pixels stop changing,
    // rather than doing that work 20x a second for an identical image.
    let lastSignature: string | null = null;

    const updateFavicon = () => {
      const { isRunning, isPaused, isFinished } = stateRef.current;
      const timeDisplay = getTimeDisplay();
      const now = Date.now();
      let shape: 'triangle' | 'bars' | 'square' | 'default';
      let opacity = 1;

      // Paused wins over finished, so a paused overtime alarm shows the
      // bars and matches the on-page PAUSED status.
      if (isPaused) {
        shape = 'bars';
        const cycleTime = 1000;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Write Timer`;
      } else if (isFinished) {
        shape = 'square';
        const cycleTime = 300;
        const cycle = Math.floor((now / cycleTime) % 2);
        const progress = (now % cycleTime) / cycleTime;
        opacity = cycle === 0 ? progress : 1 - progress;
        document.title = `${timeDisplay} - Write Timer`;
      } else if (isRunning) {
        shape = 'triangle';
        document.title = `${timeDisplay} - Write Timer`;
      } else {
        shape = 'default';
        document.title = `Write Timer`;
      }

      const drawFraction = Math.min(1, (now % WT_CYCLE_MS) / WT_DRAW_MS);
      const signature = shape === 'default'
        ? `default:${drawFraction >= 1 ? 'full' : drawFraction.toFixed(3)}`
        : `${shape}:${opacity.toFixed(2)}`;
      if (signature === lastSignature) return;
      lastSignature = signature;

      drawFavicon(shape, opacity);

      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      // index.html's static favicon declares itself SVG, which is right
      // for that initial image, but the href below is a canvas-rendered
      // PNG, so the type has to be corrected with it.
      favicon.type = 'image/png';
      favicon.href = canvas.toDataURL();
    };

    updateFavicon();
    const interval = setInterval(updateFavicon, 50);

    return () => clearInterval(interval);
  }, []);
};
