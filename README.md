# dsh-armor-suite[破甲套件]

[English](./README.md) | [简体中文](./README.中文.md)

Keep a protected prompt on the model routes you approve — and make sure every other route never sees it.

**This is not a strength plugin.** It does not raise how often a model complies, it does not
reshuffle request shapes, and it does not normalise input — other projects do that, and this
one does not compete with them. It answers one question: *is my prompt visible to a model I
never approved it for, including the copy already sitting in the conversation history?*

**It is also not code armor.** Nothing here reviews or defends source code; for that, look
elsewhere (`dsh-ai-armor` is a different, unrelated tool).

A DeepSeek Harness (DSH) bundle: three plugins plus a ready-to-use armor prompt.

- **`armor-inject`** — puts the prompt into the system prompt, but only when the current request is routed to an approved provider/model. Everywhere else the section renders empty, so there is nothing to leak.
- **`armor-guard`** — cleans or refuses that content before any unapproved route can reach it: on the way into conversation history, and again just before a request is sent.
- **`armor/armor.md`** — a working example prompt. Replace it with your own. It also declines requests to repeat, list the sections of, or summarise itself.
- **`armor-retry`** — when a reply opens like a refusal it keeps the turn alive and asks again. It raises the compliance rate on refusals that are *stochastic* (a ransomware module: 2 of 3 runs without it, 3 of 4 with it) and does nothing for a request the model refuses categorically (1 of 4 either way — the model's own reasoning says the refusal is a line it will not cross). Resampling moves odds, not decisions.

---

## Why this exists

Some prompts are only safe on some models. A prompt that is fine on one provider can be
rejected — or worse, silently cost you account standing — on another that runs content
moderation. Mixing them up tends to be discovered the expensive way.

The awkward part is that a conversation's history is shared by every model that session
ever uses. Once protected text is in the history, it is there for good, and a later model
switch walks straight into it.

This bundle separates the two moments:

| Moment | Hook | What happens |
|---|---|---|
| Writing the prompt | `systemPrompt.section` | Rebuilt per request. Unapproved routes get an empty section, so the text never exists for them. |
| A tool result enters history | `tools/post-execute` | Shared with every future model. This is where the original is either kept (approved route) or cleaned (everyone else). |
| A request is about to be sent | `llm/stream` | Sees the complete request. The options object is frozen, so this layer can only refuse — never repair. |

The third layer is a last resort, not the mechanism. If it fires, protected content is
already in history and that turn cannot be sent.

## Install

```bash
dsh plugin --profile <profile> add github:seinan27/dsh-armor-suite#v1.2.7
```

Or from a local checkout, which is handier while editing:

```bash
git clone https://github.com/seinan27/dsh-armor-suite.git
dsh plugin --profile <profile> add /path/to/dsh-armor-suite
```

Restart DSH afterwards — plugin code is loaded at start.

**It is on the moment you restart.** With the shipped defaults, every request on the four
built-in DeepSeek routes gets the prompt added to its system prompt, and `armor-retry` is
enabled. Nothing else has to be configured for that to happen.

To look before you leap, point `routes` at something that matches nothing (for example a
single entry `none/none`) and set `armor-retry.enabled: false`. Note that an empty
`routes: []` means **the built-in defaults**, not "off" — an empty list falls back, it does
not disable.

## Configure

`cordis.patch.yml` in this package inserts both plugins. Override anything in your profile's
patch file; the two route lists must stay identical.

```yaml
- id: armor-inject
  config:
    file: ''            # empty = ./armor/armor.md of this package
    routes: []          # empty = built-in DeepSeek defaults
    order: -2000
    enabled: true       # false = render empty on every route
    markers:
      - begin: '<!-- armor:begin -->'
        end: '<!-- armor:end -->'

- id: armor-guard
  config:
    enabled: true       # false = all three hooks pass straight through
    routes: []          # same list as above
    markers:            # same pairs as above; several are allowed
      - begin: '<!-- armor:begin -->'
        end: '<!-- armor:end -->'
    signatures:         # plain strings, checked near the start of each segment
      - '<|im_start|>system:'
      - '# 破甲'
    onResidual: clean   # clean | block | warn
    replacement: '[content removed]'
    diagFile: ''        # empty = no dump

- id: armor-retry
  config:
    enabled: true
    maxAttempts: 2      # follow-ups per turn, 0..5; 0 turns it off
    nudge: ''           # empty = the built-in follow-up line
    exceptions: []      # regex sources that force "not a refusal"
```

`routes` entries are exact `provider/model` strings. Prefix matching is deliberately not
supported: a model whose name contains `deepseek` is not necessarily served by DeepSeek.

### The guard only sees what you declare

This is the single most important thing to understand about this bundle.

`armor-guard` matches **markers and signatures you list in the config**. It does not
detect "adversarial prompts in general" — that is an unsolved problem, and pretending
otherwise would be worse than the honest limitation.

```
Your prompt wrapped by armor-inject   →  markers present      →  cleaned on other routes
Your own prompt, no declared markers  →  invisible            →  passes through untouched
Somebody else's jailbreak             →  invisible            →  passes through untouched
```

So: **if you bring your own prompt, declare its markers or signatures.** Otherwise the
guard is doing nothing for you while looking like it is. The test suite pins this
behaviour down (`undeclared content is NOT detected`), so it cannot silently change.

### `onResidual`

```
clean   redact before the content enters history (default)
block   refuse to send the request at all
warn    log it and let it through — diagnostics only
```

`clean` is the default because refusing a request is a heavy outcome: the user loses that
turn. Use `block` when a leak is worse than a lost turn.

## How the decision is made

For injection, DSH assembles the system prompt with the step's model selection already
attached:

```js
assemble({ ...assembleContextFor(agent, signal), modelSelection: selection, toolSet })
```

and each dynamic section receives that assembly context:

```js
text: typeof section.text === 'function' ? section.text(context) : section.text
```

So the injector reads `context.modelSelection` and returns either the wrapped prompt or an
empty string. Nothing is decided after the fact.

For the guard, `exec.agent.model.current()` gives the route that produced a tool result,
so the same result can be kept for one model and cleaned for another.

## Verified, not just asserted

### The mechanism

An isolated `DSH_HOME` containing **this bundle only**, pointed at a local provider that
logs every outbound request. One switch: whether the model is on the approved list.

| | approved route | not approved |
|---|---|---|
| system prompt | 15,349 chars | 2,899 chars |
| `armor:begin` marker | present | absent |
| prompt body | present | **absent** |

The 12,450-character difference is the prompt itself. On a route that is not approved it
is never written into the request — it is not sent and then scrubbed.

### The effect

An isolated `DSH_HOME` containing **this bundle only**, on a real DeepSeek route, sent one
request that a stock model declines. Same key, same model, same wording, one variable.

| | this bundle | clean profile |
|---|---|---|
| response | followed the protected prompt | declined |
| reasoning | cites the prompt's own rules | refuses on its own grounds |

The prompt changes what the model does. That is the entire claim of this repository, and
it is now measured rather than assumed.

### Strength, and what it costs

A fixed battery: 10 categories, 2 runs each, single turn, text only, no tools. **18 of 20
runs answered with the content the prompt asked for**; the 2 that did not came back with a
reasoned alternative rather than a template.

That number was obtained with **zero changes to the host**. No prompt-assembly surgery, no
deleted facts, no rewritten host instructions, no section pushed above the host's own. The
bundle adds a section when the route is approved and removes it everywhere else; everything
the harness does normally, it still does.

That is the wager here: you do not have to take the harness apart to get a prompt obeyed.
It is not a claim that this always suffices — some requests need more than a well-written
prompt and this package will not pretend otherwise. But when it does suffice, the cost of
finding out is one config line, and the way back is the same line.

What that number is not:

- single turn — multi-turn drift is not measured here
- one model family — other providers moderate differently and read instructions differently
- 10 categories × 2 runs is enough to say "it works", not enough to put a decimal on it
- the prompts are not here, and will not be. Publishing a ready-made battery like this is a
  real liability, and not only for this repository — anyone who forks it carries the same
  exposure. The category count and the counts are what can be published; the prompts are
  yours to write

### Is it running?

Mount writes a snapshot to `$DSH_HOME/armor-suite-status.json` (default `~/.dsh/`):

```bash
cat "$DSH_HOME/armor-suite-status.json"
```

```json
{
  "armor-inject": { "enabled": true, "routes": ["…"], "promptChars": 12604, "file": "…" },
  "armor-guard":  { "enabled": true, "routes": ["…"], "markers": 1, "signatures": 2, "onResidual": "clean" },
  "armor-retry":  { "enabled": true, "maxAttempts": 2 }
}
```

The values are the settings **after** defaults resolve, which is the only version worth
printing — `routes: []` in your config means the built-in list, and the file shows which one
you actually got.

Why a file and not a log line: `ctx.logger?.info?.(…)` is optional-chained, so when that
service is not present the call silently does nothing, which looks exactly like having no
status output at all. The log line is still there; it is not the mechanism.

### The unit tests

```
node test/basic.mjs     47 checks, no framework, no network, no host
```

Covers: marker stripping (paired, lone, multiple pairs, custom pairs), signature fallback,
per-route behaviour, block/clean/warn modes, `additionalContexts` and `value` handling,
and — separately — that no input object is ever mutated.

## What is covered, and what is not

Covered:

- plain string content and text blocks, in tool results, messages and the request's `system`
- `additionalContexts` (a copy the host appends verbatim — when it carries protected text
  the result is blocked, because a decision cannot replace that copy)
- `decision.value` (re-rendered into the tool's visible output; protected object *keys*
  cause a block, since a key cannot be rewritten safely)

Not covered, on purpose:

- **anything without a declared marker or signature.** See the section above. Foreign
  prompts — someone else's jailbreak, a prompt you forgot to register — are invisible.
- **`armor/armor.md` on non-DeepSeek models.** The shipped prompt is tuned for DeepSeek
  model families (sentence shape, hard constraints, term list). On Claude/GPT/Gemini its
  behaviour is untested and may partially fail or overshoot. See `armor/README.md`.
- **image and other non-text blocks.** This bundle guards text markers. Text baked into an
  image is an OCR problem with a different answer.
- **content the user pastes.** That enters as a user message; `agent/pre-step` sees only
  the messages claimed for the current turn and its payload is frozen for the rest.
- **a model switch after protected text is already in history.** The original is in the
  shared history; the third layer will refuse that request rather than send it. The
  current DSH hooks offer no way to rewrite a complete request copy.
- **more than one armor file per instance.** One plugin instance reads one file. Merge
  several prompts into one file, or use separate profiles; two instances in the same
  process share one module-level config and would overwrite each other.

## Test

```bash
node test/basic.mjs     # 47 checks, no framework, no network
```

## License

MPL-2.0 — see [LICENSE](./LICENSE).

Not affiliated with or endorsed by DeepSeek. Use at your own judgement.