# Service attendance: developer notes

Companion to `USER-GUIDE-service-attendance.md`. Covers where the logic lives,
the data model, and the rules that are easy to break.

## Map

| Concern | Code |
|---|---|
| Server functions (all guarded, `registration.read` / `registration.write`) | `src/server/functions/attendance.ts` |
| Public QR endpoints (no token: keyed by `qr_token`) | `getCheckinSession`, `getPublicSessionDisplay`, `publicCheckIn` |
| Name matching (pure) | `src/lib/nameMatch.ts` |
| Review queue ranking, duplicate-visitor archive rule (pure) | `src/lib/attendanceResolve.ts` |
| Jev suggestions (optional, server-only key) | `src/server/functions/_jevMatch.ts`, `src/lib/jevMatch.ts` |
| Session schedule: church date, overdue, automatic close | `src/lib/sessionSchedule.ts` |
| Prophetic words: library, picking | `src/lib/propheticWord.ts`, `src/content/propheticWords.json` |
| Prophetic import: parser (pure), browser file reader | `src/lib/propheticImport.ts`, `src/lib/propheticFileReader.ts` |
| Prophetic word sets: server, page, dropdown | `src/server/functions/propheticSets.ts` (+ `_propheticSetStore.ts`), `src/routes/admin/attendance/words.tsx`, `src/components/PropheticSetSelect.tsx` |
| Word list validation (shared) | `src/lib/propheticSchemas.ts` |
| Import templates (blank Excel and Word) | `public/templates/prophetic-words-template.{xlsx,docx}` |
| Story image (canvas, browser only) | `src/lib/storyImage.ts`, `src/components/StoryShare.tsx` |
| Admin pages | `src/routes/admin/attendance/{index,$sessionId,analytics}.tsx` |
| Public pages | `src/routes/checkin/$token.tsx`, `src/routes/display/$token.tsx` |

## Data model (public schema, RLS on, service-role only)

- `service_types`, `service_sessions`, `attendance_records`, `prophetic_word_sets`.
- `prophetic_word_sets` (2026-10-23): `title`, `service_type_id`, `service_date`,
  `words jsonb` (same shape as a session list), `is_archived`. The create dialog
  preselects the one set whose service type and date match (`matchingSet`; two
  matches preselect nothing). Picking a set copies its words onto the session
  and sets `service_sessions.prophetic_set_id` (display only). A direct edit or
  removal of the session list clears `prophetic_set_id`. Deleting a set keeps
  the session copies (FK `ON DELETE SET NULL`).
- `service_sessions`:
  - `opened_at`: set at creation and on every reopen. It restarts the
    automatic-close clock.
  - `prophetic_prompt text`: legacy sermon topic. Picks a built-in list. The
    create dialog no longer sets it; the session card shows it only when set.
  - `prophetic_words jsonb`: `{reference, translation, words: [{text, reference}]}`.
    A list imported for this service; it wins over the prompt. A word's own
    `reference` (verse lists) wins over the list `reference`, which may then be
    ''. `asWordList` also reads the first format, `words: string[]`.
- `attendance_records`:
  - `raw_name`, `raw_phone`, `raw_email`, `invited_by`.
  - `match_status`: `auto_matched | pending | confirmed | new_member | ignored`.
  - Unique index on `(session_id, member_id) where member_id is not null`.
- Migrations live in `supabase/YYYY-MM-DD_*.sql` with `_rollback.sql`. They are
  gitignored and applied with the Supabase MCP `apply_migration`.

## Matching rules

- **QR guest check-in**:
  - It auto-links only on a confident name match: exactly one member scores
    ≥ 0.9, or a unique phone matches.
  - An **email alone never auto-links**, because families share addresses. An
    email owned by a different member blocks the name auto-link and sends the
    check-in to review.
- **Review queue and Link member suggestions** (`getPendingMatches`):
  - Sources: the trigram RPC `search_members_similar`, same-surname members, and
    email owners.
  - At most 8. Ties prefer the typed first initial.
  - Jev re-ranks them and tags "Likely match" at ≥ 0.7.
- **Staff search suggestions** (`suggestMembersForCheckin`):
  - Shown when the plain name search finds fewer than 3 members.
  - Reasons: initials ("JC"), surname, similar spelling, exact email or phone.
- **Jev**:
  - On only when `TYPESAFE_API_KEY` is set on the server.
  - Only names are sent. 5 s timeout, cached per record.
  - Any failure returns nothing, so suggestions fall back to the rules alone.
- **Duplicate-visitor archive** (`confirmMatch` with `archiveDuplicate`) archives
  only a visitor created by that same check-in, with zero references across 14
  FK columns (including `discipleship.disciple_profiles`). Any unreadable count
  keeps the record.
- **Save email to member** needs `members.write`. It fills an empty email only.

## Session lifecycle

- **Overdue**: an open session whose date is before today, Asia/Manila
  (`isSessionOverdue`). QR check-in stops; manual check-in still works.
- **Automatic close**:
  - The rule lives in `public.close_stale_service_sessions(p_days)`, applied
    2026-10-16. A session closes once its date is more than 3 days past AND it
    was (re)opened more than 3 days ago. Both comparisons use Manila dates.
  - It runs nightly through **pg_cron** job `close-stale-service-sessions` at
    `5 16 * * *` UTC, which is 00:05 Manila.
  - `getSessions` also calls it, so the list stays current even if the job is
    paused.
  - `autoCloseDate()` in `sessionSchedule.ts` mirrors the SQL for the "Closes
    automatically on ..." notice. Keep the two in sync.
  - The function is `service_role` only: execute is revoked from PUBLIC, anon
    and authenticated.

## Prophetic word after QR check-in

- `publicCheckIn` picks a word in this order:
  1. `pickFromWordList(session.prophetic_words)`
  2. `pickPropheticWord(prompt, library)`
  3. No word.
- **Built-in library matching**: an exact topic match first, then keyword and
  topic-word hits. A Bible book name followed by a number is ignored ("Luke 15"
  must not pick the Luke 10 set).
- **Import** (`PropheticImportDialog`): the file is parsed in the browser.
  - PDF uses the **pdf.js legacy build**
    (`pdfjs-dist/legacy/build/pdf.mjs` plus the legacy worker as `?url`). The
    modern build needs `Uint8Array.prototype.toHex`, which many browsers lack.
  - Excel and CSV use SheetJS. Both libraries load through dynamic `import()`
    and never run on the server.
- **Parser heuristics**:
  - Reference is optional. Without one, the check-in screen and the story image
    show "Prophetic word" in its place.
  - PDF columns: `pdfItemsToText` splits lines at gaps over 24 pt
    (`SEGMENT_GAP`), then `findColumnSplit` looks for an empty vertical gutter
    (wide headings ignored). Left column first, then right; headings across the
    page first. A reference | text table (rows paired side by side, no numbered
    items on the right) stays in row order.
  - Word (.docx): `readDocx` unzips `word/document.xml` (fflate, dynamic import);
    `docxXmlToContent` (DOMParser) marks auto-numbered or bulleted paragraphs
    with "• ". Tables: rows go to `parsePropheticRows`, paragraphs only supply a
    reference. Old .doc: an error asks for .docx.
  - Template label rows: "Passage reference" and "Translation" with the value in
    the next cell; header cells such as "Reference (optional)" are skipped.
  - Verse lists: when 2+ lines start with "Book ch:v[-v] – text"
    (`VERSE_LINE`), each such line starts a word with its own reference; any
    other line continues it, capitals included. `splitVerse` also runs on every
    numbered item and spreadsheet row. Wrapping quote marks are dropped
    (`unquote`).
  - The heading becomes the reference.
  - Numbered lines and bullets become words; continuation lines are joined.
  - Without numbering, one word per line, joining sentence continuations.
  - Page numbers, repeats (same reference and text, any case), and lines under
    8 characters are dropped.
  - Limits: 200 words, 400 characters each.
  - Fixture: `src/tests/fixtures/prophetic-luke-10-pdf.txt` (text rebuilt from
    the real PDF).
- **Story image**:
  - 1080x1920 JPEG drawn on a canvas, in three designs.
  - Text stays inside y ≈ 290–1640, the Instagram story safe area. `fitText`
    also caps the text height (680 px, card 600 px), so a long verse shrinks
    instead of running into the caption and footer.
  - On the check-in page, the welcome and word fill the first screen
    (`min-h-svh`); the image section ("Save this word") starts below it.
  - `navigator.share({files})` only when `canShare` allows it; otherwise
    Download. Files are pre-rendered on mount, because Safari requires
    `share()` within the tap.
  - A website cannot open the Instagram story editor directly.
- **Font**: Source Serif 4 Variable (a plain book serif) is imported in
  `styles.css` via `@fontsource`. The woff2 files download only when used.

## Testing

- Unit tests: `npx vitest run`. All are expected to pass; a red suite means a
  real regression.
- E2E: build, then `PORT=3150 node --env-file=.env .output/server/index.mjs`.
  Port 3000 and 3100 are taken by other projects. Run Playwright with
  `E2E_BASE_URL=http://localhost:3150` and admin credentials.
  - `E2E_ALLOW_MEMBER_WRITES=1` runs the steps that create members. Delete
    `E2E Walkin %`, `E2E Resolve Target %` and `%E2eqzv%` afterwards.
  - `E2E_PROPHETIC_PDF=/path/to.pdf` also imports a real PDF. Keep church PDFs
    out of the repo.
  - `E2E_EXPECT_JEV=1` needs the server started with `TYPESAFE_API_KEY`.
- Playwright empties `test-results/` on every run. Keep screenshots meant for
  people elsewhere.
- Switching between branches with different dependencies: run
  `pnpm install --frozen-lockfile`.
