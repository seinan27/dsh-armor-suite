# dsh-armor-suite（破甲套件）

[English](./README.md) | [简体中文](./README.中文.md)

Keep a protected prompt on the model routes you approve — and make sure every other route never sees it.

A DeepSeek Harness (DSH) bundle: two plugins plus a ready-to-use armor prompt.

- **`armor-inject`** — puts the prompt into the system prompt, but only when the current request is routed to an approved provider/model. Everywhere else the section renders empty, so there is nothing to leak.
- **`armor-guard`** — cleans or refuses that content before any unapproved route can reach it: on the way into conversation history, and again just before a request is sent.
- **`armor/armor.md`** — a working example prompt. Replace it with your own.

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
dsh plugin --profile <profile> add github:<owner>/dsh-armor-suite
```

Or from a local checkout, which is handier while editing:

```bash
git clone https://github.com/<owner>/dsh-armor-suite.git
dsh plugin --profile <profile> add /path/to/dsh-armor-suite
```

Restart DSH afterwards — plugin code is loaded at start.

## Configure

`cordis.patch.yml` in this package inserts both plugins. Override anything in your profile's
patch file; the two route lists must stay identical.

```yaml
- id: armor-inject
  config:
    file: ''            # empty = ./armor/armor.md of this package
    routes: []          # empty = built-in DeepSeek defaults
    order: -2000

- id: armor-guard
  config:
    routes: []          # same list as above
    onResidual: clean   # clean | block | warn
    replacement: '[content removed]'
    diagFile: ''        # empty = no dump
```

`routes` entries are exact `provider/model` strings. Prefix matching is deliberately not
supported: a model whose name contains `deepseek` is not necessarily served by DeepSeek.

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

## What is covered, and what is not

Covered:

- plain string content and text blocks, in tool results, messages and the request's `system`
- `additionalContexts` (a copy the host appends verbatim — when it carries protected text
  the result is blocked, because a decision cannot replace that copy)
- `decision.value` (re-rendered into the tool's visible output; protected object *keys*
  cause a block, since a key cannot be rewritten safely)

Not covered, on purpose:

- **image and other non-text blocks.** This bundle guards text markers. Text baked into an
  image is an OCR problem with a different answer.
- **content the user pastes.** That enters as a user message; `agent/pre-step` sees only
  the messages claimed for the current turn and its payload is frozen for the rest.
- **a model switch after protected text is already in history.** The original is in the
  shared history; the third layer will refuse that request rather than send it. The
  current DSH hooks offer no way to rewrite a complete request copy.

## Test

```bash
node test/basic.mjs     # 28 checks, no framework, no network
```

## License

MIT — see [LICENSE](./LICENSE).

Not affiliated with or endorsed by DeepSeek. Use at your own judgement.
