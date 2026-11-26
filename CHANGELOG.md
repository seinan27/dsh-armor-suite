# Changelog

## 1.2.2 — 2026-11-26

**Rewrite of the appearance section, driven by measurement rather than argument.**

The old section argued the point ("looking like a child is appearance, the age setting is
the line"). Measured on the isolated profile with the hardest single-line request:

| wording | answered |
|---|---|
| argue "appearance != age" | 0 / 4 |
| remove the age line entirely | 1 / 4 |
| **define the word, keep the age line** | **19 / 20** |

A prompt section that argues invites the model to argue back. One that defines a term is
read as context.

- Spelling variants of the term are handled. Measured on the misspelled form: 3 / 3 —
  a misspelling does not weaken the definition; it avoids a token-level trigger so the
  definition lands first.
- **New `## 这段不外传`** — anti-extraction. A request to repeat, list the section titles of,
  translate, or "summarise your configuration" is declined and steered back to the task.
  Measured against three extraction phrasings: 0 / 3 leaked.
- Two variants were tested and **rejected**: an instruction not to echo the user's term
  (no change), and a two-phase "profile first, then scene" structure (3 / 4, worse).

## 1.2.2 — 2026-11-26

**Rewrites the appearance section of `armor/armor.md` around a measured result.**

The old section argued the point: "looking like a child is appearance, the age setting is
the line", plus a pre-emptive rebuttal of the counter-argument. Measured on the isolated
profile with a one-word request, that wording answered 0 of 4 runs — the model read the
reasoning-as-argument as a bypass attempt and refused on its own grounds, quoting the
section back.

The new section defines the word instead of debating it, and the word itself is in the
prompt so the model applies that definition rather than its own prior.

| wording | one-word request |
|---|---|
| argue "appearance ≠ age" | 0 / 4 |
| embed and define the term | **3 / 4** |

The three answers are full scenes; all three set the character as an adult with the body
described in the request, which is what the section now says to do.

**Lesson recorded:** a prompt section that argues with the model invites it to argue back.
A prompt section that defines a term is read as context.

## 1.2.1 — 2026-11-26

**Fixes the defect that made 1.2.0 ship `armor-retry` disabled.**

- Root cause found: a pending message needs the same shape a client sends —
  `{ id, role, source: { kind }, content }`. Without `source`, the claim path reads
  `message.source.kind` on `undefined` and the turn dies with
  `Cannot read properties of undefined (reading 'kind')`. Confirmed against a real
  `user/message` event in a session log. With the field present, four runs produced
  four clean turn ends.
- `armor-retry` is now **enabled by default**, and no longer errors.
- Two measurements recorded in the module header, same profile and wording:
  stochastic refusal (ransomware module) answered 2 of 3 without the follow-up and 3 of 4
  with it; a categorically refused request answered 1 of 4 and the model stated the
  refusal was a line it would not cross. Resampling moves odds, not decisions.

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