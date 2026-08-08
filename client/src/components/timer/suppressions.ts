import { readJSON, writeJSON } from '@/lib/storage';
import { STORAGE_KEYS } from './constants';
import type { DialogState } from './types';

// Questions answered with a dialog's "Don't ask again" checkbox, kept in
// localStorage so they stay answered across a reload. The site RESET wipes
// every STORAGE_KEYS entry including this one, so "until reset" needs no
// code here.
//
// Read from storage on each check rather than mirrored into React state:
// it changes at most once per dialog, only on click paths, and both Timer
// and WordCounter read it independently.

const readKeys = (): string[] => {
  const saved = readJSON<unknown>(STORAGE_KEYS.dontAskAgain, null);
  return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : [];
};

// Which question a dialog is asking, which is not the same as its type:
// several types ask different things depending on their mode, and
// silencing one must not silence its siblings. "Load this preset onto an
// idle timer" and "switch to it mid-run, losing progress" are both
// `switch`.
//
// null means the dialog can never be silenced. Only clearCache: it is the
// site RESET, the one action that clears this list, so silencing it would
// leave no way back once everything else was silent.
export const dialogKey = (dialog: DialogState): string | null => {
  switch (dialog.type) {
    case null:
    case 'clearCache':
      return null;
    // One question per timer state, not per field. HOURS, MINUTES and
    // SECONDS do the same thing, so answering for one answers for all
    // three, but only in the state it was answered in.
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

// Dialogs that report what happened rather than ask whether it should.
// They get one OK and no CANCEL, and dismissing lands on the same result
// as OK does, since there's nothing there to decline.
export const isAcknowledgement = (dialog: DialogState): boolean =>
  dialog.type === 'correctPreset' || dialog.type === 'duplicatePreset';

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
