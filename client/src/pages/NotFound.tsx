import { AlertCircle, Home } from 'lucide-react';
import { useLocation } from 'wouter';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div
      className="min-h-dvh w-full flex items-center justify-center bg-black"
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
    >
      <div className="w-full max-w-lg mx-4 border-4 border-white p-8 text-center">
        <div className="flex justify-center mb-6">
          <AlertCircle className="h-16 w-16 text-red-500" />
        </div>

        <h1 className="text-5xl font-bold text-white mb-2">404</h1>

        <h2 className="text-xl font-bold text-white mb-4">PAGE NOT FOUND</h2>

        <p className="text-white opacity-75 mb-8 leading-relaxed">
          Sorry, the page you are looking for doesn't exist.
          <br />
          It may have been moved or deleted.
        </p>

        <button
          onClick={() => setLocation('/')}
          className="inline-flex items-center gap-2 border-4 border-green-500 text-green-500 font-bold px-6 py-3 hover:bg-green-500 hover:text-black transition-colors"
        >
          <Home className="w-4 h-4" />
          GO HOME
        </button>
      </div>
    </div>
  );
}
