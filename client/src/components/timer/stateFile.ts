import { readBoolean, readJSON, readRaw } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import schemaJson from '../../../public/timer-state.schema.json';
import { DEFAULT_TIME, DEFAULT_TIME_ZONE, DEFAULT_VOLUME, MAX_HISTORY, MAX_TOTAL_SECONDS, STORAGE_KEYS, TIME_ZONES } from './constants';
import { readSavedHistory, readSavedPresets } from './entries';
import { formatSignedLabel, fromTotalSeconds, toTotalSeconds } from './format';
import { readConfirmMode, readSuppressedKeys } from './suppressions';
import type { ConfirmMode, TimeParts, TimerEntry } from './types';
import { COUNTER_MAX, countLabel, isWithinCap } from './wordCount';

// The whole of what the page remembers as one JSON file, and back.
//
// The file is its own shape rather than a dump of localStorage: the keys
// in there are names nobody chose for reading (timerAppState,
// wordCounterCollapsedAt), and two of them are left over from migrations.
// client/public/timer-state.schema.json describes it, is served beside
// the page for editors to fetch, and is what an import is checked against,
// so the published schema and the rules the page enforces are one file.
//
// An import doesn't set any state. It writes the store and reloads, and
// every value is read back through the same guarded readers a normal
// reload uses, so there is no second path by which state gets in.

export const STATE_FORMAT = 'write-timer-state';
export const STATE_VERSION = 1;

type Entry = { id: string; hours: number; minutes: number; seconds: number; negative: boolean; timestamp: number };

export interface StateFile {
  $schema: string;
  format: typeof STATE_FORMAT;
  version: typeof STATE_VERSION;
  exportedAt: string;
  timer: {
    status: 'idle' | 'running' | 'paused';
    remainingMs: number;
    configured: TimeParts & { negative: boolean };
  };
  presets: Entry[];
  history: Entry[];
  sound: { muted: boolean; volume: number; alarmRepeats: boolean };
  clock: { timeZone: string; hour24: boolean };
  theme: 'dark' | 'light';
  confirmations: { mode: ConfirmMode; dontAskAgain: string[] };
  layout: {
    sidebarTucked: boolean;
    timeFieldsTucked: boolean;
    websiteLinkHidden: boolean;
    wordCounter: {
      view: 'open' | 'tucked' | 'fullscreen';
      restoreFullscreen: boolean;
      autoTuckedAt: { width: number; height: number } | null;
    };
  };
  wordCounter: { text: string; alphanumericWordsOnly: boolean; alphanumericCharsOnly: boolean };
}

// What the timer is doing right now. Handed in rather than read from the
// store, which only takes the seconds on a whole-second change and the
// milliseconds as the page goes away.
export interface LiveTimer {
  seconds: number;
  milliseconds: number;
  isRunning: boolean;
  isPaused: boolean;
  configured: TimeParts;
  negative: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Split back into units from one total, so a row an older save kept as 90
// minutes still leaves as 1:30:00 and meets the schema it will be read
// against.
const toEntry = (entry: TimerEntry): Entry => {
  const total = Math.min(MAX_TOTAL_SECONDS, Math.max(0, Math.round(toTotalSeconds({ ...entry, hours: entry.hours ?? 0 }))));
  return {
    id: entry.id,
    ...fromTotalSeconds(total),
    negative: entry.negative === true,
    timestamp: Math.max(0, Math.round(entry.timestamp)),
  };
};

export function exportState(live: LiveTimer): StateFile {
  const configuredTotal = Math.min(MAX_TOTAL_SECONDS, Math.max(0, toTotalSeconds(live.configured)));
  const volume = readJSON<unknown>(STORAGE_KEYS.volume, null);
  const timeZone = readJSON<unknown>(STORAGE_KEYS.clockTimeZone, null);
  const collapsedAt = readJSON<unknown>(STORAGE_KEYS.wordCounterCollapsedAt, null);
  const isCollapsed = readBoolean(STORAGE_KEYS.wordCounterCollapsed, false);
  return {
    $schema: schemaJson.$id,
    format: STATE_FORMAT,
    version: STATE_VERSION,
    exportedAt: new Date().toISOString(),
    timer: {
      status: !live.isRunning ? 'idle' : live.isPaused ? 'paused' : 'running',
      // Floored, not rounded: 999.6ms rounded is a whole second more, and at
      // the 99:59:59 cap that's past the range the import accepts.
      remainingMs: live.seconds * 1000 + Math.floor(live.milliseconds),
      configured: { ...fromTotalSeconds(configuredTotal), negative: live.negative },
    },
    presets: readSavedPresets().map(toEntry),
    history: readSavedHistory().slice(0, MAX_HISTORY).map(toEntry),
    sound: {
      muted: readBoolean(STORAGE_KEYS.silentMode, false),
      volume: typeof volume === 'number' && Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : DEFAULT_VOLUME,
      alarmRepeats: readBoolean(STORAGE_KEYS.alarmLoop, false),
    },
    clock: {
      timeZone: typeof timeZone === 'string' && TIME_ZONES.includes(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
      hour24: readBoolean(STORAGE_KEYS.clock24Hour, false),
    },
    theme: readBoolean(STORAGE_KEYS.lightTheme, false) ? 'light' : 'dark',
    confirmations: {
      mode: readConfirmMode(),
      dontAskAgain: Array.from(new Set(readSuppressedKeys())),
    },
    layout: {
      sidebarTucked: readBoolean(STORAGE_KEYS.sidebarHidden, false),
      timeFieldsTucked: readBoolean(STORAGE_KEYS.timeFieldsHidden, false),
      websiteLinkHidden: readBoolean(STORAGE_KEYS.websiteLinkHidden, false),
      wordCounter: {
        // Collapsed wins over fullscreen: there is no such thing as a
        // hidden-but-fullscreen view, and collapsing is what leaves it.
        view: isCollapsed ? 'tucked' : readBoolean(STORAGE_KEYS.wordCounterFullscreen, false) ? 'fullscreen' : 'open',
        restoreFullscreen: isCollapsed && readBoolean(STORAGE_KEYS.wordCounterFullscreenBefore, false),
        autoTuckedAt:
          isCollapsed && isRecord(collapsedAt) && Number.isFinite(collapsedAt.w) && Number.isFinite(collapsedAt.h)
            ? { width: Math.max(0, collapsedAt.w as number), height: Math.max(0, collapsedAt.h as number) }
            : null,
      },
    },
    wordCounter: {
      text: readRaw(STORAGE_KEYS.wordCounter, ''),
      alphanumericWordsOnly: readBoolean(STORAGE_KEYS.wordCounterAlnumWordsOnly, true),
      alphanumericCharsOnly: readBoolean(STORAGE_KEYS.wordCounterAlnumCharsOnly, true),
    },
  };
}

// The part of JSON Schema the file uses, and no more. A validator library
// is most of this bundle again for the eight keywords below.
interface Schema {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  maxItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  $ref?: string;
}

const SCHEMA = schemaJson as Schema & { $defs: Record<string, Schema> };

const isType = (value: unknown, type: string) => {
  switch (type) {
    case 'null': return value === null;
    case 'boolean': return typeof value === 'boolean';
    case 'string': return typeof value === 'string';
    // Finite, since JSON.parse turns an overflowing literal into Infinity.
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'integer': return Number.isSafeInteger(value);
    case 'array': return Array.isArray(value);
    case 'object': return isRecord(value);
    default: return false;
  }
};

const MAX_ERRORS = 6;

function validate(value: unknown, schema: Schema, path: string, errors: string[]) {
  if (errors.length >= MAX_ERRORS) return;
  if (schema.$ref) schema = SCHEMA.$defs[schema.$ref.replace('#/$defs/', '')];
  const at = path || 'The file';
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${at} must be ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => isType(value, type))) {
      errors.push(`${at} must be ${types.map((t) => (t === 'integer' ? 'a whole number' : t === 'array' ? 'a list' : t === 'object' ? 'an object' : t)).join(' or ')}`);
      return;
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at} must be at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at} can hold at most ${schema.maxItems}`);
    if (schema.items) value.forEach((item, i) => validate(item, schema.items!, `${path}[${i}]`, errors));
  }
  if (isRecord(value)) {
    const child = (key: string) => (path ? `${path}.${key}` : key);
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${child(key)} is missing`);
    }
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) validate(item, sub, child(key), errors);
      else if (schema.additionalProperties === false) errors.push(`${child(key)} isn't something this file can hold`);
    }
  }
}

// What an accepted file will write, and what it will look like once it's
// in. The summary and warnings are for the question the import asks first.
export type ReadResult =
  | { ok: true; entries: Record<string, string>; summary: string[]; warnings: string[] }
  | { ok: false; errors: string[] };

type Parsed = Partial<Omit<StateFile, 'timer' | 'layout' | 'presets' | 'history'>> & {
  timer?: Partial<Omit<StateFile['timer'], 'configured'>> & { configured?: Partial<StateFile['timer']['configured']> };
  presets?: Partial<Entry>[];
  history?: Partial<Entry>[];
  layout?: Partial<Omit<StateFile['layout'], 'wordCounter'>> & { wordCounter?: Partial<StateFile['layout']['wordCounter']> };
};

// What's wrong with a file, by kind: text that isn't JSON at all, and JSON
// that isn't a state file. The dialog shows them as they're typed, on both
// sides, and readStateFile refuses on either.
export interface StateProblems {
  syntax: string | null;
  schema: string[];
}

type Checked = { syntax: string } | { data: unknown; schema: string[] };

function check(json: string): Checked {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (e) {
    return { syntax: `That isn't valid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }
  // Ahead of the schema, which would only say the version must be 1.
  if (isRecord(data) && data.format === STATE_FORMAT && typeof data.version === 'number' && data.version > STATE_VERSION) {
    return { data, schema: [`This file is version ${data.version}, from a newer copy of this page than the one open here (version ${STATE_VERSION}). Reload to pick up the newer page, then import it again.`] };
  }
  const schema: string[] = [];
  validate(data, SCHEMA, '', schema);
  // The one limit the schema can't say: it counts words and lines, not
  // characters, and it's the counter's own rule.
  const text = isRecord(data) && isRecord(data.wordCounter) ? data.wordCounter.text : undefined;
  if (!schema.length && typeof text === 'string' && !isWithinCap(text)) {
    schema.push(`wordCounter.text is over the word counter's limit of ${countLabel(COUNTER_MAX)} lines, words or characters`);
  }
  return { data, schema };
}

// null for a file the page would take as it is.
export function checkStateText(json: string): StateProblems | null {
  const checked = check(json);
  if ('syntax' in checked) return { syntax: checked.syntax, schema: [] };
  return checked.schema.length ? { syntax: null, schema: checked.schema } : null;
}

export function readStateFile(json: string): ReadResult {
  const checked = check(json);
  if ('syntax' in checked) return { ok: false, errors: [checked.syntax] };
  if (checked.schema.length) return { ok: false, errors: checked.schema };
  const file = checked.data as Parsed;

  // Everything the file leaves out is left out of the store too, and the
  // reload reads that key's default. That's what makes an import a
  // replacement rather than a merge: the keys are all wiped first.
  const entries: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value !== undefined) entries[key] = JSON.stringify(value);
  };
  const summary: string[] = [];
  const warnings: string[] = [];

  if (file.timer) {
    const configured = file.timer.configured
      ? { hours: file.timer.configured.hours ?? 0, minutes: file.timer.configured.minutes ?? 0, seconds: file.timer.configured.seconds ?? 0 }
      : DEFAULT_TIME;
    const negative = file.timer.configured?.negative === true;
    const remainingMs = file.timer.remainingMs ?? (negative ? -1 : 1) * toTotalSeconds(configured) * 1000;
    // Whole seconds floored, so the milliseconds land in [0, 1000) on
    // either side of zero, which is how the countdown holds them.
    const seconds = Math.floor(remainingMs / 1000);
    const status = file.timer.status ?? 'idle';
    // A running timer is written as running and comes back paused, the
    // same as any reload of one.
    put(STORAGE_KEYS.timerState, {
      seconds,
      milliseconds: remainingMs - seconds * 1000,
      isRunning: status !== 'idle',
      isPaused: status === 'paused',
      hours: configured.hours,
      minutes: configured.minutes,
      timerSeconds: configured.seconds,
    });
    put(STORAGE_KEYS.configuredNegative, negative);
    // Truncated toward zero, the way the digits read it.
    const shown = formatSignedLabel(Math.trunc(remainingMs / 1000));
    const set = formatSignedLabel((negative ? -1 : 1) * toTotalSeconds(configured));
    summary.push(
      status === 'idle' ? `The timer, set to ${set}`
      : status === 'paused' ? `The timer, paused at ${shown} of ${set}`
      : `The timer at ${shown} of ${set}, paused (it was running when exported)`
    );
  }

  // Ids are what the lists key their rows and their flashes on, so a
  // repeat or a gap gets a fresh one rather than two rows answering to
  // the same name.
  const seen = new Set<string>();
  const toStored = (entry: Partial<Entry>): TimerEntry => {
    let id = typeof entry.id === 'string' && entry.id !== '' && !seen.has(entry.id) ? entry.id : uniqueId();
    while (seen.has(id)) id = uniqueId();
    seen.add(id);
    return {
      id,
      hours: entry.hours ?? 0,
      minutes: entry.minutes ?? 0,
      seconds: entry.seconds ?? 0,
      negative: entry.negative === true,
      timestamp: entry.timestamp ?? 0,
    };
  };
  if (file.presets) {
    put(STORAGE_KEYS.presets, file.presets.map(toStored));
    summary.push(`${file.presets.length} preset${file.presets.length === 1 ? '' : 's'}`);
  }
  if (file.history) {
    put(STORAGE_KEYS.history, file.history.map(toStored));
    summary.push(`${file.history.length} history row${file.history.length === 1 ? '' : 's'}`);
  }

  put(STORAGE_KEYS.silentMode, file.sound?.muted);
  put(STORAGE_KEYS.volume, file.sound?.volume);
  put(STORAGE_KEYS.alarmLoop, file.sound?.alarmRepeats);

  const zone = file.clock?.timeZone;
  if (zone !== undefined && !TIME_ZONES.includes(zone)) {
    warnings.push(`This browser doesn't know the time zone "${zone}", so the clock will show ${DEFAULT_TIME_ZONE.replace(/_/g, ' ')}.`);
  }
  put(STORAGE_KEYS.clockTimeZone, zone);
  put(STORAGE_KEYS.clock24Hour, file.clock?.hour24);
  if (file.theme) put(STORAGE_KEYS.lightTheme, file.theme === 'light');

  const mode = file.confirmations?.mode;
  put(STORAGE_KEYS.confirmMode, mode);
  // The website link's switch lives in the confirmations list, as the
  // hideWebsiteLink row, and outside confirmations-off that row is what
  // the page reads it from (see Timer.tsx). Settled here to agree with
  // layout.websiteLinkHidden, so a file edited by hand to hide the link
  // does, rather than being overruled by a row it didn't know about.
  // With confirmations off the page reads the flag itself, and both go in
  // as they are.
  const linkHidden = file.layout?.websiteLinkHidden;
  let dontAskAgain = file.confirmations?.dontAskAgain ? Array.from(new Set(file.confirmations.dontAskAgain)) : undefined;
  if (linkHidden !== undefined && (mode ?? 'half') !== 'none') {
    dontAskAgain = (dontAskAgain ?? []).filter((key) => key !== 'hideWebsiteLink');
    if (linkHidden) dontAskAgain.push('hideWebsiteLink');
  }
  put(STORAGE_KEYS.dontAskAgain, dontAskAgain);
  put(STORAGE_KEYS.websiteLinkHidden, linkHidden);
  // The row above already says what the link does. Left unset, the
  // once-per-browser migration in Timer.tsx would run again on the reload
  // and rewrite the row off the flag.
  put(STORAGE_KEYS.linkRowMigrated, true);

  put(STORAGE_KEYS.sidebarHidden, file.layout?.sidebarTucked);
  put(STORAGE_KEYS.timeFieldsHidden, file.layout?.timeFieldsTucked);
  const counterView = file.layout?.wordCounter;
  if (counterView) {
    const view = counterView.view ?? 'open';
    const tucked = view === 'tucked';
    put(STORAGE_KEYS.wordCounterCollapsed, tucked);
    put(STORAGE_KEYS.wordCounterFullscreen, view === 'fullscreen');
    put(STORAGE_KEYS.wordCounterFullscreenBefore, tucked && counterView.restoreFullscreen === true);
    const at = counterView.autoTuckedAt;
    put(STORAGE_KEYS.wordCounterCollapsedAt, tucked && at ? { w: at.width, h: at.height } : null);
  }

  const text = file.wordCounter?.text;
  // Stored as itself, not as JSON; see WordCounter.
  if (text !== undefined) entries[STORAGE_KEYS.wordCounter] = text;
  put(STORAGE_KEYS.wordCounterAlnumWordsOnly, file.wordCounter?.alphanumericWordsOnly);
  put(STORAGE_KEYS.wordCounterAlnumCharsOnly, file.wordCounter?.alphanumericCharsOnly);
  if (text) summary.push(`${countLabel(text.length)} character${text.length === 1 ? '' : 's'} of word counter text`);

  return { ok: true, entries, summary, warnings };
}
