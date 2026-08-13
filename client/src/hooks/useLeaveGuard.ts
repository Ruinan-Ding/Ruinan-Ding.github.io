import { useEffect, useRef } from 'react';

// Leaving mid-run throws the run away, so it asks first. The browser owns
// this one: its own wording, no styling, and quiet until the page has been
// interacted with. Nothing this app can draw holds up an unload, so
// beforeunload is all there is.
//
// Registered only while `armed`. An idle page carries no beforeunload
// listener and keeps the bfcache eligibility a permanent one would cost.
//
// Returns the escape hatch: set it before a reload the app asks for
// itself, which has already been confirmed once.
export function useLeaveGuard(armed: boolean) {
  const isSelfReloadingRef = useRef(false);
  useEffect(() => {
    if (!armed) return;
    const confirmLeave = (e: BeforeUnloadEvent) => {
      if (isSelfReloadingRef.current) return;
      e.preventDefault();
      // Chrome and Edge before 119 ignore preventDefault on its own.
      e.returnValue = true;
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [armed]);
  return isSelfReloadingRef;
}
