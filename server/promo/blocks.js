// Team edits of the AI blocks on the Promo page. The content has the same shape as the matching
// part of an AI analysis result, so the frontend can lay an edit over the AI text as is:
//   key      -> { key: [{ title, points[] }] }
//   findings -> { works: [finding], fails: [finding] }   finding = { kind, title, points[], examples[] }
//   recs     -> { recs: { brief, scale_stop_retest, repeat, dont_repeat, measure } }

export const BLOCKS = ['key', 'findings', 'recs']

const AD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const REC_GROUPS = ['brief', 'scale_stop_retest', 'repeat', 'dont_repeat', 'measure']

const LIMITS = {
  items: 12,
  title: 200,
  point: 500,
  points: 10,
  examples: 4,
  metric: 120,
  rec: 600,
  recs: 12,
}

function trimText(value, max) {
  return String(value ?? '').trim().slice(0, max)
}

function cleanList(list, limit, max) {
  return Array.isArray(list) ? list.map((item) => trimText(item, max)).filter(Boolean).slice(0, limit) : []
}

function cleanKey(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      title: trimText(item?.title, LIMITS.title),
      points: cleanList(item?.points, LIMITS.points, LIMITS.point),
    }))
    .filter((item) => item.title || item.points.length)
    .slice(0, LIMITS.items)
}

function cleanExamples(list) {
  return (Array.isArray(list) ? list : [])
    .map((example) => ({
      platform: example?.platform === 'linkedin' ? 'linkedin' : 'meta',
      ad_id: String(example?.ad_id ?? ''),
      metric: trimText(example?.metric, LIMITS.metric),
    }))
    .filter((example) => AD_ID_PATTERN.test(example.ad_id))
    .slice(0, LIMITS.examples)
}

function cleanFindings(list) {
  return (Array.isArray(list) ? list : [])
    .map((item) => ({
      kind: item?.kind === 'text' ? 'text' : 'visual',
      title: trimText(item?.title, LIMITS.title),
      points: cleanList(item?.points, LIMITS.points, LIMITS.point),
      examples: cleanExamples(item?.examples),
    }))
    .filter((item) => item.title || item.points.length)
    .slice(0, LIMITS.items)
}

function cleanRecs(recs) {
  const source = recs && typeof recs === 'object' ? recs : {}
  const clean = {}

  for (const group of REC_GROUPS) {
    if (Array.isArray(source[group])) clean[group] = cleanList(source[group], LIMITS.recs, LIMITS.rec)
  }

  return clean
}

export function isBlock(block) {
  return BLOCKS.includes(block)
}

// Returns the cleaned content for a block, or throws an Error with a user-readable message.
export function sanitizeBlock(block, content) {
  if (!isBlock(block)) throw new Error('Невідомий блок.')
  if (!content || typeof content !== 'object' || Array.isArray(content)) throw new Error('Порожній вміст блоку.')

  if (block === 'key') return { key: cleanKey(content.key) }
  if (block === 'findings') return { works: cleanFindings(content.works), fails: cleanFindings(content.fails) }
  return { recs: cleanRecs(content.recs) }
}
