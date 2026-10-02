---
name: confirmation-question
description: Add, change or remove one of Write Timer's confirmation questions so that its dialog, its "Keep asking this" box, its row in the confirmations list and the mode rules all agree, and the tests that pin the list's size move with it. Use when a new action should ask first, when an existing question's wording, tier or key changes, or when a row in the confirmations list seems to do nothing.
---

# Confirmation questions

Every question has a **key**, and the key is three things at once: the dialog that asks, the
"Keep asking this" box in that dialog, and the question's row in the list the confirmations
button drops down. Ticked means it keeps asking. Clearing the box, or the row, writes the key into
`timerDontAskAgain`, and that silences the question until the row is ticked again or the site
is RESET. Everything lives in `client/src/components/timer/suppressions.ts`.

## The two kinds

**A `ConfirmDialog` question**, the usual kind, raised from `Timer.tsx`:

| Piece | Where |
|---|---|
| The question's shape | `DialogState` in `types.ts` (a new member, or a new `act` for full-mode questions) |
| Its title, description and action word | `getCopy()` in `ConfirmDialog.tsx`, or `FULL_ACTS` in `suppressions.ts` for a full-mode act |
| Its key | `dialogKey()` in `suppressions.ts`. The default is `dialog.type`; give a key per variant when the variants ask different things (`switch:${mode}`, `adjust:${state}`), so silencing one doesn't silence its siblings. |
| Whether it asks | `shouldAsk()`: mode `none` asks nothing, `half` skips the full-only questions, and a silenced key doesn't ask |
| Raising it | `askThenRun(dialog, run)` in `Timer.tsx`, answered by `handleDialogConfirm` and `handleDialogDismiss` |
| Its row | `HALF_QUESTIONS` (`[key, label]`) or `FULL_ACTS` (`label`), or `FULL_RULES` for a row that governs a rule rather than a dialog |

**A question a dialog asks inside itself.** The import/export dialog asks two, as steps of its
own rather than as `ConfirmDialog`s: `exportInvalid` and `discardTransfer`. Their keys are the
`TransferQuestion` type and their rows are in `HALF_QUESTIONS`. `Timer.tsx` hands the dialog
`asks(key)` (mode not `none`, and not silenced) and `onSilence(key)`, and the dialog draws its own
`KeepAsking` row, labelled from `QUESTIONS`. A third such question extends `TransferQuestion`
and needs nothing new in `Timer.tsx`.

## Procedure

1. **Is it the owner's call?** Whether an action asks at all, and in which tier, is the owner's
   decision (AGENTS.md, How to work here). **Half** is "confirm what matters" (losing a run,
   deleting, throwing away typing); **full** is "confirm everything". Record the decision.
2. **Add the row.** A row whose key no dialog produces is a checkbox that silences nothing, so
   check that `dialogKey()` really returns the key, or that the dialog really calls `asks(key)`.
   The row's label is what the "Keep asking this" box shows in brackets. Word it as the action
   being asked about, like the rows around it: *Delete a preset*, *Export JSON that fails its
   checks*.
3. **Never silence `clearCache`.** The site RESET is the one way to clear the list, so its
   `dialogKey` is `null`, and a dialog with a `null` key draws no box.
4. **`BULK_KEYS`** lists rows that a section heading's own box must not sweep up: the two questions
   about that box (`bulkSilence`, `bulkRestore`), which would otherwise silence themselves, and
   `hideWebsiteLink`, which is the link's switch rather than a question. A new row that is a
   switch, or that is about the list itself, belongs there.
5. **Update the pinned counts** in `tests/modes.test.mjs`. On 2 Oct 2026 the list is 56 rows:
   26 half and 30 full. A new half row moves four numbers:
   - *every question has a row* and *none greys every row*: the total;
   - *and it sits on the turn*: the half rows above the full heading;
   - *and leaves the three it must not touch alone*: the half rows minus the three `BULK_KEYS`.
   A full row moves the total and *half greys only the full rows* (30).
6. **Test the behaviour itself**: it asks, BACK or ESC backs out, the backquote key says yes,
   clearing the box silences it, and mode `none` doesn't ask. ConfirmDialog questions go in
   `tests/confirm.test.mjs`; the import/export dialog's go in `tests/transfer.test.mjs`
   (sections 6 and 7). A check that leaves a key silenced goes last in its suite.
7. **README**: the confirmations bullet, if the new question is one a user would look for.

## Removing a question

Remove its row, its copy and its `DialogState` member, and move the counts in
`tests/modes.test.mjs`. Browsers that silenced it keep the key in `timerDontAskAgain`, and
exported files carry it in `confirmations.dontAskAgain`. Both are harmless (the schema allows
any string there, and nothing asks it any more), so there's nothing to migrate.
