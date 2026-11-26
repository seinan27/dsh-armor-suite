/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
/**
 * armor-inject — put the protected prompt in the system prompt, but only on approved routes.
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
 * The output is wrapped in <!-- armor:begin --> / <!-- armor:end --> so the guard side
 * can strip it by exact boundary instead of guessing where the text ends.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'armor-inject'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FILE = path.join(HERE, '..', 'armor', 'armor.md')

/** Routes allowed to receive the protected prompt. Keep in sync with the guard side. */
const DEFAULT_ROUTES = [
  'deepseek-official/deepseek-flash',
  'deepseek-official/deepseek-v4-pro',
  'deepseek-account/deepseek-flash',
  'deepseek-account/deepseek-v4-pro',
]

export const BEGIN = '<!-- armor:begin -->'
export const END = '<!-- armor:end -->'

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

export function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}

  const rawFile = cfg.file === undefined || cfg.file === null ? '' : String(cfg.file).trim()
  const file = rawFile ? path.resolve(rawFile) : DEFAULT_FILE
  const routes = resolveRoutes(cfg.routes)
  const order = Number.isFinite(cfg.order) ? Number(cfg.order) : -2000

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
    if (!routes.has(routeKey(context?.modelSelection))) return ''
    const body = readArmor()
    if (!body.trim()) return ''
    return `${BEGIN}\n${body}\n${END}`
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

  if (typeof ctx?.on === 'function') {
    ctx.on('agent/created', ({ agent }) => mount(agent))
  }
}
