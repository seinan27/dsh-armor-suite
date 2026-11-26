/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * armor-inject — put a protected prompt in the system prompt, only on approved routes.
 *
 * Why this layer exists at all:
 *   The system prompt is rebuilt from scratch on every request (it is not stored in the
 *   conversation history), so this is the one place where "is this route allowed to see it"
 *   can be decided cleanly — the text simply is not there for everyone else.
 *
 * How the decision gets made:
 *   DSH assembles the prompt with the step's model selection already attached:
 *     assemble({ ...assembleContextFor(...), modelSelection: selection, toolSet })
 *   and each dynamic section receives that assembly context:
 *     text: typeof section.text === 'function' ? section.text(context) : section.text
 *   So `context.modelSelection` is available right here, before anything is sent.
 *
 * The output is wrapped in the configured marker pair so the guard side can strip it by
 * exact boundary instead of guessing where the text ends. Both plugins read the same
 * marker configuration — that is the contract between them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { note } from './status.js'

export const name = 'armor-inject'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FILE = path.join(HERE, '..', 'armor', 'armor.md')

/** Routes allowed to receive the protected prompt. Keep in sync with the guard side. */
export const DEFAULT_ROUTES = [
  'deepseek-official/deepseek-flash',
  'deepseek-official/deepseek-v4-pro',
  'deepseek-account/deepseek-flash',
  'deepseek-account/deepseek-v4-pro',
]

/**
 * The marker pair written around the protected text.
 *
 * It is not decoration: the guard side strips by this exact boundary, so a prompt that
 * reaches a non-approved route can be removed without guessing where it starts or ends.
 * Change it and both plugins must change together.
 */
export const DEFAULT_MARKERS = [{ begin: '<!-- armor:begin -->', end: '<!-- armor:end -->' }]

/**
 * Fallback signatures, used when a text segment carries protected content but lost its
 * markers along the way (a truncated paste, a partial copy). Only checked near the start
 * of each segment, because marker-like strings legitimately appear deeper in ordinary
 * prose (documentation about this plugin, for instance).
 */
export const DEFAULT_SIGNATURES = ['<|im_start|>system:', '# 破甲']

/** "provider/model" — the key both plugins compare against. */
export function routeKey(modelSelection) {
  const provider = modelSelection?.provider ?? modelSelection?.config?.provider ?? ''
  const model = modelSelection?.model ?? modelSelection?.config?.model ?? ''
  return `${String(provider)}/${String(model)}`
}

/**
 * Normalised options: an explicit non-empty list wins, otherwise the defaults.
 * @param {unknown} routes
 * @returns {Set<string>}
 */
export function resolveRoutes(routes) {
  if (Array.isArray(routes)) {
    const cleaned = routes.map((r) => String(r).trim()).filter(Boolean)
    if (cleaned.length > 0) return new Set(cleaned)
  }
  return new Set(DEFAULT_ROUTES)
}

/**
 * Normalised marker pairs. Accepts `[{ begin, end }]`; entries missing a side are dropped.
 * An empty list means "use the defaults", never "no markers".
 * @param {unknown} markers
 * @returns {{begin: string, end: string}[]}
 */
export function resolveMarkers(markers) {
  if (Array.isArray(markers)) {
    const cleaned = markers
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({ begin: String(m.begin ?? '').trim(), end: String(m.end ?? '').trim() }))
      .filter((m) => m.begin && m.end && m.begin !== m.end)
    if (cleaned.length > 0) return cleaned
  }
  return DEFAULT_MARKERS.map((m) => ({ ...m }))
}

/**
 * Normalised fallback signatures. Empty strings dropped; an empty list means the defaults.
 * @param {unknown} signatures
 * @returns {string[]}
 */
export function resolveSignatures(signatures) {
  if (Array.isArray(signatures)) {
    const cleaned = signatures.map((s) => String(s).trim()).filter(Boolean)
    if (cleaned.length > 0) return cleaned
  }
  return [...DEFAULT_SIGNATURES]
}

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}

  const rawFile = cfg.file === undefined || cfg.file === null ? '' : String(cfg.file).trim()
  const file = rawFile ? path.resolve(rawFile) : DEFAULT_FILE
  const routes = resolveRoutes(cfg.routes)
  const order = Number.isFinite(cfg.order) ? Number(cfg.order) : -2000
  const markers = resolveMarkers(cfg.markers)
  const wrap = markers[0]
  // `enabled: false` makes the section render as an empty string on every route, which is
  // the same path an unapproved route already takes — so switching it off leaves nothing
  // behind rather than a disabled plugin that still contributes text.
  const enabled = cfg.enabled === undefined ? true : Boolean(cfg.enabled)

  // Re-read when the file changes; keeps edits live without a restart.
  let cache = { mtimeMs: -1, size: -1, body: '' }
  const readArmor = () => {
    try {
      const st = fs.statSync(file)
      if (st.mtimeMs === cache.mtimeMs && st.size === cache.size) return cache.body
      const body = fs.readFileSync(file, 'utf8')
      cache = { mtimeMs: st.mtimeMs, size: st.size, body }
      return body
    } catch {
      return ''
    }
  }

  /** The dynamic section body: empty string for every route that is not approved. */
  const textFn = (context) => {
    if (!enabled) return ''
    if (!routes.has(routeKey(context?.modelSelection))) return ''
    const body = readArmor()
    if (!body.trim()) return ''
    return `${wrap.begin}\n${body}\n${wrap.end}`
  }

  const mount = (agent) => {
    const systemPrompt = agent?.ctx?.systemPrompt
    if (!systemPrompt || typeof systemPrompt.section !== 'function') return
    try {
      systemPrompt.section({ name: 'armor', order, text: textFn })
    } catch {
      /* A failed mount must not take the turn down; the guard side still protects. */
    }
  }

  // One line at mount answers "did it load, and with what" without a status tool.
  const status = (() => {
    let chars = 0
    try {
      chars = readArmor().length
    } catch {
      chars = 0
    }
    return { enabled, routes: [...routes], promptChars: chars, file }
  })()
  note('armor-inject', status)

  try {
    const body = readArmor()
    ctx?.logger?.info?.(
      `[armor-inject] ${enabled ? 'on' : 'off'} · routes=${routes.size} · prompt=${body.length} chars · file=${file}`,
    )
  } catch {
    /* a log line must never stop the plugin from mounting */
  }

  if (typeof ctx?.on === 'function') {
    ctx.on('agent/created', ({ agent }) => mount(agent))
  }
}
