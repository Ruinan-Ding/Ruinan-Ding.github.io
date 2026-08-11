import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DotCheckbox from './DotCheckbox';
import { formatEntryLabel, formatSignedLabel, fromTotalSeconds } from './format';
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
      // Unreachable while the union holds, and here so that stops being
      // load-bearing: without it a mode added later falls through into
      // 'seek', reads targetSeconds off a TimeParts and renders
      // "Move the timer to undefined:NaN?" with no type error.
      return null;
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
      const { totalSeconds, state } = dialog.data;
      // The resulting time, not the unit that was touched: a step carries
      // across units, so 59 seconds up is 1:00 and naming a unit would
      // describe neither box correctly.
      const label = formatSignedLabel(totalSeconds);
      return {
        title: 'ADJUST TIME',
        // Two different acts under one title. Idle, these fields are the
        // timer's setup and this sets what it starts from. Running or
        // paused they're the time left, and this moves that without
        // touching the total — which is what STOP and RESET go back to,
        // and what the bar is drawn against.
        description: state === 'unstarted'
          ? `Change the time to ${label}? That's what the timer will start from.`
          : `Change the remaining time to ${label}? The configured time stays the same.`,
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
    case 'correctTime':
      return {
        title: 'TIME CORRECTED',
        description: `${dialog.data.typed} is past the longest time this can hold. It's been corrected to ${dialog.data.corrected}.`,
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
          "Turn off confirmations? Stopping, resetting, adjusting the time, loading a preset, seeking the bar, muting, deleting a preset, clearing presets or history, correcting an out-of-range preset, pointing out a preset you already have and hiding the website link will all happen the moment you click, with no dialog and no undo. Resetting the website to defaults will still ask. You can turn confirmations back on with the same button — it won't ask twice. To silence just one of these instead, tick \"Don't ask this again\" in its own dialog.",
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
  useEffect(() => {
    if (key !== null) setDontAskAgain(false);
  }, [key]);
  // The button ENTER should land on when the dialog opens: the action on a
  // two-button dialog, the single OK on an acknowledgement.
  const actionRef = useRef<HTMLButtonElement>(null);
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
        // Focus the answer, don't intercept the key. Radix opens with
        // CANCEL focused, so ENTER — which this app advertises as yes —
        // landed on no, and the fix for that was a handler that confirmed
        // whatever held focus. Which meant tabbing onto CANCEL and pressing
        // the key printed on it confirmed as well: the one way a keyboard
        // user says no, deleting their presets. Guarding that on "has focus
        // moved" only pushed the hole around — a keydown listener for Tab
        // can't see focus moved by mouse, by arrow key, or by anything
        // else.
        //
        // Putting focus where the default action already is needs no
        // interception at all: ENTER presses what it is pointed at, so it
        // confirms untouched, and CANCEL cancels once you move to it. The
        // buttons keep their own contract and the special case is gone.
        onOpenAutoFocus={(e) => {
          // Only take the focus over if there's something to take it to.
          // preventDefault with nothing focused afterwards leaves it on the
          // body, where ENTER and ESC reach the window's timer shortcuts
          // and act on the run behind the dialog.
          if (!actionRef.current) return;
          e.preventDefault();
          actionRef.current.focus();
        }}
        onKeyDown={(e) => {
          // Space answers nothing. Left to the browser it presses whatever
          // holds focus, so a spacebar reflex answered a question it
          // doesn't advertise an answer to. ENTER confirms and ESC cancels,
          // and both say so on the buttons.
          //
          // Except on the "don't ask again" checkbox, which Space ticks —
          // that's the one control here Space belongs to.
          if (e.key !== ' ') return;
          if ((e.target as HTMLElement).closest('[data-dont-ask]')) return;
          e.preventDefault();
          e.stopPropagation();
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
            // Action on purpose: Radix wants a Cancel in an AlertDialog,
            // and an acknowledgement has nothing to decline — ENTER, ESC
            // and the click all land on the same result, which is what the
            // label says. It carries actionRef like the Action does in the
            // two-button case, so ENTER opens pointed at it either way.
            <AlertDialogCancel
              ref={actionRef}
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
                ref={actionRef}
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
