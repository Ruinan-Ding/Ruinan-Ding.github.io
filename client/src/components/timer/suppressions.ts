import { readJSON, writeJSON } from '@/lib/storage';
import { STORAGE_KEYS } from './constants';
import type { DialogState } from './types';

// Questions the user has answered with a dialog's own "Don't ask again"
// checkbox, kept as a list of keys in localStorage so they stay answered
// across a reload. Cleared only by the site RESET, which wipes every
// STORAGE_KEYS entry — including this one — so "until reset" needs no
// code of its own here.
//
// Read straight out of storage on every check rather than mirrored into
// React state: it changes at most once per dialog, it's read on click
// paths only, and two separate components (Timer and WordCounter) ask
// about it independently — a shared hook would exist purely to keep two
// copies in sync with a list this small.

const readKeys = (): string[] => {
  const saved = readJSON<unknown>(STORAGE_KEYS.dontAskAgain, null);
  return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : [];
};

// Which question a dialog is asking — NOT simply its type. Several types
// ask materially different things depending on their mode, and silencing
// one must not silence its siblings: "load this preset onto an idle
// timer" and "switch to it mid-run, losing progress" are the same
// `switch` type but not remotely the same question.
//
// null means the dialog can never be silenced:
// - clearCache is the site RESET, the one action that clears this list.
//   Silencing it would leave no way back once everything else is silent.
// - skipConfirmations is the master switch for confirmations as a whole.
//   Its own dialog exists precisely so that turning them off can't happen
//   by accident, which a "don't ask again" would undo.
export const dialogKey = (dialog: DialogState): string | null => {
  switch (dialog.type) {
    case null:
    case 'clearCache':
    case 'skipConfirmations':
      return null;
    // one question per timer state, not per field: HOURS, MINUTES and
    // SECONDS are three ways of doing the same thing, so answering for
    // one answers for all three — but only while the timer is in the
    // state it was answered in. Adjusting an unstarted timer and
    // adjusting one that's counting down are different questions.
    case 'adjust':
      return `adjust:${dialog.data.state}`;
    case 'switch':
      return `switch:${dialog.mode}`;
    case 'seek':
      return `seek:${dialog.data.mode}`;
    default:
      return dialog.type;
  }
};

export const isDialogSuppressed = (dialog: DialogState): boolean => {
  const key = dialogKey(dialog);
  return key !== null && readKeys().includes(key);
};

export const suppressDialog = (dialog: DialogState) => {
  const key = dialogKey(dialog);
  if (key === null) return;
  const keys = readKeys();
  if (keys.includes(key)) return;
  writeJSON(STORAGE_KEYS.dontAskAgain, [...keys, key]);
};
