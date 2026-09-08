// Every question the app can ask, with a box saying whether it still
// asks. Its own file because it is a hundred lines of nesting that sat in
// the middle of the header, and the four sizes and headings it needs are
// read nowhere else.
import { Fragment } from 'react';
import DotCheckbox from './DotCheckbox';
import { shrinkClamp } from './responsive';
import { isQuestionLive, QUESTIONS, sectionKeys } from './suppressions';
import type { ConfirmMode } from './types';

// The list names the mode it is showing, since a row greyed out has no
// other way to say why.
// Ticked means asks. Written the other way round it read as a list of
// negatives to switch on — an empty box meaning "you will be asked" is a
// double negative to hold in your head, and everything arrived unticked
// so the default looked like nothing was set. Every box starts full, and
// clearing one is what stops that question.
//
// Only the wording turns over: what is stored is still the questions that
// have been silenced, which is the short list.
const CONFIRM_LIST_HEADING: Record<ConfirmMode, string> = {
  half: 'ASK ME ABOUT',
  full: 'ASK ME ABOUT — EVERYTHING',
  none: 'ASK ME ABOUT — NOTHING ASKS',
};

// The list runs half-tier questions first and full-tier ones after, and
// each group is headed. Without them the greying is the only thing saying
// which is which, and grey against grey says nothing at all: in half mode
// the second group is grey, and with confirmations off both are, so a
// reader has no way to tell a question their mode skips from one nothing
// asks.
//
// Both worded as what makes the group active, since that is the thing
// being read off the greying.
const CONFIRM_LIST_SECTION: Record<'half' | 'full', string> = {
  half: 'ACTIVE CONFIRMATIONS',
  full: 'ACTIVE IN FULL CONFIRMATION ONLY',
};

const CONFIRM_LIST_FONT_SIZE = shrinkClamp(0.6, 1, 1.1, 0.72);
// The section headings, a little over the rows they head. Not much over:
// The longer of the two is thirty-two characters, and the
// panel is 22rem less its padding, its border and the heading's own box.
const CONFIRM_SECTION_FONT_SIZE = `calc(${CONFIRM_LIST_FONT_SIZE} * 1.15)`;

// What clearing a row does. Two things vary: the one row that is not a
// question takes the link off the page rather than quietening anything,
// and a row the mode in front of you doesn't read changes nothing until
// you come back to a mode that does.
const rowTitle = (key: string, live: boolean) => {
  const what = key === 'hideWebsiteLink' ? 'take the website link off the page' : 'stop it asking';
  return live
    ? `Clear this to ${what}`
    : `Clear this to ${what}. The confirm mode you're in doesn't read this row, so nothing changes until you cycle back to one that does`;
};

type ConfirmListProps = {
  confirmMode: ConfirmMode;
  suppressedKeys: string[];
  sectionTicked: (tier: 'half' | 'full') => number;
  onToggleSection: (tier: 'half' | 'full') => void;
  onToggleKey: (key: string) => void;
};

function ConfirmList({ confirmMode, suppressedKeys, sectionTicked, onToggleSection, onToggleKey }: ConfirmListProps) {
  return (
    // Right-aligned and dropped straight out of the button with
    // no gap: a gap is a strip the pointer has to cross on the
    // way down, and crossing it closes the thing it was heading
    // for. z-[95] clears the header strip and the website link,
    // both of which this hangs over.
    <div
      data-confirm-list
      className="absolute top-full right-0 z-[95] flex flex-col border-3 text-left"
      style={{
        width: 'min(22rem, calc(100vw - 1rem))',
        maxHeight: 'min(24rem, 60vh)',
        borderColor: 'var(--app-ink)',
        backgroundColor: 'var(--app-surface)',
        color: 'var(--app-ink)',
      }}
    >
      <div
        className="px-2 py-1 font-bold border-b-3 flex-shrink-0"
        style={{ fontSize: CONFIRM_LIST_FONT_SIZE, borderColor: 'var(--app-ink)' }}
      >
        {CONFIRM_LIST_HEADING[confirmMode]}
      </div>
      {/* The one scrolling list in the app. Thirty-odd
          questions fit no window this button floats over, and
          a list cut to fit is questions with no way to answer
          them. */}
      <div data-confirm-scroll className="overflow-y-auto">
        {QUESTIONS.map((question, i) => {
          const live = isQuestionLive(question.tier, confirmMode);
          const silenced = suppressedKeys.includes(question.key);
          // The first row of each group. Read off the row
          // before rather than an index, so reordering the
          // list can't leave a heading in the wrong place.
          const opensTier = i === 0 || QUESTIONS[i - 1].tier !== question.tier;
          return (
            <Fragment key={question.key}>
            {opensTier && (
              <button
                type="button"
                data-confirm-section={question.tier}
                onClick={() => onToggleSection(question.tier)}
                aria-pressed={sectionTicked(question.tier) === 0}
                title={sectionTicked(question.tier) === 0
                  ? 'Stop every question in this section asking'
                  : 'Let every question in this section ask again'}
                // Ruled off the group above as well, except at
                // the top, where the panel's own heading has
                // already drawn that line and a second one
                // beside it is 6px of border.
                className={`w-full flex items-center gap-2 px-2 py-1 font-bold text-left border-b-3 hover:opacity-70 transition-opacity ${i > 0 ? 'border-t-3' : ''}`}
                style={{
                  fontSize: CONFIRM_SECTION_FONT_SIZE,
                  borderColor: 'var(--app-ink)',
                  // Green while the section is asking, red
                  // while it isn't. Its rows grey out, which
                  // says "not in play"; the heading says
                  // whether the group is on or off, and those
                  // are the two colours this app already uses
                  // for that everywhere else.
                  color: live ? '#22c55e' : '#ef4444',
                }}
              >
                {/* Full when every question below asks, the
                    diagonal when some do: the same three
                    positions the confirm button itself uses. */}
                <DotCheckbox
                  checked={(() => {
                    const total = sectionKeys(question.tier).length;
                    const silenced = sectionTicked(question.tier);
                    return silenced === 0 ? true : silenced === total ? false : 'half';
                  })()}
                  fontSize={CONFIRM_SECTION_FONT_SIZE}
                />
                <span className="flex-1">{CONFIRM_LIST_SECTION[question.tier]}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleKey(question.key)}
              aria-pressed={!silenced}
              // Greyed rather than disabled: a question the
              // current mode never asks is still one that can
              // be answered ahead of time, and clearing it here
              // is what makes switching modes later do what was
              // already decided.
              className="w-full flex items-center gap-2 px-2 py-1 text-left hover:opacity-70 transition-opacity"
              style={{ fontSize: CONFIRM_LIST_FONT_SIZE, color: live ? 'var(--app-ink)' : '#6b7280' }}
              title={rowTitle(question.key, live)}
            >
              <DotCheckbox checked={!silenced} fontSize={CONFIRM_LIST_FONT_SIZE} />
              <span className="flex-1">{question.label}</span>
            </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

export default ConfirmList;
