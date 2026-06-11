import { randomBytes } from 'node:crypto'
import {
  createSession,
  deleteSession,
  findSessionUser,
  isDatabaseConfigured,
  upsertOAuthUser,
} from './db/index.js'

const SESSION_COOKIE = 'ct_session'
const OAUTH_STATE_COOKIE = 'ct_oauth_state'
const LOGIN_RETURN_COOKIE = 'ct_login_return'
const SESSION_DAYS = 30
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'

export function authStatus() {
  const googleConfigured = Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
  const required = isAuthRequired()

  return {
    enabled: required || googleConfigured,
    required,
    googleConfigured,
    sessionStoreReady: isDatabaseConfigured(),
  }
}

export function isAuthRequired() {
  return String(process.env.AUTH_REQUIRED || '').trim().toLowerCase() === 'true'
}

export async function attachUser(request, _response, next) {
  try {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE]
    request.user = token ? await findSessionUser(token) : null
  } catch (error) {
    console.error('Failed to read auth session', error)
    request.user = null
  }

  next()
}

export function requireAuth(request, _response, next) {
  if (!isAuthRequired()) {
    next()
    return
  }

  if (!authStatus().sessionStoreReady) {
    next(createHttpError(503, 'Auth requires DATABASE_URL and migrated auth tables.'))
    return
  }

  if (!request.user) {
    next(createHttpError(401, 'Потрібно увійти, щоб користуватись Comms Tool.'))
    return
  }

  next()
}

export function requirePageAuth(request, response, next) {
  if (!isAuthRequired() || request.user) {
    next()
    return
  }

  if (isPublicPageRequest(request.path)) {
    next()
    return
  }

  if (!authStatus().sessionStoreReady) {
    next(createHttpError(503, 'Auth requires DATABASE_URL and migrated auth tables.'))
    return
  }

  const nextPath = safeReturnPath(request.originalUrl || request.url) || '/dashboard'
  response.redirect(`/login?next=${encodeURIComponent(nextPath)}`)
}

export function registerAuthRoutes(app) {
  app.get('/api/auth/me', async (request, response) => {
    response.json({
      user: request.user || null,
      auth: authStatus(),
    })
  })

  app.get('/api/auth/google/start', (request, response, next) => {
    try {
      if (!isGoogleOAuthConfigured()) {
        throw createHttpError(
          503,
          'Google OAuth не налаштований. Додайте GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET і APP_BASE_URL.',
        )
      }

      const state = randomToken()
      const redirectUri = oauthRedirectUri(request)
      const returnPath = safeReturnPath(request.query.next) || '/dashboard'
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        prompt: 'select_account',
        state,
      })

      response.setHeader('Set-Cookie', [
        serializeCookie(OAUTH_STATE_COOKIE, state, {
          httpOnly: true,
          maxAge: 10 * 60,
          sameSite: 'Lax',
        }),
        serializeCookie(LOGIN_RETURN_COOKIE, returnPath, {
          httpOnly: true,
          maxAge: 10 * 60,
          sameSite: 'Lax',
        }),
      ])
      response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/auth/google/callback', async (request, response, next) => {
    try {
      if (!isGoogleOAuthConfigured()) {
        throw createHttpError(503, 'Google OAuth не налаштований.')
      }

      const cookies = parseCookies(request.headers.cookie)
      if (!request.query.state || request.query.state !== cookies[OAUTH_STATE_COOKIE]) {
        throw createHttpError(400, 'OAuth state не збігається. Спробуйте увійти ще раз.')
      }

      const tokenPayload = await exchangeGoogleCode(request.query.code, oauthRedirectUri(request))
      const profile = await fetchGoogleProfile(tokenPayload.access_token)
      assertAllowedEmail(profile.email)

      const user = await upsertOAuthUser({
        provider: 'google',
        providerUserId: profile.sub,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.picture,
      })
      const sessionToken = randomToken()
      const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
      await createSession(user.id, sessionToken, expiresAt)

      response.setHeader('Set-Cookie', [
        serializeCookie(SESSION_COOKIE, sessionToken, {
          httpOnly: true,
          maxAge: SESSION_DAYS * 24 * 60 * 60,
          sameSite: 'Lax',
        }),
        serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0 }),
        serializeCookie(LOGIN_RETURN_COOKIE, '', { maxAge: 0 }),
      ])
      response.redirect(
        `${appBaseUrl(request)}${safeReturnPath(cookies[LOGIN_RETURN_COOKIE]) || '/dashboard'}`,
      )
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/auth/logout', async (request, response, next) => {
    try {
      const token = parseCookies(request.headers.cookie)[SESSION_COOKIE]
      await deleteSession(token)
      response.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }))
      response.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })
}

function isGoogleOAuthConfigured() {
  return Boolean(
    isDatabaseConfigured() &&
      process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  )
}

async function exchangeGoogleCode(code, redirectUri) {
  if (!code) throw createHttpError(400, 'OAuth code відсутній.')

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      code: String(code),
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!response.ok) {
    throw createHttpError(502, 'Google OAuth token error.', await response.text())
  }

  return response.json()
}

async function fetchGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!response.ok) {
    throw createHttpError(502, 'Google profile error.', await response.text())
  }

  return response.json()
}

function assertAllowedEmail(email) {
  const allowedDomains = String(process.env.AUTH_ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)

  if (!allowedDomains.length) return

  const domain = String(email || '').split('@').pop()?.toLowerCase()
  if (!domain || !allowedDomains.includes(domain)) {
    throw createHttpError(403, 'Цей email не має доступу до Comms Tool.')
  }
}

function appBaseUrl(request) {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '')

  const protocol =
    request.headers['x-forwarded-proto'] || (request.secure ? 'https' : 'http')
  return `${protocol}://${request.headers.host}`
}

function oauthRedirectUri(request) {
  return `${appBaseUrl(request)}/api/auth/google/callback`
}

function isPublicPageRequest(pathname = '') {
  return (
    pathname === '/login' ||
    pathname.startsWith('/assets/') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/manifest.webmanifest' ||
    /\.[a-zA-Z0-9]{2,8}$/.test(pathname)
  )
}

function safeReturnPath(value) {
  const path = String(value || '').trim()
  if (!path.startsWith('/') || path.startsWith('//')) return ''

  try {
    const url = new URL(path, 'https://comms-tool.local')
    if (url.origin !== 'https://comms-tool.local') return ''
    if (url.pathname.startsWith('/api/')) return ''
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return ''
  }
}

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    String(cookieHeader || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        if (index === -1) return [part, '']
        return [
          decodeURIComponent(part.slice(0, index)),
          decodeURIComponent(part.slice(index + 1)),
        ]
      }),
  )
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, 'Path=/']
  const secure = process.env.NODE_ENV === 'production'

  if (options.httpOnly) parts.push('HttpOnly')
  if (secure) parts.push('Secure')
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`)
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`)

  return parts.join('; ')
}

function randomToken() {
  return randomBytes(32).toString('base64url')
}

function createHttpError(status, message, details) {
  const error = new Error(message)
  error.status = status
  error.details = details
  return error
}
