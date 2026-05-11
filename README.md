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
```

`NOTION_FOCUS_DB` можна залишити порожнім лише якщо заданий `NOTION_PARENT_PAGE_ID`: тоді сервер створить базу `Comms Tool Monthly Focus` через Notion API і поверне її ID у відповіді. Після першого створення краще додати цей ID у Railway Variables як `NOTION_FOCUS_DB`.

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
