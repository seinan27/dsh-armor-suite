/**
 * Basic checks. No test framework, no network, no host — just the two pure entry points.
 *
 *   node test/basic.mjs
 *
 * Exit code 0 = all pass, 1 = at least one failed.
 */
import assert from 'node:assert/strict'

import {
  apply as applyInject,
  routeKey,
  resolveRoutes,
  BEGIN,
  END,
} from '../lib/inject.js'
import {
  apply as applyGuard,
  sanitizeText,
  sanitizeBlocks,
  sanitizeMessages,
  sanitizeJsonValue,
  scanRequest,
  currentRoute,
} from '../lib/guard.js'

let passed = 0
let failed = 0

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok    ${name}`)
  } catch (error) {
    failed++
    console.log(`  FAIL  ${name}`)
    console.log(`        ${error.message}`)
  }
}

const ROUTES = ['deepseek-official/deepseek-flash', 'deepseek-account/deepseek-v4-pro']
const WEAK_HEAD_CHARS = 200

/* ---------------------------------------------------------------- routing */

check('routeKey reads provider/model', () => {
  assert.equal(routeKey({ provider: 'a', model: 'b' }), 'a/b')
  assert.equal(routeKey(undefined), '/')
})

check('resolveRoutes accepts an explicit list', () => {
  const set = resolveRoutes(ROUTES)
  assert.equal(set.size, 2)
  assert.ok(set.has('deepseek-official/deepseek-flash'))
})

check('resolveRoutes falls back to defaults on empty input', () => {
  assert.ok(resolveRoutes([]).size > 0)
  assert.ok(resolveRoutes(undefined).size > 0)
  assert.ok(resolveRoutes('nonsense').size > 0)
})

/* ------------------------------------------------------------- injection */

check('inject returns the wrapped armor on an approved route', () => {
  const sections = []
  const ctx = { on: (event, fn) => (event === 'agent/created' ? fn({ agent: makeAgent(sections) }) : undefined) }
  applyInject(ctx, { routes: ROUTES })

  assert.equal(sections.length, 1)
  const body = sections[0].text({ modelSelection: { provider: 'deepseek-official', model: 'deepseek-flash' } })
  assert.ok(body.startsWith(BEGIN), 'should open with the marker')
  assert.ok(body.trimEnd().endsWith(END), 'should close with the marker')
  assert.ok(body.length > BEGIN.length + END.length, 'should contain the prompt body')
})

check('inject returns an empty string on any other route', () => {
  const sections = []
  const ctx = { on: (event, fn) => (event === 'agent/created' ? fn({ agent: makeAgent(sections) }) : undefined) }
  applyInject(ctx, { routes: ROUTES })

  const text = sections[0].text
  assert.equal(text({ modelSelection: { provider: 'packycode', model: 'claude-sonnet-5-5' } }), '')
  assert.equal(text({ modelSelection: { provider: 'openrouter', model: '~deepseek/x' } }), '')
  assert.equal(text({ modelSelection: undefined }), '')
  assert.equal(text(undefined), '')
})

check('inject tolerates a missing systemPrompt', () => {
  const ctx = { on: (event, fn) => (event === 'agent/created' ? fn({ agent: { ctx: {} } }) : undefined) }
  applyInject(ctx, { routes: ROUTES }) // must not throw
})

/* --------------------------------------------------------------- cleaning */

check('sanitizeText removes a matched pair', () => {
  const r = sanitizeText(`a ${BEGIN} secret ${END} b`)
  assert.ok(r.changed)
  assert.ok(!r.text.includes('secret'))
  assert.ok(r.text.includes('a '))
})

check('sanitizeText handles a lone opening marker', () => {
  const r = sanitizeText(`keep ${BEGIN} everything after is suspect`)
  assert.ok(r.changed)
  assert.ok(!r.text.includes('everything after'))
})

check('sanitizeText handles a lone closing marker', () => {
  const r = sanitizeText(`suspect up to here ${END} keep`)
  assert.ok(r.changed)
  assert.ok(r.text.endsWith('keep'))
})

check('sanitizeText cleans every pair, not just the first', () => {
  const r = sanitizeText(`${BEGIN}x${END} mid ${BEGIN}y${END} tail`)
  assert.ok(r.changed)
  assert.ok(!r.text.includes('x'))
  assert.ok(!r.text.includes('y'))
  assert.ok(r.text.includes('mid'))
})

check('sanitizeText catches a weak signature near the start', () => {
  const r = sanitizeText('<|im_start|>system: something')
  assert.ok(r.changed)
  assert.ok(!r.text.includes('im_start'))
})

check('sanitizeText leaves a weak signature deep in the text alone', () => {
  const text = `${'x'.repeat(WEAK_HEAD_CHARS + 50)} tail <|im_start|>system: mentioned in passing`
  const r = sanitizeText(text)
  assert.equal(r.changed, false)
})

check('sanitizeText leaves clean text untouched', () => {
  const r = sanitizeText('ordinary tool output, nothing special')
  assert.equal(r.changed, false)
})

check('sanitizeBlocks only touches text blocks', () => {
  const image = { type: 'image', attachment: { attachmentId: 'sha256:x' } }
  const r = sanitizeBlocks([{ type: 'text', text: `${BEGIN}secret${END}` }, image])
  assert.ok(r.changed)
  assert.equal(r.blocks[1], image, 'image block should be the same object')
})

check('sanitizeMessages rebuilds instead of mutating', () => {
  const original = [{ role: 'tool', content: [{ type: 'text', text: `${BEGIN}secret${END}` }] }]
  const r = sanitizeMessages(original)
  assert.ok(r.changed)
  assert.ok(original[0].content[0].text.includes(BEGIN), 'the input must stay untouched')
})

check('sanitizeMessages handles string content', () => {
  const r = sanitizeMessages([{ role: 'tool', content: `${BEGIN}secret${END}` }])
  assert.ok(r.changed)
})

check('sanitizeJsonValue rewrites strings and nested values', () => {
  const r = sanitizeJsonValue({ a: `${BEGIN}secret${END}`, b: [1, 2] })
  assert.ok(r.changed)
  assert.ok(!r.value.a.includes('secret'))
  assert.equal(r.unsafeKey, false)
})

check('sanitizeJsonValue flags protected object keys', () => {
  const r = sanitizeJsonValue({ [`${BEGIN}k${END}`]: 'v' })
  assert.equal(r.unsafeKey, true)
})

/* --------------------------------------------------------------- scanning */

check('scanRequest reports where the hit is', () => {
  const hits = scanRequest({
    system: 'clean',
    messages: [{ content: [{ type: 'text', text: `${BEGIN}secret${END}` }] }],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].where, 'message[0].content[0]')
})

check('scanRequest does not concatenate segments', () => {
  const hits = scanRequest({
    messages: [
      { content: [{ type: 'text', text: 'clean one' }] },
      { content: [{ type: 'text', text: '<|im_start|>system: bad' }] },
    ],
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0].where, 'message[1].content[0]')
})

check('scanRequest returns nothing for a clean request', () => {
  assert.deepEqual(scanRequest({ system: 'clean', messages: [{ content: 'hi' }] }), [])
})

check('currentRoute returns an empty string when it cannot tell', () => {
  assert.equal(currentRoute(undefined), '')
  assert.equal(currentRoute({}), '')
  assert.equal(currentRoute({ agent: { model: { current: () => null } } }), '')
  assert.equal(
    currentRoute({ agent: { model: { current: () => { throw new Error('nope') } } } }),
    '',
  )
  assert.equal(
    currentRoute({ agent: { model: { current: () => ({ provider: 'p', model: 'm' }) } } }),
    'p/m',
  )
})

/* ------------------------------------------------------------ guard wiring */

function makeAgent(sections) {
  return { ctx: { systemPrompt: { section: (s) => (sections.push(s), () => {}) } } }
}

function makeGuardCtx() {
  const handlers = new Map()
  const logs = []
  const ctx = {
    on: (event, fn) => handlers.set(event, fn),
    logger: { info: (l) => logs.push(l), warn: (l) => logs.push(l) },
  }
  return { ctx, handlers, logs }
}

check('guard keeps the original for an approved route', async () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES })

  const exec = { name: 't', agent: { model: { current: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }) } } }
  const decision = { kind: 'accept', content: [{ type: 'text', text: `${BEGIN}secret${END}` }] }
  const out = await handlers.get('tools/post-execute')(exec, {}, async () => decision)
  assert.equal(out, decision, 'approved routes get the untouched decision')
})

check('guard cleans the result for an unknown route', async () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES })

  const exec = { name: 't', agent: { model: { current: () => ({ provider: 'packycode', model: 'claude-sonnet-5-5' }) } } }
  const decision = { kind: 'accept', content: [{ type: 'text', text: `${BEGIN}secret${END}` }] }
  const out = await handlers.get('tools/post-execute')(exec, {}, async () => decision)
  assert.ok(out.content[0].text.includes('[content removed]') || !out.content[0].text.includes('secret'))
})

check('guard blocks instead of dropping protected additionalContexts', async () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES })

  const exec = { name: 't', agent: { model: { current: () => ({ provider: 'packycode', model: 'x' }) } } }
  const result = { additionalContexts: [{ role: 'user', content: `${BEGIN}secret${END}` }] }
  const out = await handlers.get('tools/post-execute')(exec, result, async () => ({ kind: 'accept' }))
  assert.equal(out.kind, 'block')
})

check('guard refuses the request in block mode', () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES, onResidual: 'block' })

  const options = { provider: 'packycode', model: 'x', messages: [{ content: `${BEGIN}secret${END}` }] }
  assert.throws(() => handlers.get('llm/stream')(options, () => 'sent'), /refusing route/)
})

check('guard lets it through in warn mode', () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES, onResidual: 'warn' })

  const options = { provider: 'packycode', model: 'x', messages: [{ content: `${BEGIN}secret${END}` }] }
  assert.equal(handlers.get('llm/stream')(options, () => 'sent'), 'sent')
})

check('guard passes a clean request straight through', () => {
  const { ctx, handlers } = makeGuardCtx()
  applyGuard(ctx, { routes: ROUTES })

  const options = { provider: 'packycode', model: 'x', messages: [{ content: 'hello' }] }
  assert.equal(handlers.get('llm/stream')(options, () => 'sent'), 'sent')
})

/* -------------------------------------------------------------------- done */

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
