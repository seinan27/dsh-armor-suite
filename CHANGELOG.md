# Changelog

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