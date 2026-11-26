/**
 * armor-guard — protected content must not reach a route that is not allowed to see it.
 *
 * Two moments matter, and they are not the same moment:
 *
 *   A. before a tool result enters the conversation history
 *      History is shared by every model the session ever uses. Once protected text is in
 *      it, it is there for good. `tools/post-execute` is the only hook that can decide,
 *      per result, whether this route may keep the original.
 *
 *   B. right before a request is sent
 *      `llm/stream` sees the complete request. Its options object is frozen — it can be
 *      inspected, never rewritten — so this layer can only refuse, not repair. That is
 *      the correct last resort: refuse rather than leak.
 *
 * `agent/pre-step` is also used, but only as a top-up: its `decision.messages` holds the
 * messages claimed for this turn, not the whole history, so it cannot see older tool
 * results. Nothing here should rely on it for coverage.
 *
 * Non-text blocks (images) are out of scope on purpose: this plugin guards text markers,
 * and OCR of an image is a different problem with a different answer.
 */

export const name = 'armor-guard'

import fs from 'node:fs'
import path from 'node:path'

import { BEGIN, END, resolveRoutes } from './inject.js'

/* ------------------------------------------------------------------ signals */

/** Whole-block markers: a single side is enough — a truncated paste keeps only one. */
export const STRONG_MARKS = [BEGIN, END]

/** Weak signals: only looked for near the start of each text segment. */
export const WEAK_MARKS = ['<|im_start|>system:', '# 破甲']
export const WEAK_HEAD_CHARS = 200

export const KIND_STRONG = 'protected-marker'
export const KIND_WEAK = 'protected-signature'

/* --------------------------------------------------------------- configured */

// Set once per apply(); the sanitisers read from here. One plugin instance per profile,
// so a module-level record is enough and keeps the call sites readable.
let conf = {
  replacement: '[content removed]',
  onResidual: 'clean',
}

/* ----------------------------------------------------------------- cleaning */

/** Replace one text segment. Loops until stable so a second pair is not left behind. */
export function sanitizeText(text) {
  if (typeof text !== 'string' || !text) return { text, changed: false, kinds: [] }

  let out = text
  let changed = false
  const kinds = new Set()

  for (;;) {
    const before = out
    const a = out.indexOf(BEGIN)
    const b = out.indexOf(END)

    if (a >= 0 && b > a) {
      // Both sides present: replace the whole span, markers included.
      out = out.slice(0, a) + conf.replacement + out.slice(b + END.length)
      kinds.add(KIND_STRONG)
    } else if (a >= 0) {
      // Opening marker without a closing one: everything after it is untrustworthy.
      out = out.slice(0, a) + conf.replacement
      kinds.add(KIND_STRONG)
    } else if (b >= 0) {
      // Closing marker without an opening one: the leading part is a fragment.
      out = conf.replacement + out.slice(b + END.length)
      kinds.add(KIND_STRONG)
    }

    if (out === before) break
    changed = true
  }

  if (!out.includes(BEGIN) && !out.includes(END)) {
    const head = out.slice(0, WEAK_HEAD_CHARS)
    if (WEAK_MARKS.some((m) => head.includes(m))) {
      out = conf.replacement
      kinds.add(KIND_WEAK)
      changed = true
    }
  }

  return { text: out, changed, kinds: [...kinds] }
}

export function findStrongMark(text) {
  if (typeof text !== 'string' || !text) return ''
  for (const m of STRONG_MARKS) if (text.includes(m)) return m
  return ''
}

export function findWeakMark(text) {
  if (typeof text !== 'string' || !text) return ''
  const head = text.slice(0, WEAK_HEAD_CHARS)
  for (const m of WEAK_MARKS) if (head.includes(m)) return m
  return ''
}

/** Text blocks only; anything else is returned untouched. */
export function sanitizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return { blocks, changed: false, kinds: [] }

  let changed = false
  const kinds = new Set()

  const out = blocks.map((block) => {
    if (!block || typeof block !== 'object') return block
    if (block.type !== 'text' || typeof block.text !== 'string') return block
    const r = sanitizeText(block.text)
    if (!r.changed) return block
    changed = true
    for (const k of r.kinds) kinds.add(k)
    return { ...block, text: r.text }
  })

  return { blocks: changed ? out : blocks, changed, kinds: [...kinds] }
}

export function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') return { message, changed: false, kinds: [] }

  if (typeof message.content === 'string') {
    const r = sanitizeText(message.content)
    return r.changed
      ? { message: { ...message, content: r.text }, changed: true, kinds: r.kinds }
      : { message, changed: false, kinds: [] }
  }

  if (!Array.isArray(message.content)) return { message, changed: false, kinds: [] }

  const r = sanitizeBlocks(message.content)
  return r.changed
    ? { message: { ...message, content: r.blocks }, changed: true, kinds: r.kinds }
    : { message, changed: false, kinds: [] }
}

/** Sanitise a message array without mutating the originals. */
export function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return { messages, changed: false, kinds: [] }

  let changed = false
  const kinds = new Set()

  const out = messages.map((m) => {
    const r = sanitizeMessage(m)
    if (!r.changed) return r.message
    changed = true
    for (const k of r.kinds) kinds.add(k)
    return r.message
  })

  return { messages: changed ? out : messages, changed, kinds: [...kinds] }
}

/**
 * The host re-renders `decision.value` into the tool's output, so a marker hiding in a
 * value string would come back after cleaning. Object *keys* cannot be rewritten safely:
 * report them (`unsafeKey`) and let the caller block instead.
 */
export function sanitizeJsonValue(value) {
  if (typeof value === 'string') {
    const r = sanitizeText(value)
    return { value: r.text, changed: r.changed, kinds: r.kinds, unsafeKey: false }
  }

  if (Array.isArray(value)) {
    let changed = false
    let unsafeKey = false
    const kinds = new Set()
    const out = value.map((item) => {
      const r = sanitizeJsonValue(item)
      if (r.changed) changed = true
      if (r.unsafeKey) unsafeKey = true
      for (const k of r.kinds) kinds.add(k)
      return r.value
    })
    return { value: changed ? out : value, changed, kinds: [...kinds], unsafeKey }
  }

  if (value && typeof value === 'object') {
    let changed = false
    let unsafeKey = false
    const kinds = new Set()
    const entries = []
    for (const [key, item] of Object.entries(value)) {
      if (sanitizeText(key).changed) unsafeKey = true
      const r = sanitizeJsonValue(item)
      if (r.changed) changed = true
      if (r.unsafeKey) unsafeKey = true
      for (const k of r.kinds) kinds.add(k)
      entries.push([key, r.value])
    }
    return { value: changed ? Object.fromEntries(entries) : value, changed, kinds: [...kinds], unsafeKey }
  }

  return { value, changed: false, kinds: [], unsafeKey: false }
}

export function mergeKinds(...items) {
  return [...new Set(items.flatMap((item) => item?.kinds ?? []))]
}

/* --------------------------------------------------------------- inspection */

/** Scan the complete request, segment by segment. No concatenation, no silent cutoff. */
export function scanRequest(options) {
  const hits = []

  const check = (text, where) => {
    if (typeof text !== 'string' || !text) return
    if (findStrongMark(text)) hits.push({ kind: KIND_STRONG, where })
    else if (findWeakMark(text)) hits.push({ kind: KIND_WEAK, where })
  }

  check(options?.system, 'system')

  const messages = Array.isArray(options?.messages) ? options.messages : []
  messages.forEach((message, i) => {
    if (typeof message?.content === 'string') {
      check(message.content, `message[${i}]`)
      return
    }
    if (!Array.isArray(message?.content)) return
    message.content.forEach((part, j) => {
      if (!part || typeof part !== 'object' || typeof part.text !== 'string') return
      check(part.text, `message[${i}].content[${j}]`)
    })
  })

  return hits
}

/** Which provider/model produced this tool result. Empty string means "unknown". */
export function currentRoute(exec) {
  try {
    const current = exec?.agent?.model?.current?.()
    if (!current || typeof current !== 'object') return ''
    const provider = current.provider ?? current.config?.provider ?? ''
    const model = current.model ?? current.config?.model ?? ''
    return `${String(provider)}/${String(model)}`
  } catch {
    return ''
  }
}

/* --------------------------------------------------------------------- glue */

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}

  const routes = resolveRoutes(cfg.routes)
  const onResidual = ['clean', 'block', 'warn'].includes(cfg.onResidual) ? cfg.onResidual : 'clean'
  conf = {
    replacement: typeof cfg.replacement === 'string' && cfg.replacement.trim() ? cfg.replacement : '[content removed]',
    onResidual,
  }

  const log = (line) => {
    try {
      ctx?.logger?.info?.(`[armor-guard] ${line}`)
    } catch {
      /* logging must never break the turn */
    }
  }
  const warn = (line) => {
    try {
      ctx?.logger?.warn?.(`[armor-guard] ${line}`)
    } catch {
      /* same */
    }
  }

  const diagPath = typeof cfg.diagFile === 'string' && cfg.diagFile.trim() ? path.resolve(cfg.diagFile) : ''

  const dumpDiagnostics = (route, hits) => {
    if (!diagPath) return
    try {
      const payload = {
        at: new Date().toISOString(),
        route,
        count: hits.length,
        hits: hits.map((h) => ({ kind: h.kind, where: h.where })),
      }
      fs.mkdirSync(path.dirname(diagPath), { recursive: true })
      fs.writeFileSync(diagPath, JSON.stringify(payload, null, 2), 'utf8')
    } catch {
      /* diagnostics are best effort */
    }
  }

  /* ------------------------------------------------- A. before history */

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    if (!decision) return decision

    const route = currentRoute(exec)
    if (routes.has(route)) return decision // approved route: keep the original

    const toolName = String(exec?.name ?? '')
    const who = route || '(unknown route)'

    if (decision.kind === 'block') {
      const feedback = sanitizeBlocks(decision.feedback)
      const contexts = sanitizeMessages(decision.additionalContexts)
      if (!feedback.changed && !contexts.changed) return decision
      log(`${who} / ${toolName}: cleaned ${mergeKinds(feedback, contexts).join(',')} in block feedback`)
      return {
        ...decision,
        ...(feedback.changed ? { feedback: feedback.blocks } : {}),
        ...(contexts.changed ? { additionalContexts: contexts.messages } : {}),
      }
    }

    if (decision.kind !== 'accept') return decision

    const contexts = sanitizeMessages(decision.additionalContexts)
    const rawContexts = sanitizeMessages(result?.additionalContexts)

    // The host appends result.additionalContexts to the batch verbatim, and a decision
    // cannot replace that copy — so block, which makes the host drop it.
    if (rawContexts.changed) {
      log(`${who} / ${toolName}: blocked, protected content sat in additionalContexts`)
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: conf.replacement }],
        ...(contexts.messages?.length ? { additionalContexts: contexts.messages } : {}),
      }
    }

    const hasValue = Object.hasOwn(decision, 'value')
    const value = hasValue ? sanitizeJsonValue(decision.value) : null
    if (value?.unsafeKey) {
      log(`${who} / ${toolName}: blocked, protected content sat in a value key`)
      return {
        kind: 'block',
        feedback: [{ type: 'text', text: conf.replacement }],
        ...(contexts.messages?.length ? { additionalContexts: contexts.messages } : {}),
      }
    }

    const content = hasValue
      ? { blocks: undefined, changed: false, kinds: [] }
      : sanitizeBlocks(decision.content ?? result?.content)

    if (!content.changed && !value?.changed && !contexts.changed) return decision

    const updated = { ...decision }
    if (content.changed) updated.content = content.blocks
    if (value?.changed) updated.value = value.value
    if (contexts.changed) updated.additionalContexts = contexts.messages

    log(`${who} / ${toolName}: cleaned ${mergeKinds(content, value, contexts).join(',')} before history`)
    return updated
  })

  /* ------------------------------------------- B. top-up for new messages */

  ctx.on('agent/pre-step', async ({ modelSelection }, next) => {
    const decision = await next()
    if (!decision || decision.kind === 'reject') return decision

    const route = `${String(modelSelection?.provider ?? '')}/${String(modelSelection?.model ?? '')}`
    if (routes.has(route)) return decision

    const r = sanitizeMessages(decision.messages)
    if (!r.changed) return decision

    log(`${route || '(unknown route)'}: cleaned ${r.kinds.join(',')} in the request copy`)
    return { ...decision, messages: r.messages }
  })

  /* --------------------------------------------------- C. last resort */

  ctx.on('llm/stream', (options, next) => {
    const route = `${String(options?.provider ?? '')}/${String(options?.model ?? '')}`
    if (routes.has(route)) return next()

    const hits = scanRequest(options)
    if (hits.length === 0) return next()

    const who = route === '/' ? '(unknown route)' : route
    dumpDiagnostics(who, hits)

    if (conf.onResidual === 'warn') {
      warn(`${who}: ${hits.length} protected segment(s) reached the request (warn mode, letting it through)`)
      return next()
    }

    const where = hits.map((h) => h.where).slice(0, 3).join(', ')
    const message =
      `[armor-guard] refusing route=${who}: the request still carries protected content ` +
      `(${hits.length} segment(s), ${[...new Set(hits.map((h) => h.kind))].join('/')}, at ${where}). ` +
      `It is already part of the conversation history, so this turn cannot be sent.`
    warn(message)
    throw new Error(message)
  })
}
