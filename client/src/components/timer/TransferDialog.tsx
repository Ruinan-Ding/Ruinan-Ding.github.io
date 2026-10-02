import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DotCheckbox from './DotCheckbox';
import { exportFileName } from './format';
import { checkStateText, readStateFile, type ReadResult, type StateFile, type StateProblems } from './stateFile';
import { QUESTIONS, type TransferQuestion } from './suppressions';
import { useConfirmKeyLabel } from './useConfirmKeyLabel';
import { FLASH_DURATION_MS } from './useFlashOnToken';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  // Called on every opening, on each return to EXPORT while the box is
  // untouched, and by REVERT, so the box holds the page as it stands then
  // rather than as it stood the first time.
  snapshot: () => StateFile;
  // False when the store refused the write. The page stays, and says so.
  onImport: (entries: Record<string, string>) => boolean;
  // Whether one of the questions this dialog asks inside itself still
  // asks: its row in the confirmations list, read through the mode like
  // every other question.
  asks: (key: TransferQuestion) => boolean;
  // That question's "Keep asking this" box, cleared and answered.
  onSilence: (key: TransferQuestion) => void;
}

// The same look as ConfirmDialog's buttons, on plain buttons: only CLOSE
// is Radix's Cancel, since everything else here has to leave the dialog
// open.
const BUTTON = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border-4 text-xs font-bold h-auto px-3 py-1 transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50';
const SECONDARY = `${BUTTON} border-white text-white hover:bg-white hover:text-black`;
const PRIMARY = `${BUTTON} border-white bg-white text-black hover:bg-black hover:text-white`;
// Red like the bin beside it: this one also throws away everything on
// the page.
const DANGER = `${BUTTON} border-red-500 bg-red-500 text-white hover:bg-black hover:text-red-500`;
const FIELD = 'bg-black text-white border-2 border-white rounded-md font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

// What the checks found, as the box below the text and in the question
// that asks before exporting it. Text that isn't JSON can't be held up to
// the schema, so it is one or the other.
function Problems({ problems, className }: { problems: StateProblems; className: string }) {
  return (
    <div className={`text-sm flex flex-col gap-1 ${className}`} aria-live="polite" data-transfer-errors>
      {problems.syntax !== null ? (
        <p>{problems.syntax}</p>
      ) : (
        <>
          <p>It doesn’t match the schema:</p>
          <ul className="list-disc pl-5">
            {problems.schema.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

// The same row ConfirmDialog has, writing the same key the confirmations
// list shows. Ticked means it keeps asking, which is how it arrives;
// clearing it is what silences the question.
function KeepAsking({ question, checked, onToggle }: { question: TransferQuestion; checked: boolean; onToggle: () => void }) {
  const label = QUESTIONS.find((q) => q.key === question)?.label;
  return (
    <button
      type="button"
      data-dont-ask
      onClick={onToggle}
      aria-pressed={checked}
      className="flex items-center gap-2 text-white text-sm font-bold self-start transition-opacity duration-200 hover:opacity-80"
      title="Clear this to stop this particular question asking. Resetting the website to defaults brings it back."
    >
      <DotCheckbox checked={checked} />
      <span className="text-left">
        Keep asking this
        {label && <span className="opacity-60 font-normal"> ({label})</span>}
      </span>
    </button>
  );
}

// Export and import in one place, both as the JSON described by
// timer-state.schema.json, and both boxes editable and checked against it
// as they're typed in. Import is two steps: IMPORT stays greyed out until
// the text passes, and a file that passes gets the question, with what it
// holds spelled out, before anything is written. An export that fails is
// the person's to save, but it asks first, with what's wrong. Closing
// throws away whatever was typed and not yet saved, so with something to
// lose it asks first too.
export default function TransferDialog({ open, onClose, snapshot, onImport, asks, onSilence }: TransferDialogProps) {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportText, setExportText] = useState('');
  // The last snapshot, and the moment it was taken. The moment is the
  // exportedAt inside it and the stamp the default file name carries, so
  // the name the empty box shows, the name the file gets and the time in
  // the file are one time: when the snapshot was taken.
  const [snapshotText, setSnapshotText] = useState('');
  const [snapshotAt, setSnapshotAt] = useState(() => new Date());
  // The export as it was last snapshotted, copied or downloaded. Closing
  // only loses what differs from it.
  const [savedText, setSavedText] = useState('');
  const [nameText, setNameText] = useState('');
  const [importText, setImportText] = useState('');
  // What LOAD FILE last put in the import box. That text is still in the
  // file it came from, so closing over it loses nothing.
  const [loadedText, setLoadedText] = useState('');
  const [result, setResult] = useState<ReadResult | null>(null);
  // The step that asks, if one is showing: replacing everything with an
  // import, saving an export that fails its checks, or closing over
  // something unsaved.
  const [asking, setAsking] = useState<'replace' | 'copy' | 'download' | 'close' | null>(null);
  // The showing question's "Keep asking this", ticked each time one opens.
  const [keepAsking, setKeepAsking] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const keyLabel = useConfirmKeyLabel();

  // Checked on every keystroke, and only then. An empty import box is
  // nothing typed yet rather than bad JSON.
  const exportProblems = useMemo(() => checkStateText(exportText), [exportText]);
  const importProblems = useMemo(() => (importText.trim() === '' ? null : checkStateText(importText)), [importText]);

  // Typed in since the last snapshot: REVERT shows, and the box is left
  // alone on a return to EXPORT.
  const exportEdited = exportText !== snapshotText;
  // What closing would throw away.
  const exportUnsaved = exportText !== savedText;
  const importUnsaved = importText.trim() !== '' && importText !== loadedText;

  const takeSnapshot = () => {
    const file = snapshot();
    const text = JSON.stringify(file, null, 2);
    setExportText(text);
    setSnapshotText(text);
    setSavedText(text);
    setSnapshotAt(new Date(file.exportedAt));
  };

  // Reset on the way in rather than on the way out. Radix keeps the
  // content mounted through its exit fade, and clearing it on close
  // swapped the view out from under the fade. Closing is what throws away
  // what was typed in either box, so every opening starts from the page
  // as it is then; only the typed file name carries over.
  useEffect(() => {
    if (!open) return;
    setTab('export');
    takeSnapshot();
    setImportText('');
    setLoadedText('');
    setResult(null);
    setAsking(null);
    setStorageFailed(false);
    setCopyState('idle');
    // Only on opening: a snapshot per render would rewrite the box every
    // tick of a running timer.
  }, [open]);

  useEffect(() => {
    if (copyState === 'idle') return;
    const id = setTimeout(() => setCopyState('idle'), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [copyState]);

  // The question's own button takes the focus, as ConfirmDialog's does,
  // so the backquote and a screen reader both land on what's being asked.
  useEffect(() => {
    if (asking) yesRef.current?.focus();
  }, [asking]);

  const ask = (step: 'copy' | 'download' | 'close') => {
    setKeepAsking(true);
    setAsking(step);
  };

  const showTab = (next: 'export' | 'import') => {
    if (next === 'export' && !exportEdited) takeSnapshot();
    setTab(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setSavedText(exportText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  // The box as it stands, named for the snapshot it came from: the name
  // the empty box shows is the name the file gets, and an untouched export
  // carries the same moment as its exportedAt.
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: exportFileName(nameText, snapshotAt) });
    link.click();
    setSavedText(exportText);
    // After the click has had its turn, or some browsers cancel the
    // download along with the URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // COPY and DOWNLOAD both come through here: a text the import would
  // refuse asks first, unless that question has been silenced or
  // confirmations are off.
  const exportVia = (kind: 'copy' | 'download') => {
    if (exportProblems && asks('exportInvalid')) {
      ask(kind);
      return;
    }
    if (kind === 'copy') void copy();
    else download();
  };

  const exportAnyway = () => {
    if (!keepAsking) onSilence('exportInvalid');
    const kind = asking;
    setAsking(null);
    if (kind === 'copy') void copy();
    else download();
  };

  // Every way out comes through here, CLOSE and ESC alike, by way of
  // Radix's onOpenChange. With nothing unsaved, or the question silenced,
  // or confirmations off, it just closes.
  const requestClose = () => {
    if ((exportUnsaved || importUnsaved) && asks('discardTransfer')) {
      ask('close');
      return;
    }
    onClose();
  };

  // The question is left showing through the exit fade rather than
  // swapped back to the text on the way out; the next opening resets it.
  const discardAndClose = () => {
    if (!keepAsking) onSilence('discardTransfer');
    onClose();
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    setLoadedText(text);
    setResult(null);
  };

  const check = () => {
    const next = readStateFile(importText);
    setStorageFailed(false);
    if (!next.ok) return;
    setResult(next);
    setAsking('replace');
  };

  const replace = () => {
    if (!result?.ok) return;
    if (!onImport(result.entries)) {
      setStorageFailed(true);
      setAsking(null);
    }
  };

  const title = asking === 'replace' ? 'REPLACE EVERYTHING?'
    : asking === 'copy' ? 'COPY IT ANYWAY?'
      : asking === 'download' ? 'DOWNLOAD IT ANYWAY?'
        : asking === 'close' ? 'DISCARD CHANGES?'
          : 'IMPORT / EXPORT';
  const description = asking === 'replace'
    ? 'The timer, presets, history, word counter text and every setting on this page are replaced by the file’s, and the page reloads. Anything the file leaves out goes back to its default. What’s here now is gone unless you’ve exported it.'
    : asking === 'close'
      ? 'Closing throws away what’s been typed here and not saved. Next time, the export starts again from the page as it is then, and the import box starts empty.'
      : asking !== null
        ? 'What’s in the box doesn’t pass the checks an import makes, so importing it here would be refused. It can still be saved as it is.'
        : tab === 'export'
          ? 'Everything this page remembers, as JSON: the timer and where it is, presets, history, the word counter’s text, and every setting down to which panels are tucked away. Edit it here before saving it if you like.'
          : 'Paste JSON exported from here, or load the file. It’s checked as you type, and nothing changes until you’ve seen what it holds.';

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && requestClose()}>
      <AlertDialogContent
        className="bg-black border-4 border-white p-4 gap-3 sm:max-w-2xl"
        // ESC backs out of the question to the text it was asking about,
        // and only closes the dialog from there.
        onEscapeKeyDown={(e) => {
          if (!asking) return;
          e.preventDefault();
          setAsking(null);
        }}
        onKeyDown={(e) => {
          if (!asking) return;
          // Backquote is yes here too, and only on the question: while
          // the text is showing it is a character somebody is typing.
          if (e.code === 'Backquote' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            yesRef.current?.click();
            return;
          }
          // Dead on the button that says yes, as in ConfirmDialog: the
          // question opens pointed at it, and a reflex on either key
          // would answer before it was read.
          if ((e.key === 'Enter' || e.key === ' ') && e.target === yesRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white text-lg font-bold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-white text-sm">{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {asking === 'replace' && result?.ok ? (
          <div className="text-white text-sm flex flex-col gap-1" data-transfer-summary>
            {result.summary.length > 0 && (
              <ul className="list-disc pl-5">
                {result.summary.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
            {result.warnings.map((line) => (
              <p key={line} className="text-yellow-500">{line}</p>
            ))}
          </div>
        ) : asking === 'close' ? (
          <>
            <ul className="text-white text-sm list-disc pl-5" data-transfer-discard>
              {exportUnsaved && <li>Edits to the export that haven’t been copied or downloaded</li>}
              {importUnsaved && <li>Text in the import box that hasn’t been imported</li>}
            </ul>
            <KeepAsking question="discardTransfer" checked={keepAsking} onToggle={() => setKeepAsking((prev) => !prev)} />
          </>
        ) : asking !== null ? (
          <>
            {exportProblems && <Problems problems={exportProblems} className="text-yellow-500" />}
            <KeepAsking question="exportInvalid" checked={keepAsking} onToggle={() => setKeepAsking((prev) => !prev)} />
          </>
        ) : (
          <>
            <div className="flex gap-2" role="group" aria-label="Export or import">
              <button type="button" className={tab === 'export' ? PRIMARY : SECONDARY} aria-pressed={tab === 'export'} onClick={() => showTab('export')}>
                EXPORT
              </button>
              <button type="button" className={tab === 'import' ? PRIMARY : SECONDARY} aria-pressed={tab === 'import'} onClick={() => showTab('import')}>
                IMPORT
              </button>
            </div>
            {/* Dropping a file on the import box loads it. Left to the
                browser, a dropped file is opened in place of the page. */}
            <textarea
              key={tab}
              data-transfer-text={tab}
              value={tab === 'export' ? exportText : importText}
              onChange={(e) => {
                if (tab === 'export') {
                  setExportText(e.target.value);
                } else {
                  setImportText(e.target.value);
                  setResult(null);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (tab === 'import') void loadFile(e.dataTransfer.files[0]);
              }}
              placeholder={tab === 'import' ? '{ "format": "write-timer-state", "version": 1, … }' : undefined}
              spellCheck={false}
              aria-label={tab === 'export' ? 'Exported state' : 'State to import'}
              className={`${FIELD} w-full p-2 resize-none`}
              style={{ height: 'min(45vh, 24rem)' }}
            />
            {/* The placeholder is the name an empty box downloads as, and
                ENTER in the box is DOWNLOAD. */}
            {tab === 'export' && (
              <label className="flex items-center gap-2 text-white text-xs font-bold">
                FILE NAME
                <input
                  type="text"
                  data-transfer-filename
                  value={nameText}
                  onChange={(e) => setNameText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    exportVia('download');
                  }}
                  placeholder={exportFileName('', snapshotAt)}
                  spellCheck={false}
                  autoComplete="off"
                  className={`${FIELD} zoom-safe-text flex-1 min-w-0 px-2 py-1 font-normal text-ellipsis`}
                />
              </label>
            )}
            {/* Yellow on export, which can still be saved; red on import,
                which can't be until it passes. */}
            {tab === 'export' && exportProblems && <Problems problems={exportProblems} className="text-yellow-500" />}
            {tab === 'import' && importProblems && <Problems problems={importProblems} className="text-red-500" />}
            {storageFailed && (
              <p className="text-red-500 text-sm" role="alert" data-transfer-errors>
                The browser wouldn’t store all of it, most likely for lack of room, so nothing was changed.
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-3 justify-end items-center">
          {asking === 'replace' || asking === 'close' ? (
            <>
              <button type="button" className={SECONDARY} onClick={() => setAsking(null)}>
                BACK <span className="opacity-60 font-normal">(ESC)</span>
              </button>
              <button type="button" ref={yesRef} className={DANGER} aria-keyshortcuts={keyLabel} onClick={asking === 'replace' ? replace : discardAndClose}>
                {asking === 'replace' ? 'REPLACE AND RELOAD' : 'DISCARD AND CLOSE'} <span className="opacity-60 font-normal">({keyLabel})</span>
              </button>
            </>
          ) : asking !== null ? (
            <>
              <button type="button" className={SECONDARY} onClick={() => setAsking(null)}>
                BACK <span className="opacity-60 font-normal">(ESC)</span>
              </button>
              <button type="button" ref={yesRef} className={PRIMARY} aria-keyshortcuts={keyLabel} onClick={exportAnyway}>
                {asking === 'copy' ? 'COPY ANYWAY' : 'DOWNLOAD ANYWAY'} <span className="opacity-60 font-normal">({keyLabel})</span>
              </button>
            </>
          ) : (
            <>
              {tab === 'export' ? (
                <>
                  {/* Only once there are edits to throw away. */}
                  {exportEdited && (
                    <button type="button" className={SECONDARY} onClick={takeSnapshot} title="Put back what the page holds now, losing the edits">
                      REVERT
                    </button>
                  )}
                  <button type="button" className={SECONDARY} onClick={() => exportVia('copy')}>
                    {copyState === 'copied' ? 'COPIED' : copyState === 'failed' ? 'COPY FAILED' : 'COPY'}
                  </button>
                  <button type="button" className={SECONDARY} onClick={() => exportVia('download')}>
                    DOWNLOAD
                  </button>
                </>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      void loadFile(e.target.files?.[0]);
                      // Or picking the same file again fires nothing.
                      e.target.value = '';
                    }}
                  />
                  <button type="button" className={SECONDARY} onClick={() => fileInputRef.current?.click()}>
                    LOAD FILE
                  </button>
                  <button type="button" className={PRIMARY} onClick={check} disabled={importText.trim() === '' || importProblems !== null}>
                    IMPORT
                  </button>
                </>
              )}
              <AlertDialogCancel className={SECONDARY}>
                CLOSE <span className="opacity-60 font-normal">(ESC)</span>
              </AlertDialogCancel>
            </>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
