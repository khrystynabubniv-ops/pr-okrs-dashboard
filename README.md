# Comms Tool

Веб-додаток для Communications: KPI goals, Monthly Focus, Events, Dashboard та Board Report Generator.

## Stack

- React + Vite + Tailwind CSS
- React Router v6
- Recharts
- Node.js + Express API proxy
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
ANTHROPIC_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
LOOQME_TOKEN=
EVENTS_AWARENESS_SPREADSHEET_ID=1StHTeMTN0m3WFaOmxucsR2njnmKv04_R7CqG-_ZjDhE
KPI_SOURCE=google-sheet
KPI_SPREADSHEET_ID=1-wWo9W9gL4jYqpsZNrtZnb85XL5sLkAI4GKEqiMkEnI
KPI_SHEET_GID=0
SMM_EMPLOYEE_COUNT=305
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

`NOTION_FOCUS_DB` можна залишити порожнім: тоді сервер створить базу `Comms Tool Monthly Focus` через Notion API. Якщо заданий `NOTION_PARENT_PAGE_ID`, база буде створена під цією сторінкою; інакше сервер спробує створити її на workspace-рівні. Після першого створення краще додати цей ID у Railway Variables як `NOTION_FOCUS_DB`.

`KPI_SOURCE=google-sheet` перемикає Goals & Metrics і KPI-блоки Dashboard на Google Sheet. Service account має бути пошарений на таблицю; для читання достатньо Viewer, для створення цілей і оновлення місячних значень потрібен Editor.

`SMM_EMPLOYEE_COUNT` використовується для EGC KPI: поточний EGC count ділиться на кількість співробітників і порівнюється з цільовими 10%.

Для збереження Board Report у Notion потрібен `NOTION_REPORTS_PARENT_PAGE_ID` або `NOTION_PARENT_PAGE_ID`.

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
