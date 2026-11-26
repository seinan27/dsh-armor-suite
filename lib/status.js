/**
 * A snapshot of what armor-suite is actually doing, written at mount time.
 *
 * Why not ctx.logger: `ctx.logger?.info?.(…)` is optional-chained, so when that service is
 * not present the call silently does nothing — which looks exactly like having no status
 * output at all. Every plugin on this machine that needed to answer "did it load?" ended up
 * writing a file instead, and one of them says so in a comment. This follows that.
 *
 * Read it with:
 *   cat "$DSH_HOME/armor-suite-status.json"      # default: ~/.dsh/armor-suite-status.json
 *
 * The file holds one object keyed by plugin id, each with the settings that are actually in
 * effect after defaults are resolved — not the ones written in the config file.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const home =
  process.env.DSH_HOME && process.env.DSH_HOME.trim()
    ? process.env.DSH_HOME.trim()
    : path.join(homedir(), '.dsh')

export const STATUS_FILE = path.join(home, 'armor-suite-status.json')

export function note(plugin, info) {
  try {
    let all = {}
    try {
      const raw = readFileSync(STATUS_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') all = parsed
    } catch {
      all = {}
    }
    // Drop entries left by another process. Without this, a restart leaves the previous
    // run's settings in the file forever, and the file stops describing what is running now.
    for (const key of Object.keys(all)) {
      if (!all[key] || all[key].pid !== process.pid) delete all[key]
    }
    all[plugin] = { ...info, at: new Date().toISOString(), pid: process.pid }
    mkdirSync(path.dirname(STATUS_FILE), { recursive: true })
    writeFileSync(STATUS_FILE, `${JSON.stringify(all, null, 2)}\n`, 'utf8')
  } catch {
    /* status is a nicety; it must never stop a mount */
  }
}
