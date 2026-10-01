import { useEffect, useRef, useState } from 'react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { exportFileName } from './format';
import { readStateFile, type ReadResult, type StateFile } from './stateFile';
import { useConfirmKeyLabel } from './useConfirmKeyLabel';
import { FLASH_DURATION_MS } from './useFlashOnToken';

interface TransferDialogProps {
  open: boolean;
  onClose: () => void;
  // Called on open and on each return to EXPORT, so a running timer is
  // written as it stands then rather than as it stood on first open.
  snapshot: () => StateFile;
  // False when the store refused the write. The page stays, and says so.
  onImport: (entries: Record<string, string>) => boolean;
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

// Export and import in one place, both as the JSON described by
// timer-state.schema.json. Import is two steps: the file is checked when
// IMPORT is pressed, and only a file that passes gets the question, with
// what it holds spelled out, before anything is written.
export default function TransferDialog({ open, onClose, snapshot, onImport }: TransferDialogProps) {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [exportText, setExportText] = useState('');
  // The snapshot's own exportedAt, so the default name's stamp and the one
  // inside the file are the same moment.
  const [exportedAt, setExportedAt] = useState(() => new Date());
  const [nameText, setNameText] = useState('');
  const [importText, setImportText] = useState('');
  const [result, setResult] = useState<ReadResult | null>(null);
  // Set once IMPORT has read a file that passes: the step that asks.
  const [isConfirming, setIsConfirming] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);
  const keyLabel = useConfirmKeyLabel();

  const takeSnapshot = () => {
    const file = snapshot();
    setExportText(JSON.stringify(file, null, 2));
    setExportedAt(new Date(file.exportedAt));
  };

  // Reset on the way in rather than on the way out. Radix keeps the
  // content mounted through its exit fade, and clearing it on close
  // swapped the view out from under the fade. The pasted text and the
  // typed file name stay, so closing by accident doesn't lose them.
  useEffect(() => {
    if (!open) return;
    setTab('export');
    takeSnapshot();
    setResult(null);
    setIsConfirming(false);
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
    if (isConfirming) replaceRef.current?.focus();
  }, [isConfirming]);

  const showTab = (next: 'export' | 'import') => {
    if (next === 'export') takeSnapshot();
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

  const download = () => {
    const url = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: exportFileName(nameText, exportedAt) });
    link.click();
    // After the click has had its turn, or some browsers cancel the
    // download along with the URL.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setImportText(await file.text());
    setResult(null);
  };

  const check = () => {
    const next = readStateFile(importText);
    setResult(next);
    setStorageFailed(false);
    if (next.ok) setIsConfirming(true);
  };

  const replace = () => {
    if (!result?.ok) return;
    if (!onImport(result.entries)) {
      setStorageFailed(true);
      setIsConfirming(false);
    }
  };

  const errors = result && !result.ok ? result.errors : null;
  const title = isConfirming ? 'REPLACE EVERYTHING?' : 'IMPORT / EXPORT';
  const description = isConfirming
    ? 'The timer, presets, history, word counter text and every setting on this page are replaced by the file’s, and the page reloads. Anything the file leaves out goes back to its default. What’s here now is gone unless you’ve exported it.'
    : tab === 'export'
      ? 'Everything this page remembers, as JSON: the timer and where it is, presets, history, the word counter’s text, and every setting down to which panels are tucked away.'
      : 'Paste JSON exported from here, or load the file. Nothing changes until you’ve checked what it holds.';

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent
        className="bg-black border-4 border-white p-4 gap-3 sm:max-w-2xl"
        // ESC backs out of the question to the text it was asking about,
        // and only closes the dialog from there.
        onEscapeKeyDown={(e) => {
          if (!isConfirming) return;
          e.preventDefault();
          setIsConfirming(false);
        }}
        onKeyDown={(e) => {
          if (!isConfirming) return;
          // Backquote is yes here too, and only on the question: while
          // the text is showing it is a character somebody is typing.
          if (e.code === 'Backquote' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            e.stopPropagation();
            replaceRef.current?.click();
            return;
          }
          // Dead on the button that says yes, as in ConfirmDialog: the
          // question opens pointed at it, and a reflex on either key
          // would answer before it was read.
          if ((e.key === 'Enter' || e.key === ' ') && e.target === replaceRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white text-lg font-bold">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-white text-sm">{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {isConfirming && result?.ok ? (
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
            {/* Dropping a file on the box loads it. Left to the browser, a
                dropped file is opened in place of the page. */}
            <textarea
              key={tab}
              data-transfer-text={tab}
              value={tab === 'export' ? exportText : importText}
              readOnly={tab === 'export'}
              onChange={(e) => {
                setImportText(e.target.value);
                setResult(null);
              }}
              onFocus={(e) => tab === 'export' && e.currentTarget.select()}
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
                    download();
                  }}
                  placeholder={exportFileName('', exportedAt)}
                  spellCheck={false}
                  autoComplete="off"
                  className={`${FIELD} zoom-safe-text flex-1 min-w-0 px-2 py-1 font-normal text-ellipsis`}
                />
              </label>
            )}
            {errors && (
              <ul className="text-red-500 text-sm list-disc pl-5" role="alert" data-transfer-errors>
                {errors.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}
            {storageFailed && (
              <p className="text-red-500 text-sm" role="alert" data-transfer-errors>
                The browser wouldn’t store all of it, most likely for lack of room, so nothing was changed.
              </p>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-3 justify-end items-center">
          {isConfirming ? (
            <>
              <button type="button" className={SECONDARY} onClick={() => setIsConfirming(false)}>
                BACK <span className="opacity-60 font-normal">(ESC)</span>
              </button>
              <button type="button" ref={replaceRef} className={DANGER} aria-keyshortcuts={keyLabel} onClick={replace}>
                REPLACE AND RELOAD <span className="opacity-60 font-normal">({keyLabel})</span>
              </button>
            </>
          ) : (
            <>
              {tab === 'export' ? (
                <>
                  <button type="button" className={SECONDARY} onClick={copy}>
                    {copyState === 'copied' ? 'COPIED' : copyState === 'failed' ? 'COPY FAILED' : 'COPY'}
                  </button>
                  <button type="button" className={SECONDARY} onClick={download}>
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
                  <button type="button" className={PRIMARY} onClick={check} disabled={importText.trim() === ''}>
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
