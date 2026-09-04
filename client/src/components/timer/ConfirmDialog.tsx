import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DotCheckbox from './DotCheckbox';
import { formatEntryLabel, formatSignedLabel, fromTotalSeconds } from './format';
import { dialogKey, FULL_ACTS, isAcknowledgement, QUESTIONS } from './suppressions';
import type { DialogState } from './types';

interface ConfirmDialogProps {
  dialog: DialogState;
  // Carries the checkbox too. Cancelling answers nothing so it arrives
  // false there, but an acknowledgement's ESC is the same act as its OK,
  // as the button says, so it has to remember the same tick.
  onDismiss: (dontAskAgain: boolean) => void;
  // True means don't ask THIS question again; see dialogKey for what
  // counts as the same question.
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
      const { totalSeconds, state, corrected } = dialog.data;
      // The resulting time, not the unit that was touched: a step carries
      // across units, so 59 seconds up is 1:00 and naming a unit would
      // describe neither box correctly.
      const label = formatSignedLabel(totalSeconds);
      // An overshoot says so in the same breath. It is the same news the
      // TIME CORRECTED dialog carries on its own elsewhere, and two
      // dialogs for one click is a click that answers a question it
      // hasn't read yet.
      const note = corrected ? ` ${corrected.typed} is past the longest time this can hold, so it stops there.` : '';
      return {
        title: 'ADJUST TIME',
        // Two different acts under one title. Idle, these fields are the
        // timer's setup and this sets what it starts from. Running or
        // paused they're the time left, and this moves that without
        // touching the total, which is what STOP and RESET go back to,
        // and what the bar is drawn against.
        description: (state === 'unstarted'
          ? `Change the time to ${label}? That's what the timer will start from.`
          : `Change the remaining time to ${label}? The configured time stays the same.`) + note,
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
        title: 'NOT A TIME',
        // Per-unit, and rounded down. Carrying would read 88:88:88 as 89
        // hours and change — inside the range, so nothing would question
        // it, and four minutes past what was typed.
        description: `${dialog.data.typed} isn't a time: a minute or a second is over 59. Rounded down it's ${dialog.data.corrected}.`,
        action: 'CORRECT IT',
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
    // Named from the section's own heading, and spelled out both ways:
    // the box says what it is about to do rather than leaving it to be
    // read off a partly-ticked list.
    case 'bulkSuppress': {
      const { tier, silence, count } = dialog.data;
      const section = tier === 'half' ? 'that ask whenever confirmations are on' : 'that only ask when everything is confirmed';
      return {
        title: silence ? 'SILENCE THE SECTION' : 'BRING THE SECTION BACK',
        description: silence
          ? `Stop all ${count} questions ${section} from asking? Each one keeps its own box, so you can bring any of them back on its own row afterwards.`
          : `Let all ${count} questions ${section} ask again? This fills every box in that section, including ones you cleared one at a time.`,
        action: silence ? 'SILENCE ALL' : 'BRING BACK',
      };
    }
    // The other half of the same switch. Asked in half mode, so it is a
    // half-tier question and carries its own tick like the rest.
    case 'fullConfirmations':
      return {
        title: 'CONFIRM EVERYTHING',
        description:
          "Ask about everything from now on? On top of what already asks, starting the timer, pausing and resuming it, stopping or resetting it while the alarm is ringing, deleting a history entry, tucking a panel away, going full screen and changing the clock's zone or its 12/24 setting will each ask first. The same button carries on round to turning confirmations off altogether. To leave one of these out, clear its box in the list that button drops down.",
        action: 'CONFIRM ALL',
      };
    // Only reachable on the way from FULL to none, which is the one step
    // of the cycle that takes questions away rather than adding them.
    case 'skipConfirmations':
      return {
        title: 'TURN OFF CONFIRMATIONS',
        description:
          "Turn off confirmations? Everything — stopping, resetting, starting, pausing, adjusting the time, loading a preset, seeking the bar, muting, deleting a preset or a history entry, clearing presets, history or the word counter, tucking a panel away, going full screen, changing the clock and hiding the website link — will happen the moment you click, with no dialog and no undo. Resetting the website to defaults will still ask. The same button cycles back round to confirmations, and won't ask twice. To silence just one question instead, clear its box in the list that button drops down, or clear \"Keep asking this\" in its own dialog.",
        action: 'TURN OFF',
      };
    // Every FULL-mode question reads its copy out of the one table, so an
    // act that exists has copy by construction rather than by a case here.
    case 'full':
      return FULL_ACTS[dialog.act];
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
  // Which question is showing, as one value. One replacing another is a
  // change of question but not of open/closed, and onOpenAutoFocus below
  // only fires on the second — so a dialog raised from the answer to the
  // one before it kept the focus Radix had already placed, and showed a
  // fresh question with the ring still sat on the previous CANCEL.
  const question = dialog.type === null ? null : `${dialog.type}:${key ?? ''}`;
  // The dialog's answer: the action on a two-button dialog, the single OK
  // on an acknowledgement. Where the focus ring opens, and what the
  // confirm key presses wherever the focus has since gone.
  const actionRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (question !== null) actionRef.current?.focus();
  }, [question]);
  // A dialog that can never be silenced renders without the row. Held
  // through the exit animation like the copy above.
  const suppressibleRef = useRef(false);
  if (dialog.type !== null) suppressibleRef.current = key !== null;
  // What this box is called in the list the confirm button drops down.
  // The tick and the row there are one answer written to one key, and
  // nothing said so: from here it looked like a per-dialog setting, and
  // from the list it looked like a separate one. Held through the exit
  // animation, like everything else the fade would otherwise blank.
  const listLabelRef = useRef<string | null>(null);
  if (dialog.type !== null) listLabelRef.current = QUESTIONS.find((q) => q.key === key)?.label ?? null;
  const acknowledgeRef = useRef(false);
  if (dialog.type !== null) acknowledgeRef.current = isAcknowledgement(dialog);

  return (
    <AlertDialog open={dialog.type !== null} onOpenChange={(open) => !open && onDismiss(dontAskAgain)}>
      <AlertDialogContent
        className="bg-black border-4 border-white p-4 gap-3"
        // Radix opens an AlertDialog with CANCEL focused, which points the
        // dialog at the answer nobody opened it to give. The action is
        // what a reader is deciding about, so that is where the focus ring
        // goes and what ESC is measured against.
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
          // Backquote is yes. A key nothing else here wants, rather than
          // ENTER, because a dialog that answers to the key you were
          // already leaning on gets answered by accident.
          //
          // By code, not by character, so a US layout's shifted tilde and
          // a UK layout's different glyph are still the same physical key.
          // Where that key is spoken for by the system it simply never
          // arrives, and ESC and the mouse still answer.
          //
          // Bare, and once per press: with a modifier this is the window
          // switcher on two desktops, and held down it repeats about
          // thirty times a second, which answers a chain of dialogs before
          // the second one has been read.
          if (e.code === 'Backquote' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            // Stops here rather than carrying on to the window's own
            // shortcuts behind the dialog.
            e.stopPropagation();
            actionRef.current?.click();
            return;
          }
          // ENTER and Space are dead on the confirm button alone. The
          // dialog opens pointed at it, so a reflex on either would answer
          // before the question was read. Everything else in here keeps
          // the keys a button is meant to answer: CANCEL takes them, and
          // so does the "keep asking this" box, which is the only way a
          // keyboard reaches either.
          if (e.key !== 'Enter' && e.key !== ' ') return;
          if (acknowledgeRef.current || e.target !== actionRef.current) return;
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
            // Ticked means it keeps asking, which is how it arrives and
            // how the list beside it reads. Clearing the box is what
            // stops this one question.
            aria-pressed={!dontAskAgain}
            className="flex items-center gap-2 text-white text-sm font-bold self-start transition-opacity duration-200 hover:opacity-80"
            title="Clear this to stop this particular question asking. Resetting the website to defaults brings it back."
          >
            <DotCheckbox checked={!dontAskAgain} />
            {/* One flex item, not two: the row's gap-2 sits between items,
                which put eight pixels in front of the bracket. Inside a
                span it is an ordinary space, and a long row name wraps
                under the words rather than stretching the dialog. */}
            <span className="text-left">
              Keep asking this
              {listLabelRef.current && (
                <span className="opacity-60 font-normal"> ({listLabelRef.current})</span>
              )}
            </span>
          </button>
        )}
        {/* Held through the exit animation like the copy, or the buttons
            would swap over mid-fade. */}
        <div className="flex gap-3 justify-end items-center">
          {acknowledgeRef.current ? (
            // One button, and it's the Cancel element rather than the
            // Action on purpose: Radix wants a Cancel in an AlertDialog,
            // and an acknowledgement has nothing to decline, ENTER, ESC
            // and the click all land on the same result, which is what the
            // label says. It carries actionRef like the Action does in the
            // two-button case, so ENTER opens pointed at it either way.
            <AlertDialogCancel
              ref={actionRef}
              aria-keyshortcuts="Backquote"
              onClick={() => onConfirm(dontAskAgain)}
              className="border-4 border-white bg-white text-black text-xs font-bold h-auto px-3 py-1 hover:bg-black hover:text-white hover:border-white"
            >
              {copy?.action} <span className="opacity-60 font-normal">(` / ESC)</span>
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
                aria-keyshortcuts="Backquote"
                onClick={() => onConfirm(dontAskAgain)}
                className="border-4 border-white bg-white text-black text-xs font-bold h-auto px-3 py-1 hover:bg-black hover:text-white hover:border-white"
              >
                {copy?.action} <span className="opacity-60 font-normal">(`)</span>
              </AlertDialogAction>
            </>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
