# Comms Tool

Веб-додаток для Communications: KPI goals, Monthly Focus, Events, Dashboard та Board Report Generator.

## Stack

- React + Vite + Tailwind CSS
- React Router v6
- Recharts
- Node.js + Express API proxy
- PostgreSQL app-owned storage for gradual migration
- Notion API, Claude API, Looqme mock
- Railway deploy via `railway.json`

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Frontend відкривається на Vite URL, API працює на `http://localhost:3001`.

## Environment variables

```bash
NOTION_TOKEN=
NOTION_KPI_DB=560e6577-a1f7-479d-9a15-cb7404642eda
NOTION_EVENTS_DB=2a2ce989-9cb7-804f-b66f-000b0b58be12
NOTION_ACTIVITIES_DB=040fac81-5162-43ee-ad31-e19479696ba3
NOTION_FOCUS_DB=
NOTION_PARENT_PAGE_ID=
NOTION_REPORTS_PARENT_PAGE_ID=
DATABASE_URL=
DATABASE_SSL=
DB_MIGRATE_REQUIRED=false
APP_BASE_URL=http://localhost:3001
AUTH_REQUIRED=false
AUTH_ALLOWED_EMAIL_DOMAINS=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
ANTHROPIC_API_KEY=
ANTHROPIC_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6
EVENT_REPORTS_AI_PROVIDER=
LOOQME_TOKEN=
EVENTS_AWARENESS_SPREADSHEET_ID=1StHTeMTN0m3WFaOmxucsR2njnmKv04_R7CqG-_ZjDhE
KPI_SOURCE=google-sheet
KPI_SPREADSHEET_ID=1-wWo9W9gL4jYqpsZNrtZnb85XL5sLkAI4GKEqiMkEnI
KPI_SHEET_GID=0
KPI_SHEET_NAME=
SMM_EMPLOYEE_COUNT=305
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

`NOTION_FOCUS_DB` можна залишити порожнім: тоді сервер створить базу `Comms Tool Monthly Focus` через Notion API. Якщо заданий `NOTION_PARENT_PAGE_ID`, база буде створена під цією сторінкою; інакше сервер спробує створити її на workspace-рівні. Після першого створення краще додати цей ID у Railway Variables як `NOTION_FOCUS_DB`.

`KPI_SOURCE=google-sheet` перемикає Goals & Metrics і KPI-блоки Dashboard на Google Sheet. Service account має бути пошарений на таблицю; для читання достатньо Viewer, для створення цілей і оновлення місячних значень потрібен Editor.

Якщо заданий `DATABASE_URL`, застосунок працює у migration mode: старі Notion/Google Sheets дані читаються як раніше, але нові записи й редагування з епки зберігаються в Postgres і мерджаться поверх старих джерел. Це дозволяє плавно зробити Postgres єдиним source of truth.

Для OAuth через Google додайте `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APP_BASE_URL`. Коли треба вимагати логін для запису даних, поставте `AUTH_REQUIRED=true`. `AUTH_ALLOWED_EMAIL_DOMAINS` можна заповнити списком доменів через кому.

`SMM_EMPLOYEE_COUNT` використовується для EGC KPI: поточний EGC count ділиться на кількість співробітників і порівнюється з цільовими 10%.

Для збереження Board Report у Notion потрібен `NOTION_REPORTS_PARENT_PAGE_ID` або `NOTION_PARENT_PAGE_ID`.

## Database

```bash
npm run db:migrate
npm run db:backup
ALLOW_RESTORE=true npm run db:restore -- ./backups/comms-tool-db-YYYY-MM-DD.json
```

`npm start` автоматично запускає `db:migrate`; якщо `DATABASE_URL` не заданий або локальна DB тимчасово недоступна, міграції не блокують старий read-only режим. Для production deploy, де DB має бути обовʼязковою, поставте `DB_MIGRATE_REQUIRED=true`.

## Railway

```bash
npm run build
npm run start
```

Railway використовує:

```json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "npm run start" }
}
```
