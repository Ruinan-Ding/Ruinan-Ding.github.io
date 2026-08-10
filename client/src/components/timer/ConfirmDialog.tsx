import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DotCheckbox from './DotCheckbox';
import { formatEntryLabel, fromTotalSeconds } from './format';
import { dialogKey, isAcknowledgement } from './suppressions';
import type { DialogState } from './types';

interface ConfirmDialogProps {
  dialog: DialogState;
  // Carries the checkbox too. Cancelling answers nothing so it arrives
  // false there, but an acknowledgement's ESC is the same act as its OK —
  // the button says so — and it has to remember the same tick.
  onDismiss: (dontAskAgain: boolean) => void;
  // dontAskAgain is the checkbox below: true means don't ask THIS
  // question again (see dialogKey for what counts as the same question).
  // Only ever arrives via confirm: cancelling answers nothing, so there's
  // nothing to remember.
  onConfirm: (dontAskAgain: boolean) => void;
}

const getCopy = (dialog: DialogState) => {
  switch (dialog.type) {
    case 'stop':
      return {
        title: 'CONFIRM STOP',
        description: 'Are you sure you want to stop the timer? This will reset it to the initial time.',
        action: 'CONFIRM',
      };
    case 'mute':
      return {
        title: 'CONFIRM MUTE',
        description: "Mute the alarm? You won't hear it when the timer runs out.",
        action: 'MUTE',
      };
    case 'clearCache':
      return {
        title: 'CLEAR CACHE',
        description: 'Reset the website to defaults? Presets, history, the word counter, and all settings will be erased.',
        action: 'CLEAR',
      };
    case 'reset':
      return {
        title: 'CONFIRM RESET',
        description: 'Are you sure you want to reset the timer? It will restart from the beginning.',
        action: 'CONFIRM',
      };
    case 'switch': {
      const label = formatEntryLabel(dialog.data);
      switch (dialog.mode) {
        // "Progress" covers both directions: time left on a countdown, or
        // time counted past zero by an alarm still running.
        case 'switchRunning':
          return {
            title: 'SWITCH TIMER',
            description: `Switch to ${label}? It will start immediately, and current progress will be lost.`,
            action: 'SWITCH',
          };
        // Replaces a paused or stopped-mid-progress timer.
        case 'loadOnly':
          return {
            title: 'SWITCH TIMER',
            description: `Switch to ${label}? It will start immediately, and the current remaining time will be discarded.`,
            action: 'SWITCH',
          };
      }
    }
    case 'seek': {
      const label = formatEntryLabel(fromTotalSeconds(dialog.data.targetSeconds));
      // Idle: nothing to resume into, so this sets a new configured time
      // rather than moving remaining time within a run.
      if (dialog.data.mode === 'idle') {
        return {
          title: 'SET TIME',
          description: `Set the configured time to ${label}? It'll start from there the next time you press START.`,
          action: 'SET',
        };
      }
      return {
        title: 'MOVE TIMER',
        description: dialog.data.mode === 'paused'
          ? `Move the timer to ${label}? It will wait there paused; the configured time stays the same.`
          : `Move the remaining time to ${label}? The configured time stays the same.`,
        action: 'MOVE',
      };
    }
    case 'adjust': {
      const { unit, value, state } = dialog.data;
      return {
        title: 'ADJUST TIME',
        // Two different acts under one title. Idle, these fields are the
        // timer's setup and this sets what it starts from. Running or
        // paused they're the time left, and this moves that without
        // touching the total — which is what STOP and RESET go back to,
        // and what the bar is drawn against.
        description: state === 'unstarted'
          ? `Change ${unit} to ${value}? That's the time the timer will start from.`
          : `Change the remaining ${unit} to ${value}? The configured time stays the same.`,
        action: 'CONFIRM',
      };
    }
    case 'hideWebsiteLink':
      return {
        title: 'HIDE LINK',
        description: 'Hide the "Check Out My Website!" link? :-( You can bring it back by resetting the website to defaults.',
        action: 'HIDE',
      };
    case 'clearHistory':
      return {
        title: 'CLEAR HISTORY',
        description: "Clear all run history? This can't be undone.",
        action: 'CLEAR',
      };
    // Presets warn harder than history: a preset is something you built
    // deliberately and nothing puts it back, where a history entry is a
    // record the app wrote and running that time again writes another.
    case 'clearPresets':
      return {
        title: 'CLEAR PRESETS',
        description: "Delete every preset? This can't be undone — you'd have to add them again. Resetting the website to defaults brings back the three it ships with.",
        action: 'CLEAR',
      };
    case 'removePreset':
      return {
        title: 'DELETE PRESET',
        description: `Delete the ${dialog.data.label} preset? This can't be undone — you'd have to add it again.`,
        action: 'DELETE',
      };
    case 'correctPreset':
      return {
        title: 'TIME CORRECTED',
        description: `${dialog.data.typed} isn't a valid time — minutes and seconds only go up to 59, and hours to 99. It's been corrected to ${dialog.data.corrected}.`,
        action: 'OK',
      };
    case 'duplicatePreset':
      return {
        title: 'ALREADY SAVED',
        description: `${dialog.data.label} is already one of your presets, so nothing was added. The one you have will flash red.`,
        action: 'OK',
      };
    case 'skipConfirmations':
      return {
        title: 'TURN OFF CONFIRMATIONS',
        description:
          "Turn off confirmations? Stopping, resetting, adjusting the time, loading a preset, seeking the bar, muting, deleting a preset, clearing history, correcting an out-of-range preset, pointing out a preset you already have and hiding the website link will all happen the moment you click, with no dialog and no undo. Resetting the website to defaults will still ask. You can turn confirmations back on with the same button — it won't ask twice. To silence just one of these instead, tick \"Don't ask this again\" in its own dialog.",
        action: 'TURN OFF',
      };
    case 'clearWordCounter':
      return {
        title: 'CLEAR TEXT',
        description: "Clear everything typed in the word counter? This can't be undone.",
        action: 'CLEAR',
      };
    default:
      return null;
  }
};

export default function ConfirmDialog({ dialog, onDismiss, onConfirm }: ConfirmDialogProps) {
  // dialog.type resets the instant a choice is made, but Radix keeps the
  // dialog mounted through its exit animation, so the last real copy is
  // held to stop the text blanking out mid-fade.
  const lastCopyRef = useRef<ReturnType<typeof getCopy>>(null);
  const currentCopy = getCopy(dialog);
  if (currentCopy) lastCopyRef.current = currentCopy;
  const copy = currentCopy ?? lastCopyRef.current;

  // Unticked whenever a dialog opens: one dialog's ticked box must never
  // carry into the next. Keyed on the question rather than open/closed, so
  // it resets between two dialogs that follow each other with no gap.
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const key = dialogKey(dialog);
  // Whether focus has been moved by hand since this dialog opened, which
  // is what separates "Enter, having read the question" from "Enter, on
  // the button I just tabbed to". Reset per question, like the checkbox.
  const focusMovedRef = useRef(false);
  useEffect(() => {
    if (key !== null) setDontAskAgain(false);
    focusMovedRef.current = false;
  }, [key]);
  // A dialog that can never be silenced renders without the row. Held
  // through the exit animation like the copy above.
  const suppressibleRef = useRef(false);
  if (dialog.type !== null) suppressibleRef.current = key !== null;
  const acknowledgeRef = useRef(false);
  if (dialog.type !== null) acknowledgeRef.current = isAcknowledgement(dialog);

  return (
    <AlertDialog open={dialog.type !== null} onOpenChange={(open) => !open && onDismiss(dontAskAgain)}>
      <AlertDialogContent
        className="bg-black border-4 border-white p-4 gap-3"
        onKeyDown={(e) => {
          // Enter confirms whatever the dialog asked, not whichever button
          // happens to hold focus — Radix focuses Cancel on open, so the
          // default would answer no to a question the key is meant to
          // answer yes to. preventDefault is what stops that, and
          // stopPropagation keeps the same keystroke from carrying on to
          // the window listener and starting the timer behind the dialog.
          //
          // Except on the "don't ask again" checkbox, where Enter ticks it,
          // and confirming would answer the dialog out from under someone
          // reaching for the box by keyboard — throwing away the very
          // preference being reached for.
          //
          // And except on a button, which Enter is supposed to press. That
          // exception is the whole point of the rule above holding only
          // while focus is where Radix left it: someone who tabbed onto
          // CANCEL and pressed Enter was confirming instead, so the one way
          // a keyboard user can say no deleted their presets.
          //
          // Space answers nothing. Left to the browser it presses whatever
          // holds focus, and Radix focuses Cancel on open, so a spacebar
          // reflex cancelled the question — the same act as ESC, from a key
          // nothing in the dialog offers as an answer. ENTER confirms and
          // ESC cancels, and both say so on the buttons.
          if (e.key === ' ') {
            if ((e.target as HTMLElement).closest('[data-dont-ask]')) return;
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (e.key === 'Tab') {
            focusMovedRef.current = true;
            return;
          }
          if (e.key !== 'Enter') return;
          // Once focus has been moved by hand, the button under it presses
          // itself, whichever one that is. Radix opens with CANCEL focused
          // and this fires for its descendants too, so without the Tab
          // check "Enter confirms" also fired for someone who had tabbed
          // onto CANCEL deliberately and pressed the key it advertises —
          // the one way to say no, deleting the presets instead.
          if (focusMovedRef.current && (e.target as HTMLElement).closest('button')) {
            e.stopPropagation();
            return;
          }
          if ((e.target as HTMLElement).closest('[data-dont-ask]')) return;
          e.preventDefault();
          e.stopPropagation();
          onConfirm(dontAskAgain);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white text-lg font-bold">{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-white text-sm">{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Its own row: beside CANCEL/CONFIRM it pushed one of them onto a
            second line. Worded as this one question rather than all of
            them, which is what the confirmations toggle is for. */}
        {suppressibleRef.current && (
          <button
            type="button"
            data-dont-ask
            onClick={() => setDontAskAgain((prev) => !prev)}
            aria-pressed={dontAskAgain}
            className="flex items-center gap-2 text-white text-sm font-bold self-start transition-opacity duration-200 hover:opacity-80"
            title="Skip this particular confirmation from now on. Resetting the website to defaults brings it back."
          >
            <DotCheckbox checked={dontAskAgain} />
            Don't ask this again
          </button>
        )}
        {/* Held through the exit animation like the copy, or the buttons
            would swap over mid-fade. */}
        <div className="flex gap-3 justify-end items-center">
          {acknowledgeRef.current ? (
            // One button, and it's the Cancel element rather than the
            // Action on purpose: Radix focuses Cancel when the dialog
            // opens, and with no Cancel to find it focuses nothing at all,
            // which left ENTER and ESC going to the page behind the dialog.
            // Nothing is lost by it being Cancel, since an acknowledgement
            // has nothing to decline and all three do the same thing.
            <AlertDialogCancel
              onClick={() => onConfirm(dontAskAgain)}
              className="border-4 border-white bg-white text-black text-xs font-bold h-auto px-3 py-1 hover:bg-black hover:text-white hover:border-white"
            >
              {copy?.action} <span className="opacity-60 font-normal">(ENTER / ESC)</span>
            </AlertDialogCancel>
          ) : (
            <>
              <AlertDialogCancel
                onClick={() => onDismiss(false)}
                className="border-4 border-white text-white text-xs font-bold h-auto px-3 py-1 hover:bg-white hover:text-black"
              >
                CANCEL <span className="opacity-60 font-normal">(ESC)</span>
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onConfirm(dontAskAgain)}
                className="border-4 border-white bg-white text-black text-xs font-bold h-auto px-3 py-1 hover:bg-black hover:text-white hover:border-white"
              >
                {copy?.action} <span className="opacity-60 font-normal">(ENTER)</span>
              </AlertDialogAction>
            </>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
