// Postgres access for Promo Results (tables are created by migration 004_promo.sql).

import { isDatabaseConfigured, query } from '../db/index.js'

function requireDatabase(createHttpError) {
  if (!isDatabaseConfigured()) {
    throw createHttpError(
      503,
      'Для сторінки «Промо» потрібен DATABASE_URL: у БД зберігаються snapshot Meta, AI-аналіз і коментарі.',
    )
  }
}

export function createPromoStore({ createHttpError }) {
  const ready = () => requireDatabase(createHttpError)

  return {
    async getSnapshot(monthKey) {
      ready()
      const result = await query(
        `select to_char(month, 'YYYY-MM') as month, fetched_at, payload
         from promo_snapshots where month = $1::date`,
        [`${monthKey}-01`],
      )
      const row = result.rows[0]
      if (!row) return null

      return {
        ...row.payload,
        month: row.month,
        fetchedAt: new Date(row.fetched_at).toISOString(),
      }
    },

    async saveSnapshot(monthKey, payload) {
      ready()
      const result = await query(
        `insert into promo_snapshots (month, fetched_at, payload)
         values ($1::date, now(), $2)
         on conflict (month)
         do update set fetched_at = now(), payload = excluded.payload
         returning fetched_at`,
        [`${monthKey}-01`, JSON.stringify(payload)],
      )

      return { ...payload, month: monthKey, fetchedAt: new Date(result.rows[0].fetched_at).toISOString() }
    },

    async getLatestAnalysis(monthKey, type) {
      ready()
      const result = await query(
        `select to_char(month, 'YYYY-MM') as month, type, created_at, model, input_hash, result, status
         from promo_analyses
         where month = $1::date and type = $2
         order by created_at desc
         limit 1`,
        [`${monthKey}-01`, type],
      )
      const row = result.rows[0]
      if (!row) return null

      return {
        month: row.month,
        type: row.type,
        createdAt: new Date(row.created_at).toISOString(),
        model: row.model,
        inputHash: row.input_hash,
        result: row.result,
        status: row.status,
      }
    },

    async insertAnalysis({ monthKey, type, userId, model, inputHash, result, status }) {
      ready()
      const inserted = await query(
        `insert into promo_analyses (month, type, created_by, model, input_hash, result, status)
         values ($1::date, $2, $3, $4, $5, $6, $7)
         returning created_at`,
        [`${monthKey}-01`, type, userId || null, model || '', inputHash, JSON.stringify(result), status],
      )

      return {
        month: monthKey,
        type,
        createdAt: new Date(inserted.rows[0].created_at).toISOString(),
        model: model || '',
        inputHash,
        result,
        status,
      }
    },

    async listComments(adId) {
      ready()
      const result = await query(
        `select id, author_id, author_name, text, created_at
         from promo_creative_comments
         where ad_id = $1 and deleted_at is null
         order by created_at asc`,
        [adId],
      )
      return result.rows.map(mapCommentRow)
    },

    async addComment({ adId, authorId, authorName, text }) {
      ready()
      const result = await query(
        `insert into promo_creative_comments (ad_id, author_id, author_name, text)
         values ($1, $2, $3, $4)
         returning id, author_id, author_name, text, created_at`,
        [adId, authorId || null, authorName, text],
      )
      return mapCommentRow(result.rows[0])
    },

    // Returns 'deleted', 'forbidden' or 'missing'.
    async deleteComment({ adId, id, userId }) {
      ready()
      const found = await query(
        `select author_id from promo_creative_comments
         where id::text = $1 and ad_id = $2 and deleted_at is null`,
        [id, adId],
      )
      const row = found.rows[0]
      if (!row) return 'missing'

      const own = userId ? row.author_id === userId : row.author_id === null
      if (!own) return 'forbidden'

      await query(`update promo_creative_comments set deleted_at = now() where id::text = $1`, [id])
      return 'deleted'
    },

    async commentCounts(adIds) {
      ready()
      if (!adIds.length) return {}

      const result = await query(
        `select ad_id, count(*)::int as total
         from promo_creative_comments
         where ad_id = any($1::text[]) and deleted_at is null
         group by ad_id`,
        [adIds],
      )
      return Object.fromEntries(result.rows.map((row) => [row.ad_id, row.total]))
    },
  }
}

function mapCommentRow(row) {
  return {
    id: row.id,
    authorId: row.author_id || null,
    authorName: row.author_name || '',
    text: row.text,
    createdAt: new Date(row.created_at).toISOString(),
  }
}
