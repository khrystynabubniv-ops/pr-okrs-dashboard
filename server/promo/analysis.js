// AI analysis "Що працює / що ні". Runs on the backend and is stored in promo_analyses;
// the frontend only reads the saved result.

import {
  analysisInputHash,
  buildCampaigns,
  CAMPAIGN_TYPES,
  formatMoney,
} from './calc.js'

const MAX_IMAGES = 8
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const ALLOWED_IMAGE_HOST = /(^|\.)(fbcdn\.net|facebook\.com|fbsbx\.com|cdninstagram\.com|licdn\.com)$/i
const UTM_MEASURE_TIP =
  'Додавати в посилання кожного оголошення utm_content з назвою оголошення — тоді заявки в Ashby можна буде рахувати по креативах, а не лише по кампанії.'

const SYSTEM_PROMPT = [
  'Ти senior performance/creative аналітик в employer branding команді. Пиши українською, конкретно, з цифрами, без води і загальних порад.',
  'Критичне правило: усі числа вже пораховані кодом у JSON. Не рахуй і не вигадуй нові числа, використовуй лише ті, що є у вхідних даних.',
  'Аналізуй і візуал (прев\'ю додані як зображення, підписані ad_id), і текст оголошення. Стиль висновків: «Реальна людина в дії + чекліст "Ти наш кандидат, якщо"», «Студійний портрет без контексту — CTR 1.7% проти 15.7%», «AI лише для сцен, обличчя — реалістичні».',
  'У прикладах використовуй ТІЛЬКИ пари platform + ad_id зі вхідних даних (platform: meta або linkedin). Креативи є з двох платформ: Meta Ads і LinkedIn. Якщо є обидві, порівнюй їх (вартість кліку, CTR, які ролі де працюють), але не вигадуй причин, яких немає в даних.',
  'Поверни тільки валідний JSON без markdown і code fence за схемою:',
  '{"key":[{"title":"...","text":"..."}],"works":[{"kind":"visual|text","title":"...","examples":[{"platform":"meta|linkedin","ad_id":"..."}],"conclusion":"..."}],"fails":[{"kind":"visual|text","title":"...","examples":[{"platform":"meta|linkedin","ad_id":"..."}],"conclusion":"..."}],"recs":{"brief":["..."],"scale_stop_retest":["..."],"measure":["..."]}}',
  'key: 3–5 пунктів (якщо даних мало — менше). works і fails: до 4 кожен, у кожному 1–2 приклади. recs.brief — що закладати в ТЗ; recs.scale_stop_retest — що масштабувати, зупинити, перетестувати; recs.measure — як міряти далі.',
  'Для типів «Підписники» і «Awareness», де даних мало, замість brief/scale_stop_retest можна дати recs.repeat («Повторюємо») і recs.dont_repeat («Не повторюємо»), recs.measure залиш.',
  'Креативи однієї вакансії можуть бути розділені на A/B-тести (поле ab_test_group: З CV / Без CV, General / Lookalike): порівнюй групи між собою, а лідерів і слабких визнач усередині групи.',
  'Якщо даних замало для висновку — чесно скажи про це, а не вигадуй.',
].join('\n')

function trimText(value, max) {
  return String(value || '').trim().slice(0, max)
}

function aiInput(campaigns, currency) {
  return campaigns.map((campaign) => ({
    platform: campaign.platform || 'meta',
    campaign: campaign.title,
    full_name: campaign.name,
    type: CAMPAIGN_TYPES[campaign.type].label,
    spend: Number(campaign.spend.toFixed(2)),
    link_clicks: campaign.clicks,
    ctr_pct: Number(campaign.ctr.toFixed(2)),
    cost_per_click: Number(campaign.cpc.toFixed(2)),
    ...(campaign.follows ? { followers: campaign.follows, cost_per_follower: Number(campaign.cpf.toFixed(2)) } : {}),
    currency,
    creatives: campaign.creatives.map((item) => ({
      platform: item.platform || 'meta',
      ad_id: item.adId,
      ...(item.testLabel ? { ab_test_group: item.testLabel } : {}),
      name: item.name,
      format: item.creative?.kind || 'photo',
      ad_text: trimText([item.creative?.title, item.creative?.body].filter(Boolean).join('\n'), 1200),
      label: item.label || null,
      budget_share_pct: Math.round(item.sharePct),
      spend: Number(item.spend.toFixed(2)),
      impressions: item.impressions,
      link_clicks: item.clicks,
      ctr_pct: Number(item.ctr.toFixed(2)),
      cost_per_click: Number(item.cpc.toFixed(2)),
      ...(item.follows ? { followers: item.follows } : {}),
      ...(item.hookRate !== null ? { hook_rate_pct: Number(item.hookRate.toFixed(1)) } : {}),
      ...(item.holdRate !== null ? { hold_rate_pct: Number(item.holdRate.toFixed(1)) } : {}),
    })),
  }))
}

async function downloadImage(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !ALLOWED_IMAGE_HOST.test(parsed.hostname)) return null

    const response = await fetch(parsed, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) return null

    const mediaType = (response.headers.get('content-type') || '').split(';')[0].trim()
    if (!/^image\/(jpeg|png|webp|gif)$/.test(mediaType)) return null

    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) return null

    return { mediaType, base64: buffer.toString('base64') }
  } catch {
    return null
  }
}

// Leaders and weak creatives are the ones whose visuals the model needs to see.
async function collectImages(campaigns) {
  const picked = campaigns
    .flatMap((campaign) => campaign.creatives)
    .filter((item) => (item.label === 'leader' || item.label === 'weak') && item.creative?.thumbnailUrl)
    .slice(0, MAX_IMAGES)
  const images = []
  const captions = []

  for (const item of picked) {
    const image = await downloadImage(item.creative.thumbnailUrl)
    if (!image) continue
    images.push(image)
    captions.push(
      `Зображення ${images.length}: platform ${item.platform || 'meta'}, ad_id ${item.adId} (${item.label})`,
    )
  }

  return { images, captions }
}

function exampleMetric(creative) {
  const ctr = `CTR ${creative.ctr.toFixed(1)}%`
  return creative.follows
    ? `${ctr} · ${creative.follows} підп.`
    : `${ctr} · ${creative.cpc ? `${creative.cpc.toFixed(2)}/клік` : 'без кліків'}`
}

function cleanList(value, limit = 6) {
  return Array.isArray(value)
    ? value.map((item) => trimText(item, 400)).filter(Boolean).slice(0, limit)
    : []
}

// Strict validation: unknown ad_ids are dropped and metrics are replaced with code-computed ones.
export function validateAnalysis(raw, campaigns) {
  if (!raw || typeof raw !== 'object') throw new Error('empty')

  const creativesById = new Map(
    campaigns.flatMap((campaign) =>
      campaign.creatives.map((item) => [
        `${item.platform || 'meta'}:${item.adId}`,
        { ...item, campaignTitle: campaign.title },
      ]),
    ),
  )

  const key = (Array.isArray(raw.key) ? raw.key : [])
    .map((item) => ({ title: trimText(item?.title, 160), text: trimText(item?.text, 600) }))
    .filter((item) => item.title && item.text)
    .slice(0, 5)

  const findings = (list) =>
    (Array.isArray(list) ? list : [])
      .map((item) => ({
        kind: item?.kind === 'text' ? 'text' : 'visual',
        title: trimText(item?.title, 160),
        conclusion: trimText(item?.conclusion, 600),
        examples: (Array.isArray(item?.examples) ? item.examples : [])
          .map((example) => ({
            platform: example?.platform === 'linkedin' ? 'linkedin' : 'meta',
            adId: String(example?.ad_id ?? ''),
          }))
          .filter(
            (example, index, all) =>
              creativesById.has(`${example.platform}:${example.adId}`) &&
              all.findIndex((other) => other.platform === example.platform && other.adId === example.adId) === index,
          )
          .slice(0, 2)
          .map((example) => ({
            platform: example.platform,
            ad_id: example.adId,
            metric: exampleMetric(creativesById.get(`${example.platform}:${example.adId}`)),
          })),
      }))
      .filter((item) => item.title && item.conclusion && item.examples.length)
      .slice(0, 4)

  const works = findings(raw.works)
  const fails = findings(raw.fails)

  if (!key.length && !works.length && !fails.length) throw new Error('no findings')

  const recs = {
    brief: cleanList(raw.recs?.brief),
    scale_stop_retest: cleanList(raw.recs?.scale_stop_retest),
    measure: cleanList(raw.recs?.measure),
  }
  const repeat = cleanList(raw.recs?.repeat)
  const dontRepeat = cleanList(raw.recs?.dont_repeat)
  if (repeat.length || dontRepeat.length) {
    recs.repeat = repeat
    recs.dont_repeat = dontRepeat
  }
  if (!recs.measure.some((tip) => /utm_content/i.test(tip))) recs.measure.push(UTM_MEASURE_TIP)

  return { key, works, fails, recs }
}

export function createPromoAnalysis({ store, generateJsonViaAi, isAiConfigured, createHttpError }) {
  const running = new Map()

  async function getAnalysis(monthKey, type, snapshot) {
    const latest = await store.getLatestAnalysis(monthKey, type)
    if (!latest) return null

    const campaigns = snapshot ? buildCampaigns(snapshot, type) : []
    return {
      ...latest,
      outdated: snapshot ? latest.inputHash !== analysisInputHash(campaigns) : false,
    }
  }

  async function execute({ monthKey, type, snapshot, userId }) {
    const campaigns = buildCampaigns(snapshot, type)
    if (!campaigns.length) {
      throw createHttpError(400, 'Для цього типу кампаній за обраний місяць немає даних для аналізу.')
    }

    const inputHash = analysisInputHash(campaigns)
    const { images, captions } = await collectImages(campaigns)
    const text = [
      `Місяць: ${monthKey}. Тип кампаній: ${type === 'all' ? 'усі' : CAMPAIGN_TYPES[type].label}. Валюта: ${snapshot.currency || 'USD'} (${formatMoney(1, snapshot.currency || 'USD')}).`,
      captions.length ? `Підписи до доданих зображень:\n${captions.join('\n')}` : 'Зображень немає: аналізуй тільки тексти й метрики.',
      `Дані, пораховані кодом:\n${JSON.stringify(aiInput(campaigns, snapshot.currency || 'USD'), null, 2)}`,
    ].join('\n\n')

    let lastError = null
    let model = ''

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const output = await generateJsonViaAi({ system: SYSTEM_PROMPT, text, images, maxTokens: 3500 })
        model = output.model
        const result = validateAnalysis(output.json, campaigns)
        return store.insertAnalysis({ monthKey, type, userId, model, inputHash, result, status: 'ok' })
      } catch (error) {
        lastError = error
        // Missing key / provider outage will not fix itself on retry.
        if (error?.status === 503) break
      }
    }

    if (lastError?.status === 503) throw lastError

    await store.insertAnalysis({
      monthKey,
      type,
      userId,
      model,
      inputHash,
      result: { error: 'AI повернув невалідну відповідь' },
      status: 'failed',
    })
    throw createHttpError(502, 'Не вдалося отримати валідний AI-аналіз. Спробуйте перезапустити пізніше.')
  }

  function runAnalysis(args) {
    const id = `${args.monthKey}:${args.type}`
    if (running.has(id)) return running.get(id)

    const promise = execute(args).finally(() => running.delete(id))
    running.set(id, promise)
    return promise
  }

  // After a sync: analyse every type that has data and a new/changed input hash.
  async function runMissingAnalyses({ monthKey, snapshot }) {
    if (!isAiConfigured()) return

    for (const type of ['all', 'vac', 'subs', 'aw']) {
      try {
        const campaigns = buildCampaigns(snapshot, type)
        if (!campaigns.length) continue

        const latest = await store.getLatestAnalysis(monthKey, type)
        if (latest && latest.inputHash === analysisInputHash(campaigns)) continue // fresh, or failed: wait for manual rerun

        await runAnalysis({ monthKey, type, snapshot, userId: null })
      } catch (error) {
        console.error(`Promo analysis failed for ${monthKey}/${type}:`, error.message)
      }
    }
  }

  return {
    getAnalysis,
    runAnalysis,
    runMissingAnalyses,
    isRunning: (monthKey, type) => running.has(`${monthKey}:${type}`),
  }
}
