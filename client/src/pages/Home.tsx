import Timer from '@/components/Timer';

/**
 * Home Page - Timer Application
 * 
 * Minimalist Brutalism Design:
 * - Full viewport timer interface with sidebar history
 * - Stark black background with pure white text
 * - Monospace typography for digital precision
 * - No unnecessary UI elements
 */

export default function Home() {
  return (
    <div className="w-full h-screen bg-black">
      <Timer />
    </div>
  );
}
