import assert from 'node:assert/strict'
import test from 'node:test'
import { isBlock, sanitizeBlock } from './blocks.js'

test('sanitizeBlock cleans key items and drops empty ones', () => {
  const result = sanitizeBlock('key', {
    key: [
      { title: '  Заголовок  ', points: [' один ', '', 'два'] },
      { title: '', points: [] },
      { title: 'Без булетів' },
    ],
  })

  assert.deepEqual(result, {
    key: [
      { title: 'Заголовок', points: ['один', 'два'] },
      { title: 'Без булетів', points: [] },
    ],
  })
})

test('sanitizeBlock keeps examples of findings but drops invalid ad ids', () => {
  const result = sanitizeBlock('findings', {
    works: [
      {
        kind: 'text',
        title: 'Ок',
        points: ['x'],
        examples: [
          { platform: 'linkedin', ad_id: '12_a', metric: 'CTR 1%' },
          { platform: 'meta', ad_id: 'bad id!' },
        ],
      },
    ],
    fails: 'oops',
  })

  assert.deepEqual(result.works, [
    { kind: 'text', title: 'Ок', points: ['x'], examples: [{ platform: 'linkedin', ad_id: '12_a', metric: 'CTR 1%' }] },
  ])
  assert.deepEqual(result.fails, [])
})

test('sanitizeBlock keeps only known recommendation groups', () => {
  const result = sanitizeBlock('recs', {
    recs: { brief: [' a '], measure: [], evil: ['x'], repeat: 'not a list' },
  })

  assert.deepEqual(result, { recs: { brief: ['a'], measure: [] } })
})

test('sanitizeBlock rejects unknown blocks and empty content', () => {
  assert.equal(isBlock('key'), true)
  assert.equal(isBlock('nope'), false)
  assert.throws(() => sanitizeBlock('nope', {}))
  assert.throws(() => sanitizeBlock('key', null))
})
