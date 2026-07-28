import { useRef } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatEntryLabel, fromTotalSeconds } from './format';
import type { DialogState } from './types';

interface ConfirmDialogProps {
  dialog: DialogState;
  onDismiss: () => void;
  onConfirm: () => void;
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
        // never run yet — nothing to lose, so this skips the "progress
        // will be lost" warning switchRunning below needs, and it only
        // loads: picking a time isn't asking to start counting it
        case 'startFromIdle':
          return {
            title: 'LOAD TIMER',
            description: `Load ${label}? Press START when you want to run it.`,
            action: 'LOAD',
          };
        // the only mode that starts the new time, because a timer was
        // already counting when it was asked for. "Progress" covers both
        // directions: time left on a countdown, or time counted past
        // zero by an alarm that's still running
        case 'switchRunning':
          return {
            title: 'SWITCH TIMER',
            description: `Switch to ${label}? It will start immediately, and current progress will be lost.`,
            action: 'SWITCH',
          };
        // replaces a paused or stopped-mid-progress timer; confirming
        // only loads it
        case 'loadOnly':
          return {
            title: 'LOAD TIMER',
            description: `Load ${label}? The current remaining time will be discarded. Press START to run it.`,
            action: 'LOAD',
          };
      }
    }
    case 'seek': {
      const label = formatEntryLabel(fromTotalSeconds(dialog.data.targetSeconds));
      // idle: nothing running to resume into, so this sets a brand-new
      // configured time instead of moving remaining time within a run
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
      const { unit, value, restarts } = dialog.data;
      return {
        title: 'ADJUST TIME',
        // an unstarted timer has no run to restart — saying it would
        // suggest this throws something away, and it doesn't
        description: restarts
          ? `Change ${unit} to ${value}? The timer will restart from the new time.`
          : `Change ${unit} to ${value}? That's the time the timer will start from.`,
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
    // Presets ask, history doesn't: a preset is something you built and
    // kept deliberately, and nothing puts it back. A history entry is
    // just a record the app wrote for you, and running that time again
    // writes another one.
    case 'removePreset':
      return {
        title: 'DELETE PRESET',
        description: `Delete the ${dialog.data.label} preset? This can't be undone — you'd have to add it again.`,
        action: 'DELETE',
      };
    case 'correctPreset':
      return {
        title: 'CORRECT TIME',
        description: `${dialog.data.typed} isn't a valid time — minutes and seconds only go up to 59, and hours to 99. Use ${dialog.data.corrected} instead?`,
        action: 'CORRECT',
      };
    case 'skipConfirmations':
      return {
        title: 'TURN OFF CONFIRMATIONS',
        description:
          "Turn off confirmations? Stopping, resetting, adjusting the time, loading a preset, seeking the bar, muting, deleting a preset and clearing history will all happen the moment you click, with no dialog and no undo. Resetting the website to defaults will still ask. You can turn confirmations back on with the same button — it won't ask twice.",
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
  // dialog.type resets to null the instant a choice is made, but Radix
  // keeps the dialog mounted through its exit animation — hold on to the
  // last real copy so the text doesn't blank out mid-fade
  const lastCopyRef = useRef<ReturnType<typeof getCopy>>(null);
  const currentCopy = getCopy(dialog);
  if (currentCopy) lastCopyRef.current = currentCopy;
  const copy = currentCopy ?? lastCopyRef.current;

  return (
    <AlertDialog open={dialog.type !== null} onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialogContent
        className="bg-black border-4 border-white"
        onKeyDown={(e) => {
          // Space and Enter both confirm regardless of which button holds
          // focus (Escape already dismisses via Radix). Radix focuses
          // Cancel by default when the dialog opens, so without this,
          // Enter would activate that focused Cancel button instead of
          // confirming. Space is also the global start/pause shortcut, so
          // stop the event here too — otherwise it keeps bubbling to that
          // window listener, which would immediately re-trigger on the
          // same keystroke once this closes the dialog.
          if (e.code === 'Space' || e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onConfirm();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white text-2xl font-bold">{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription className="text-white text-lg">{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex gap-4 justify-end">
          <AlertDialogCancel
            onClick={onDismiss}
            className="border-4 border-white text-white font-bold px-6 py-3 hover:bg-white hover:text-black"
          >
            CANCEL <span className="opacity-60 font-normal">(ESC)</span>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="border-4 border-white bg-white text-black font-bold px-6 py-3 hover:bg-black hover:text-white hover:border-white"
          >
            {copy?.action} <span className="opacity-60 font-normal">(SPACE)</span>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
