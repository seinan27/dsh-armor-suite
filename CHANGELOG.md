# Changelog

## 1.2.0 — 2026-11-26

- New `armor-retry` entry point: when a reply opens like a refusal, keep the turn alive
  and ask again. **Off by default** — read on.
- Measured: a stream-level retry is impossible on this host. The waterfall's `next` may be
  called once only (cordis `events.ts`), and a second call ends the turn with
  `next() called multiple times`. That is why the previous attempt at this feature sat
  disabled and never worked.
- The working mechanism is turn-level: `agent/turn-stopping` runs just before the loop
  decides to stop, and pushing one message into the next-step inbox makes it take another
  step. `agent.inject()` is that push.
- Result on the isolated profile: two of four runs turned a refusal into an answer.
- Known defect, and the reason it ships disabled: some of those turns end with
  `Cannot read properties of undefined (reading 'kind')`. Three candidate message shapes
  were tried and the error persisted, so the follow-up message is missing a field this
  code does not set. Until that is found, enabling it trades a visible refusal for a
  hidden turn error.
- Six new checks (39 → 45) cover the refusal detector and its configuration.

## 1.1.1 — 2026-11-26

- Sixteen more checks (33 → 37). Four of them assert that no input object is mutated:
  message, message array, and value tree; and that clean input comes back by reference.
- README now records what was measured rather than only what was asserted: an isolated
  home with this bundle alone, the system prompt with and without the route on the
  approved list, and the response with and without the bundle. No request content is
  reproduced.
- Pre-release checklist (13 items) all pass, including a fresh clone installed into an
  empty profile.

## 1.1.0 — 2026-11-26

- `markers` and `signatures` are configurable. Bring your own prompt and declare its
  markers instead of being limited to the built-in ones.
- Several marker pairs can be declared; all of them are stripped in one pass.
- New `armor/README.md` states what the shipped prompt is tuned for (DeepSeek families)
  and what to change when you bring your own.
- README states the real boundary plainly: the guard only sees what you declare. Foreign
  prompts without declared markers pass through untouched. Pinned by a test so it cannot
  silently change.

## 1.0.0 — 2026-11-26

First release.

- `armor-inject`: injects a protected prompt only on approved `provider/model` routes,
  decided from the assembly context at request time.
- `armor-guard`: cleans protected content before it enters conversation history, and
  refuses a request that still carries it. Handles block feedback, `additionalContexts`
  and `decision.value`.
- Ships `armor/armor.md` as a working example prompt.
- `onResidual` can be `clean`, `block` or `warn`.