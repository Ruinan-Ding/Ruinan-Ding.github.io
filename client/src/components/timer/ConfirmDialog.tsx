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
      // start=false replaces a paused or stopped timer: confirming only loads it
      return dialog.start
        ? {
            title: 'SWITCH TIMER',
            description: `Switch to ${label}? It will start immediately, and current progress will be lost.`,
            action: 'SWITCH',
          }
        : {
            title: 'LOAD TIMER',
            description: `Load ${label}? The current remaining time will be discarded. Press START to run it.`,
            action: 'LOAD',
          };
    }
    case 'seek': {
      const label = formatEntryLabel(fromTotalSeconds(dialog.data.targetSeconds));
      // willPause: the timer wasn't running, so the seek leaves it paused
      return {
        title: 'MOVE TIMER',
        description: dialog.data.willPause
          ? `Move the timer to ${label}? It will wait there paused; the configured time stays the same.`
          : `Move the remaining time to ${label}? The configured time stays the same.`,
        action: 'MOVE',
      };
    }
    case 'adjust': {
      const { unit, value } = dialog.data;
      return {
        title: 'ADJUST TIME',
        description: `Change ${unit} to ${value}? The timer will restart from the new time.`,
        action: 'CONFIRM',
      };
    }
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
          // Space confirms regardless of which button holds focus
          // (Escape already dismisses via Radix). Space is also the
          // global start/pause shortcut, so stop the event here too —
          // otherwise it keeps bubbling to that window listener, which
          // would immediately re-trigger on the same keystroke once this
          // closes the dialog.
          if (e.code === 'Space') {
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
