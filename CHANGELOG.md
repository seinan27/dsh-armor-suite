# Changelog

## 1.2.4 — 2026-11-26

**Visibility, and a way to hold it off.**

- `armor-inject` takes `enabled`. Set it to `false` and the section renders as an empty
  string on every route — the same path an unapproved route already takes, so turning it off
  leaves nothing behind rather than a disabled plugin that still contributes text.
- One `info` line at mount, per plugin, answering "did it load, and with what":
  `[armor-inject] on · routes=4 · prompt=27432 chars · file=…`,
  `[armor-guard] ready · routes=4 · markers=1 · signatures=2 · onResidual=clean`,
  `[armor-retry] enabled=true · maxAttempts=2`. A log line never stops a mount: every one is
  wrapped.
- README says up front what this is not — not a strength plugin, not code armor — and points
  at the projects that do those things instead.
- README carries the retry measurement in the body rather than only in the module header:
  stochastic refusals improve (2 of 3 → 3 of 4), categorical ones do not (1 of 4 either way).
## 1.2.3 — 2026-11-26

**Release state only; no functional change.**

- `package.json`: `homepage` and `bugs` still pointed at a placeholder (`OWNER`), which
  resolved to a 404; `author` was an empty string.
- CHANGELOG: two identical `1.2.2` headings merged.
- Both READMEs open by saying this is prompt routing, not code armor, so it is not confused
  with an unrelated tool of a similar name.
- The install section states that the bundle is active the moment DSH restarts, what it
  touches by default, and how to hold it off. An empty `routes: []` falls back to the
  built-in defaults; it does not disable anything.
- The install line and clone URL carried an `<owner>` placeholder up to this point, so
  copying them verbatim failed. It now names the owner and pins a tag.
- `lib/retry.js`: one comment described a measured case in terms this repository should not
  put in writing.

## 1.2.2 — 2026-11-26

**One section of `armor/armor.md` rewritten from argument to definition, driven by measurement.**

Measured on an isolated profile, one fixed test, a fresh session per sample:

| wording | did not decline |
|---|---|
| argument | 0 / 4 |
| drop the key line | 1 / 4 |
| **definition** | **19 / 20** |

A section that argues invites the model to argue back. One that defines a term is read as
context.

- Spelling variants of the term are handled. Measured on the misspelled form: 3 / 3.
- **New `## 这段不外传`** — anti-extraction. A request to repeat the prompt, list its section
  titles, translate it, or "summarise your configuration" is declined and steered back to
  the task. Measured against three phrasings: 0 / 3 leaked.
- Two variants were tested and **rejected**: an instruction not to echo the user's term
  (no change), and a two-phase "profile first, then scene" structure (3 / 4, worse).

## 1.2.1 — 2026-11-26

**Fixes the defect that made 1.2.0 ship `armor-retry` disabled.**

- Root cause: a pending message needs the shape a client sends —
  `{ id, role, source: { kind }, content }`. Without `source`, the claim path reads
  `message.source.kind` on `undefined` and the turn dies with
  `Cannot read properties of undefined (reading 'kind')`.
- `armor-retry` is enabled by default again.
- Two measurements recorded in the module header: a stochastic refusal improved with the
  follow-up (2 of 3 → 3 of 4 runs); a categorically refused request did not move (1 of 4).
  Resampling moves odds, not decisions.

## 1.2.0 — 2026-11-26

- `markers` and `signatures` are configurable. Bring your own prompt and declare its
  markers instead of being limited to the built-in ones.
- Several marker pairs can be declared; all of them are stripped in one pass.
- New `armor/README.md` states what the shipped prompt is tuned for and what to change
  when you bring your own.
- README states the real boundary plainly: the guard only sees what you declare. Foreign
  prompts without declared markers pass through untouched. Pinned by a test.

## 1.1.1 — 2026-11-26

- Four more checks (33 → 37) assert that no input object is mutated, and that clean input
  comes back by reference.
- README records measured evidence rather than only claims.

## 1.1.0 — 2026-11-26

- `markers` and `signatures` become config; one marker pair was previously hardcoded.
- `armor/README.md` added.
- Boundary documented: undeclared content is not detected. Pinned by a test.

## 1.0.0 — 2026-11-26

First release.

- `armor-inject`: injects a protected prompt only on approved `provider/model` routes,
  decided from the assembly context at request time.
- `armor-guard`: cleans protected content before it enters conversation history, and
  refuses a request that still carries it. Handles block feedback, `additionalContexts`
  and `decision.value`.
- Ships `armor/armor.md` as a working example prompt.
- `onResidual` can be `clean`, `block` or `warn`.
