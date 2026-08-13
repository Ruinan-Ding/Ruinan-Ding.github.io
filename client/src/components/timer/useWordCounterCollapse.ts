import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readJSON } from '@/lib/storage';
import { useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from './constants';

// Which of its three views the word counter is in, and the measuring that
// takes it out of one. Collapsed, auto-collapsed and fullscreen are one
// state rather than three: collapsing has to leave fullscreen, un-hiding
// has to put it back, and only a collapse this made can be reversed by it.
//
// Takes the textarea because that is half of what gets measured — the
// chrome overflows, the typing area shrinks silently, and either one makes
// the box unusable.
export function useWordCounterCollapse(textareaRef: React.RefObject<HTMLTextAreaElement | null>) {
  // Both persisted, so a reload comes back to the view you left. The site
  // RESET clears them with every other key.
  const [isFullscreen, setIsFullscreen] = useState(() => readBoolean(STORAGE_KEYS.wordCounterFullscreen, false));
  const [isCollapsed, setIsCollapsed] = useState(() => readBoolean(STORAGE_KEYS.wordCounterCollapsed, false));
  // The window this box needed when auto-collapse last fired, null
  // otherwise. Reaching it is this app's proxy for "there's room again":
  // the expanded content isn't in the DOM to re-measure once collapsed.
  // A need rather than the size at the time — see where it's recorded.
  //
  // Saved, so a reload doesn't replay the collapse in front of you: with
  // the size in memory only, an auto-collapse couldn't be persisted
  // without reading back as a manual one, so every refresh came back
  // expanded, overflowed its share of the column, and snapped shut again.
  // Restored it comes back already collapsed, and still reopens itself
  // once the window grows past the size below.
  const [savedCollapsedAt] = useState(() => readJSON<{ w: number; h: number } | null>(STORAGE_KEYS.wordCounterCollapsedAt, null));
  // True only when the auto-collapse below forced it, never for a manual
  // toggle. The collapse arrow hides itself while this is set, since
  // clicking it would bounce straight back on the next check().
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(savedCollapsedAt !== null);
  const collapsedAtSizeRef = useRef(savedCollapsedAt);
  // check() reads state through refs, not closures. Window resize and the
  // ResizeObserver can both fire the same closure from an effect run whose
  // state has since gone stale.
  const isCollapsedRef = useRef(isCollapsed);
  isCollapsedRef.current = isCollapsed;
  const containerRef = useRef<HTMLDivElement | null>(null);

  usePersisted(STORAGE_KEYS.wordCounterCollapsed, isCollapsed);
  // Null for a manual collapse, which is what tells the two apart on the
  // way back in.
  usePersisted(STORAGE_KEYS.wordCounterCollapsedAt, isAutoCollapsed ? collapsedAtSizeRef.current : null);
  usePersisted(STORAGE_KEYS.wordCounterFullscreen, isFullscreen);

  // Collapsing has to leave fullscreen too, since there's no such thing as
  // a hidden-but-fullscreen view. Remembered here so un-hiding restores
  // whichever view was showing. Both the manual toggle and the
  // auto-collapse go through this one function, so the ref can't go stale
  // relative to whichever path triggered the collapse.
  const wasFullscreenBeforeCollapseRef = useRef(false);
  const collapse = () => {
    wasFullscreenBeforeCollapseRef.current = isFullscreen;
    setIsFullscreen(false);
    setIsCollapsed(true);
  };
  const toggleCollapsed = () => {
    // Clearing this stops the auto-collapse check treating a deliberate
    // click as something it caused, and later reversing it.
    collapsedAtSizeRef.current = null;
    setIsAutoCollapsed(false);
    if (isCollapsed) {
      setIsFullscreen(wasFullscreenBeforeCollapseRef.current);
      setIsCollapsed(false);
    } else {
      collapse();
    }
  };

  // Collapses once the timer above leaves too little of the shared column
  // for this box's chrome, rather than clipping it, and reverses once the
  // window grows back past the size it collapsed at. Skipped in
  // fullscreen, which is a fixed overlay and competes for nothing.
  //
  // The reversal only ever undoes its own collapse. A manual collapse
  // leaves collapsedAtSizeRef null and is never fought; re-opening one by
  // hand gets a fresh measurement, and if there's still no room this puts
  // it straight back.
  useEffect(() => {
    if (isFullscreen) return;
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      if (isCollapsedRef.current) {
        if (
          collapsedAtSizeRef.current &&
          window.innerWidth >= collapsedAtSizeRef.current.w &&
          window.innerHeight >= collapsedAtSizeRef.current.h
        ) {
          collapsedAtSizeRef.current = null;
          setIsAutoCollapsed(false);
          setIsFullscreen(wasFullscreenBeforeCollapseRef.current);
          setIsCollapsed(false);
        }
        return;
      }
      // Two ways this stops being usable, and only one of them overflows.
      // The chrome is fixed height and spills once the column can't hold
      // it; the textarea is flex-1 min-h-0 and shrinks silently to a few
      // pixels instead. A box you can't fit one line into is as unusable
      // as a clipped one, so the typing area is measured against a single
      // line box read off the element, which tracks the current viewport.
      const textarea = textareaRef.current;
      const style = textarea && getComputedStyle(textarea);
      const oneLine = style
        ? parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        : 0;
      // How far short this box is, by whichever of the two measures is
      // worse. Positive on exactly the cases the two conditions used to be
      // an OR of.
      const shortBy = Math.max(
        el.scrollHeight - el.clientHeight,
        textarea ? oneLine - textarea.clientHeight : 0,
      );
      if (shortBy > 0) {
        // The window this box NEEDED, not the one it happens to be in.
        // Collapsing doesn't resize the window, so "grown back to what it
        // was" is already true the moment this commits: it reopened into
        // the same shortage, collapsed again, and ping-ponged for as long
        // as the window sat at that size. Same trap the timer's own
        // auto-tuck documents and avoids by recording a need.
        //
        // Doubled because this panel and the timer row are both flex-1
        // off the same free space, so each pixel the window gains is split
        // between them and only half of it lands here.
        collapsedAtSizeRef.current = { w: window.innerWidth, h: window.innerHeight + 2 * shortBy };
        setIsAutoCollapsed(true);
        collapse();
      }
    };
    check();
    window.addEventListener('resize', check);
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(el);
    return () => {
      window.removeEventListener('resize', check);
      resizeObserver.disconnect();
    };
  }, [isFullscreen, isCollapsed]);

  return { isFullscreen, setIsFullscreen, isCollapsed, isAutoCollapsed, toggleCollapsed, containerRef };
}
