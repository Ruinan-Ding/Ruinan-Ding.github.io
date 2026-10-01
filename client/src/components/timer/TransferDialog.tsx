import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import DotCheckbox from './DotCheckbox';
import { exportFileName } from './format';
import { checkStateText, readStateFile, type ReadResult, type StateFile, type StateProblems } from './stateFile';
import { QUESTIONS } from './suppressions';
import { useConfirmKeyLabel } from './useConfirmKeyLabel';
import { FLASH_DURATION_MS } from './useFlashOnToken';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  // Called on open and on each return to EXPORT while the box is
  // untouched, so a running timer is written as it stands then rather than
  // as it stood on first open. An edited box is left as it was typed.
  snapshot: () => StateFile;
  // False when the store refused the write. The page stays, and says so.
  onImport: (entries: Record<string, string>) => boolean;
  // Whether exporting text that fails its checks asks first: the
  // exportInvalid row in the confirmations list, read through the mode
  // like every other question.
  askBeforeInvalidExport: boolean;
  // That question's "Keep asking this" box, cleared and answered.
  onSilenceInvalidExport: () => void;
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

const INVALID_EXPORT_LABEL = QUESTIONS.find((q) => q.key === 'exportInvalid')?.label ?? null;

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

// Export and import in one place, both as the JSON described by
// timer-state.schema.json, and both boxes editable and checked against it
// as they're typed in. Import is two steps: IMPORT stays greyed out until
// the text passes, and a file that passes gets the question, with what it
// holds spelled out, before anything is written. An export that fails is
// the person's to save, but it asks first, with what's wrong.
export default function TransferDialog({ open, onClose, snapshot, onImport, askBeforeInvalidExport, onSilenceInvalidExport }: TransferDialogProps) {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportText, setExportText] = useState('');
  // Typed in since the last snapshot. Until it is, the box is the page's
  // own state and is refreshed with it.
  const [exportEdited, setExportEdited] = useState(false);
  // What the empty name box shows: the name DOWNLOAD would give the file
  // this second.
  const [now, setNow] = useState(() => new Date());
  const [nameText, setNameText] = useState('');
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState<ReadResult | null>(null);
  // The step that asks, if one is showing: replacing everything with an
  // import, or saving an export that fails its checks.
  const [asking, setAsking] = useState<'replace' | 'copy' | 'download' | null>(null);
  // The export question's "Keep asking this", ticked each time it opens.
  const [keepAsking, setKeepAsking] = useState(true);
  const [storageFailed, setStorageFailed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const keyLabel = useConfirmKeyLabel();

  // Checked on every keystroke, and only then: the tick below re-renders
  // every second and must not re-validate a text that hasn't changed.
  // An empty import box is nothing typed yet rather than bad JSON.
  const exportProblems = useMemo(() => checkStateText(exportText), [exportText]);
  const importProblems = useMemo(() => (importText.trim() === '' ? null : checkStateText(importText)), [importText]);

  const takeSnapshot = () => {
    const file = snapshot();
    const text = JSON.stringify(file, null, 2);
    setExportText(text);
    setExportEdited(false);
    return { text, at: new Date(file.exportedAt) };
  };

  // Reset on the way in rather than on the way out. Radix keeps the
  // content mounted through its exit fade, and clearing it on close
  // swapped the view out from under the fade. The pasted text, an edited
  // export and the typed file name stay, so closing by accident doesn't
  // lose them.
  useEffect(() => {
    if (!open) return;
    setTab('export');
    if (!exportEdited) takeSnapshot();
    setResult(null);
    setAsking(null);
    setStorageFailed(false);
    setCopyState('idle');
    // Only on opening: a snapshot per render would rewrite the box every
    // tick of a running timer.
  }, [open]);

  // Ticks while the empty box is on screen, timed to land on each new
  // second rather than every 1000ms from whenever the dialog opened, so the
  // second it shows is the second a click gets.
  const isNameEmpty = nameText === '';
  useEffect(() => {
    if (!open || tab !== 'export' || !isNameEmpty) return;
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => clearTimeout(id);
  }, [open, tab, isNameEmpty]);

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

  const showTab = (next: 'export' | 'import') => {
    if (next === 'export' && !exportEdited) takeSnapshot();
    setTab(next);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  // Untouched, the box is refreshed first, so the file holds the moment of
  // the click and its name says so, and the box shows what was saved.
  // Edited, it is saved as typed: the name still carries the click, and
  // the file holds whatever was written in it.
  const download = () => {
    const { text, at } = exportEdited ? { text: exportText, at: new Date() } : takeSnapshot();
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: exportFileName(nameText, at) });
    link.click();
    // After the click has had its turn, or some browsers cancel the
    // download along with the URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // COPY and DOWNLOAD both come through here: a text the import would
  // refuse asks first, unless that question has been silenced or
  // confirmations are off.
  const exportVia = (kind: 'copy' | 'download') => {
    if (exportProblems && askBeforeInvalidExport) {
      setKeepAsking(true);
      setAsking(kind);
      return;
    }
    if (kind === 'copy') void copy();
    else download();
  };

  const exportAnyway = () => {
    if (!keepAsking) onSilenceInvalidExport();
    const kind = asking;
    setAsking(null);
    if (kind === 'copy') void copy();
    else download();
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setImportText(await file.text());
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
        : 'IMPORT / EXPORT';
  const description = asking === 'replace'
    ? 'The timer, presets, history, word counter text and every setting on this page are replaced by the file’s, and the page reloads. Anything the file leaves out goes back to its default. What’s here now is gone unless you’ve exported it.'
    : asking !== null
      ? 'What’s in the box doesn’t pass the checks an import makes, so importing it here would be refused. It can still be saved as it is.'
      : tab === 'export'
        ? 'Everything this page remembers, as JSON: the timer and where it is, presets, history, the word counter’s text, and every setting down to which panels are tucked away. Edit it here before saving it if you like.'
        : 'Paste JSON exported from here, or load the file. It’s checked as you type, and nothing changes until you’ve seen what it holds.';

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
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
        ) : asking !== null ? (
          <>
            {exportProblems && <Problems problems={exportProblems} className="text-yellow-500" />}
            {/* The same row ConfirmDialog has, writing the same key the
                confirmations list shows. */}
            <button
              type="button"
              data-dont-ask
              onClick={() => setKeepAsking((prev) => !prev)}
              aria-pressed={keepAsking}
              className="flex items-center gap-2 text-white text-sm font-bold self-start transition-opacity duration-200 hover:opacity-80"
              title="Clear this to stop this particular question asking. Resetting the website to defaults brings it back."
            >
              <DotCheckbox checked={keepAsking} />
              <span className="text-left">
                Keep asking this
                {INVALID_EXPORT_LABEL && (
                  <span className="opacity-60 font-normal"> ({INVALID_EXPORT_LABEL})</span>
                )}
              </span>
            </button>
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
                  setExportEdited(true);
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
            {/* The placeholder is the name an empty box would download as
                this second, and ENTER in the box is DOWNLOAD. */}
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
                  placeholder={exportFileName('', now)}
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
          {asking === 'replace' ? (
            <>
              <button type="button" className={SECONDARY} onClick={() => setAsking(null)}>
                BACK <span className="opacity-60 font-normal">(ESC)</span>
              </button>
              <button type="button" ref={yesRef} className={DANGER} aria-keyshortcuts={keyLabel} onClick={replace}>
                REPLACE AND RELOAD <span className="opacity-60 font-normal">({keyLabel})</span>
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
