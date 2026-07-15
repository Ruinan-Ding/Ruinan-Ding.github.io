import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatEntryLabel, pad } from './format';
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
    case 'switch':
      return {
        title: 'SWITCH TIMER',
        description: `A timer is currently running. Do you want to switch to ${formatEntryLabel(dialog.data)}?`,
        action: 'SWITCH',
      };
    case 'adjust': {
      const { unit, value } = dialog.data;
      return {
        title: unit === 'hours' ? 'CONFIRM CHANGE' : 'ADJUST TIME',
        description: unit === 'minutes'
          ? `Change minutes to ${value}?`
          : `Change ${unit} to ${pad(value)}?`,
        action: 'CONFIRM',
      };
    }
    default:
      return null;
  }
};

export default function ConfirmDialog({ dialog, onDismiss, onConfirm }: ConfirmDialogProps) {
  const copy = getCopy(dialog);

  return (
    <AlertDialog open={dialog.type !== null} onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialogContent
        className="bg-black border-4 border-white"
        onKeyDown={(e) => {
          // Enter confirms regardless of which button holds focus
          // (Escape already dismisses via Radix)
          if (e.key === 'Enter') {
            e.preventDefault();
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
            {copy?.action} <span className="opacity-60 font-normal">(ENTER)</span>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
