import { useEffect, useState } from 'react';

// What the confirm key is called on the keyboard actually plugged in.
// The handler matches the physical position, and on a layout where that
// position is not a backquote the printed hint would name a glyph the
// user cannot type. Chromium answers this; everywhere else the
// backquote is the honest guess, which is what it renders until then.
//
// Shared by every dialog that takes the key, so they can't name it two
// different ways.
export function useConfirmKeyLabel() {
  const [keyLabel, setKeyLabel] = useState('`');
  useEffect(() => {
    // Not in the DOM lib yet, so the shape it is called with is spelled out.
    const keyboard = (navigator as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
    keyboard?.getLayoutMap?.()
      // One printable character or nothing: this is drawn inside the
      // button and handed to aria-keyshortcuts, where a label with a space
      // in it is announced as two shortcuts and a long one (JIS names this
      // key) stretches the hint.
      .then((map) => { const label = map.get('Backquote'); if (label?.length === 1 && label.trim()) setKeyLabel(label); })
      .catch(() => { /* no layout to read; the guess stands */ });
  }, []);
  return keyLabel;
}
