# Changelog

## 1.2.6 — 2026-11-26

**Status you can actually read, and the guard gets the same switch.**

- A status snapshot at `$DSH_HOME/armor-suite-status.json` (default `~/.dsh/`), rewritten at
  mount. It holds the settings *after* defaults resolve — route list, prompt size in
  characters, marker and signature counts, `onResidual`, retry settings — not what the config
  file says.
  The reason it is a file and not a log line: `ctx.logger?.info?.(…)` is optional-chained, so
  when that service is absent the call does nothing and looks exactly like having no status
  output at all. Every plugin on this machine that needed to answer "did it load?" wrote a
  file for the same reason. The log line stays, as a bonus, not as the mechanism.
- `armor-guard` takes `enabled`, matching the other two. Set it to `false` and all three
  hooks pass straight through. Previously there was no configuration that could make the
  guard a no-op — `routes: []`, `markers: []` and `signatures: []` all fall back to the
  defaults — so "turn the whole bundle off for now" meant uninstalling it. The `llm/stream`
  hook is the one that can throw, so it is the one that most needed a way out.
- Test count is now 47 (two new: `armor-inject` renders empty when disabled, `armor-guard`
  passes all three hooks through when disabled). The README prints the number the test run
  actually reports.
## 1.2.5 — 2026-11-26

**Strength is now stated in the README, with its cost and its limits.**

- A fixed battery — 10 categories, 2 runs each, single turn, text only, no tools — answered
  18 of 20 runs with the requested content. Two declines, both with a reasoned alternative.
- The section says explicitly that the number was obtained with zero changes to the host:
  no assembly surgery, no deleted facts, no rewritten host instructions, no section pushed
  above the host's own.
- It also says what the number is not: single turn, one model family, too small a sample for
  a decimal, and the prompts live outside this repository.
- No comparison to other projects appears anywhere in the docs. Picking a metric that suits
  us and running it against numbers measured on someone else's private test set would not be
  evidence.

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

**New `armor-retry`, shipped off by default.**

- When a reply opens like a refusal, keep the turn alive and ask again.
- Off by default, because at this version neither path worked cleanly: a stream-level retry
  is impossible (the host's `next` may be called once only — a second call throws
  `next() called multiple times`), and the first turn-level attempt died with
  `Cannot read properties of undefined (reading 'kind')` because the injected message was
  missing `source`.
- Shipping it enabled would have meant shipping a crash. The next release fixes the shape
  and turns it on.

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
