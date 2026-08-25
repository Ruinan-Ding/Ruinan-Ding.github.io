import { readBoolean, readJSON, writeJSON } from '@/lib/storage';
import { STORAGE_KEYS } from './constants';
import type { ConfirmMode, DialogState, FullAct } from './types';

// Questions answered with a dialog's "Don't ask again" checkbox, kept in
// localStorage so they stay answered across a reload. The site RESET wipes
// every STORAGE_KEYS entry including this one, so "until reset" needs no
// code here.
//
// Read from storage on each check rather than mirrored into React state:
// it changes at most once per dialog, only on click paths, and both Timer
// and WordCounter read it independently.

export const readSuppressedKeys = (): string[] => {
  const saved = readJSON<unknown>(STORAGE_KEYS.dontAskAgain, null);
  return Array.isArray(saved) ? saved.filter((key): key is string => typeof key === 'string') : [];
};

// Writes and hands back the new list, so a caller mirroring it into React
// state doesn't have to read back a write that has only just landed.
export const setSuppressedKey = (key: string, silenced: boolean): string[] => {
  const kept = readSuppressedKeys().filter((k) => k !== key);
  const next = silenced ? [...kept, key] : kept;
  writeJSON(STORAGE_KEYS.dontAskAgain, next);
  return next;
};

// A whole section at once, from its heading's own box. One write rather
// than a loop of setSuppressedKey, which would read back the list it had
// just written thirty-nine times.
export const setSuppressedKeys = (keys: string[], silenced: boolean): string[] => {
  const kept = readSuppressedKeys().filter((k) => !keys.includes(k));
  const next = silenced ? [...kept, ...keys] : kept;
  writeJSON(STORAGE_KEYS.dontAskAgain, next);
  return next;
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
    // One key per direction, not one per heading: which section it was
    // asked from doesn't change the question, but which way it is going
    // does. Sharing a key meant answering "yes, silence them" also
    // answered "yes, bring them back", and the way back was the one that
    // then happened without asking.
    case 'bulkSuppress':
      return dialog.data.silence ? 'bulkSilence' : 'bulkRestore';
    case 'switch':
      return `switch:${dialog.mode}`;
    case 'seek':
      return `seek:${dialog.data.mode}`;
    // One member, one question per act. The act names are kept apart from
    // the dialog types below, so both share the one flat key space.
    case 'full':
      return dialog.act;
    default:
      return dialog.type;
  }
};

// Copy for the FULL-mode questions, and the labels their rows carry in the
// confirm button's list. One table, so an act can't reach the dialog
// without also reaching the list.
export const FULL_ACTS: Record<FullAct, { label: string; title: string; description: string; action: string }> = {
  start: {
    label: 'Start the timer',
    title: 'START TIMER',
    description: 'Start the timer?',
    action: 'START',
  },
  pause: {
    label: 'Pause the timer',
    title: 'PAUSE TIMER',
    description: 'Pause the timer? It holds where it is until you resume it.',
    action: 'PAUSE',
  },
  resume: {
    label: 'Resume the timer',
    title: 'RESUME TIMER',
    description: 'Resume the timer from where it is paused?',
    action: 'RESUME',
  },
  // The two an alarm normally waves straight through: ringing, a dialog
  // between the button and the silence is the wrong thing to meet. FULL
  // is the mode where someone has asked for one anyway.
  stopRinging: {
    label: 'Stop while the alarm is ringing',
    title: 'CONFIRM STOP',
    description: 'Stop the ringing timer? This will silence it and reset it to the initial time.',
    action: 'CONFIRM',
  },
  resetRinging: {
    label: 'Reset while the alarm is ringing',
    title: 'CONFIRM RESET',
    description: 'Reset the ringing timer? This will silence it and restart it from the beginning.',
    action: 'CONFIRM',
  },
  removeHistory: {
    label: 'Delete a history entry',
    title: 'DELETE ENTRY',
    description: "Delete this run from the history? This can't be undone.",
    action: 'DELETE',
  },
  tuckSidebar: {
    label: 'Tuck away presets & history',
    title: 'HIDE PANEL',
    description: 'Hide presets & history? Nothing in them is lost, and the arrow brings the panel back.',
    action: 'HIDE',
  },
  tuckTimeFields: {
    label: 'Tuck away the HOURS/MINUTES/SECONDS box',
    title: 'HIDE TIME FIELDS',
    description: 'Hide the HOURS/MINUTES/SECONDS box? The arrow brings it back.',
    action: 'HIDE',
  },
  tuckWordCounter: {
    label: 'Tuck away the word counter',
    title: 'HIDE WORD COUNTER',
    description: 'Hide the word counter? What you typed is kept, and the arrow brings it back.',
    action: 'HIDE',
  },
  untuckSidebar: {
    label: 'Bring presets & history back',
    title: 'SHOW PRESETS & HISTORY',
    description: 'Bring the presets and history panel back? It takes its share of the width from the countdown beside it.',
    action: 'SHOW',
  },
  untuckTimeFields: {
    label: 'Bring the HOURS / MINUTES / SECONDS box back',
    title: 'SHOW THE TIME BOXES',
    description: 'Bring the HOURS, MINUTES and SECONDS boxes back? They take their share of the column from the countdown above them.',
    action: 'SHOW',
  },
  untuckWordCounter: {
    label: 'Bring the word counter back',
    title: 'SHOW THE WORD COUNTER',
    description: 'Bring the word counter back? It takes its share of the column from the timer above it.',
    action: 'SHOW',
  },
  exitFullscreen: {
    label: 'Leave the word counter full screen',
    title: 'LEAVE FULL SCREEN',
    description: 'Come back out of full screen? The timer and its panels return, and the word counter goes back to its share of the column.',
    action: 'CONFIRM',
  },
  fullscreen: {
    label: 'Open the word counter full screen',
    title: 'FULL SCREEN',
    description: 'Put the word counter full screen? It covers the page until you come back out.',
    action: 'CONFIRM',
  },
  theme: {
    label: 'Switch between light and dark',
    title: 'SWITCH THEME',
    description: 'Switch the page between light and dark? Nothing else changes, and the same button switches it back.',
    action: 'SWITCH',
  },
  volume: {
    label: 'Change the alarm volume',
    title: 'CHANGE VOLUME',
    description: "Change how loud the alarm is? Dragging all the way down mutes it, and asks nothing more while you're on the slider.",
    action: 'CHANGE',
  },
  alarmLoop: {
    label: 'Turn the repeating alarm on or off',
    title: 'REPEAT THE ALARM',
    description: 'Change whether the alarm keeps sounding past zero? Off, it rings once and stops; on, it repeats until you stop or reset the timer.',
    action: 'CONFIRM',
  },
  typeInWordCounter: {
    label: 'Type in the word counter',
    title: 'TYPE IN THE COUNTER',
    description: "Put the keyboard in the word counter? TAB, R and S go to the box you're typing in while it has focus, so the timer's shortcuts stop working until you press ESC or click away.",
    action: 'CONFIRM',
  },
  timeZone: {
    label: "Change the clock's time zone",
    title: 'CHANGE TIME ZONE',
    description: "Change the clock's time zone? The wall clock and every history stamp re-read in the new one.",
    action: 'CHANGE',
  },
  hourFormat: {
    label: 'Switch the clock between 12-hour and 24-hour',
    title: 'CHANGE CLOCK FORMAT',
    description: 'Switch the clock between 12-hour and 24-hour?',
    action: 'CHANGE',
  },
};

// The half-tier half of the list the confirm button shows, in the order it
// shows them. The keys have to agree with dialogKey above: a row whose key
// no dialog produces is a checkbox that silences nothing.
const HALF_QUESTIONS: [string, string][] = [
  ['stop', 'Stop the timer'],
  ['reset', 'Reset the timer'],
  ['mute', 'Mute the alarm'],
  ['switch:switchRunning', 'Switch to another time mid-run'],
  ['switch:loadOnly', 'Switch to another time while paused or stopped'],
  ['seek:idle', 'Set the time by clicking the bar'],
  ['seek:paused', 'Move a paused timer by clicking the bar'],
  ['seek:running', 'Move a running timer by clicking the bar'],
  ['adjust:unstarted', 'Change the configured time'],
  ['adjust:running', 'Change the remaining time while running'],
  ['adjust:paused', 'Change the remaining time while paused'],
  ['adjust:ringing', 'Change the remaining time while ringing'],
  ['removePreset', 'Delete a preset'],
  ['clearPresets', 'Delete every preset'],
  ['clearHistory', 'Clear all history'],
  ['clearWordCounter', 'Clear the word counter'],
  ['hideWebsiteLink', 'Hide the website link'],
  ['correctPreset', 'Report a preset corrected to fit'],
  ['correctTime', 'Report a time corrected to fit'],
  ['duplicatePreset', 'Report a preset you already have'],
  ['bulkSilence', 'Silence a whole section at once'],
  ['bulkRestore', 'Bring a whole section back at once'],
  ['fullConfirmations', 'Warn before confirming everything'],
  ['skipConfirmations', 'Warn before turning confirmations off'],
];

// Full-tier rows that are not acts. A row here silences a rule rather
// than a dialog: there is no act to describe because the question it
// governs is one of the half-tier ones, and what full mode changes is how
// often it comes back.
const FULL_RULES: [string, string][] = [
  ['adjustAgain', 'Change the time again in the same run'],
];

// The two rows a heading's own box must not touch. A control that
// silences its own confirmation as a side effect is one that asks once
// and never again: silencing the half section ticked bulkSilence and
// bulkRestore along with everything else, and the click that brought the
// section back was then silent.
export const BULK_KEYS = ['bulkSilence', 'bulkRestore'];

export const QUESTIONS: { key: string; label: string; tier: 'half' | 'full' }[] = [
  ...HALF_QUESTIONS.map(([key, label]) => ({ key, label, tier: 'half' as const })),
  ...(Object.keys(FULL_ACTS) as FullAct[]).map((act) => ({ key: act, label: FULL_ACTS[act].label, tier: 'full' as const })),
  ...FULL_RULES.map(([key, label]) => ({ key, label, tier: 'full' as const })),
];

// Dialogs that report what happened rather than ask whether it should.
// They get one OK and no CANCEL, and dismissing lands on the same result
// as OK does, since there's nothing there to decline.
export const isAcknowledgement = (dialog: DialogState): boolean =>
  dialog.type === 'correctPreset' || dialog.type === 'correctTime' || dialog.type === 'duplicatePreset';

export const isDialogSuppressed = (dialog: DialogState): boolean => {
  const key = dialogKey(dialog);
  return key !== null && readSuppressedKeys().includes(key);
};

// The one place a question is weighed against the mode. Three ways it can
// already be answered: confirmations are off, the mode is half and this is
// one of the questions only full asks, or this one has been silenced on
// its own. The site RESET is outside all three.
export const shouldAsk = (dialog: DialogState, mode: ConfirmMode): boolean => {
  if (dialog.type === null) return false;
  if (dialog.type === 'clearCache') return true;
  if (mode === 'none') return false;
  if (mode === 'half' && dialog.type === 'full') return false;
  return !isDialogSuppressed(dialog);
};

// Whether a row in that list is one the current mode actually asks. A row
// that isn't still toggles; it just changes nothing until the mode comes
// back round to it.
export const isQuestionLive = (tier: 'half' | 'full', mode: ConfirmMode): boolean =>
  mode === 'full' || (mode === 'half' && tier === 'half');

// What the button cycles to: half, then full, then off, round again.
export const nextConfirmMode = (mode: ConfirmMode): ConfirmMode =>
  mode === 'half' ? 'full' : mode === 'full' ? 'none' : 'half';

// Migrates the old two-state key, which only ever said "skip everything":
// true reads as none, false as the half it always meant.
export const readConfirmMode = (): ConfirmMode => {
  const saved = readJSON<unknown>(STORAGE_KEYS.confirmMode, null);
  if (saved === 'half' || saved === 'full' || saved === 'none') return saved;
  return readBoolean(STORAGE_KEYS.skipConfirmations, false) ? 'none' : 'half';
};

export const suppressDialog = (dialog: DialogState) => {
  const key = dialogKey(dialog);
  if (key === null) return;
  setSuppressedKey(key, true);
};
