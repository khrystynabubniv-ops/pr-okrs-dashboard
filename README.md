# Comms Tool

Веб-додаток для Communications: KPI goals, Monthly Focus, Events, Dashboard та Board Report Generator.

## Stack

- React + Vite + Tailwind CSS
- React Router v6
- Recharts
- Node.js + Express API proxy
- PostgreSQL app-owned storage for gradual migration
- Notion API, Claude API, Looqme coverage API, Mailchimp Marketing API
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
AUTH_REQUIRED=
AUTH_ALLOWED_EMAILS=oleksandra.kolosok@uni.tech,anastasiia.slobodianiuk@uni.tech,anna.gayuk@uni.tech,yevheniia.moskalchuk@uni.tech,khrystyna.bubniv@uni.tech,diana.bondarenko@uni.tech,inna.buhai@uni.tech,iryna.krylova@uni.tech,mariia.tarasiuk@uni.tech,nataliia.babii@uni.tech,oleksandra.lukianova@uni.tech,vira.bihanovska@uni.tech,oleksandra.stoliarenko@uni.tech
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
LOOQME_COVERAGE_URL=https://hub.looqme.io/api/v1/articles-external
LOOQME_BASE_URL=
LOOQME_COVERAGE_PATH=
LOOQME_AUTH_HEADER=Authorization
LOOQME_AUTH_SCHEME=Token
LOOQME_TOKEN_QUERY_PARAM=
LOOQME_DATE_FROM_PARAM=start
LOOQME_DATE_TO_PARAM=end
LOOQME_MONTH_PARAM=
LOOQME_EXTRA_QUERY=by_created=false&ordering=desc&response_lang=uk&short_article=false&duplicates=true&limit=100
LOOQME_RESPONSE_FORMAT=json
LOOQME_OWN_BRANDS=Universe Group,Universe
LOOQME_COMPETITOR_BRANDS=Skelar,Headway
LOOQME_DEFAULT_BRAND=Universe Group
LOOQME_TIMEOUT_MS=30000
LOOQME_MAX_PAGES=5
LOOQME_USE_MOCK=false
VITE_LOOQME_DASHBOARD_URL=
MAILCHIMP_API_KEY=
MAILCHIMP_SERVER_PREFIX=
MAILCHIMP_LIST_ID=
MAILCHIMP_BASE_URL=
MAILCHIMP_REPORTS_LIMIT=100
MAILCHIMP_FETCH_REPORT_DETAILS=true
MAILCHIMP_REPORT_DETAILS_CONCURRENCY=4
MAILCHIMP_TIMEOUT_MS=15000
VITE_MAILCHIMP_DASHBOARD_URL=
EVENTS_AWARENESS_SPREADSHEET_ID=1StHTeMTN0m3WFaOmxucsR2njnmKv04_R7CqG-_ZjDhE
KPI_SOURCE=google-sheet
KPI_SPREADSHEET_ID=1-wWo9W9gL4jYqpsZNrtZnb85XL5sLkAI4GKEqiMkEnI
KPI_SHEET_GID=0
KPI_SHEET_NAME=
SMM_EMPLOYEE_COUNT=310
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
META_AD_ACCOUNT_ID=
META_FOLLOW_ACTION_TYPES=follow,onsite_conversion.follow
META_ADS_TIMEOUT_MS=45000
META_PROMO_MAX_PAGES=40
PROMO_SNAPSHOT_TTL_HOURS=24
LINKEDIN_ACCESS_TOKEN=
LINKEDIN_AD_ACCOUNT_ID=
LINKEDIN_API_VERSION=202611
LINKEDIN_CURRENCY=USD
LINKEDIN_TIMEOUT_MS=30000
```

`NOTION_FOCUS_DB` можна залишити порожнім: тоді сервер створить базу `Comms Tool Monthly Focus` через Notion API. Якщо заданий `NOTION_PARENT_PAGE_ID`, база буде створена під цією сторінкою; інакше сервер спробує створити її на workspace-рівні. Після першого створення краще додати цей ID у Railway Variables як `NOTION_FOCUS_DB`.

`KPI_SOURCE=google-sheet` перемикає Goals & Metrics і KPI-блоки Dashboard на Google Sheet. Service account має бути пошарений на таблицю; для читання достатньо Viewer, для створення цілей і оновлення місячних значень потрібен Editor.

Якщо заданий `DATABASE_URL`, застосунок працює у migration mode: старі Notion/Google Sheets дані читаються як раніше, але нові записи й редагування з епки зберігаються в Postgres і мерджаться поверх старих джерел. Це дозволяє плавно зробити Postgres єдиним source of truth.

Для OAuth через Google додайте `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `APP_BASE_URL`. У production auth вмикається автоматично, якщо заданий allowlist; локально можна поставити `AUTH_REQUIRED=true`, щоб вимагати логін. `AUTH_ALLOWED_EMAILS` приймає список конкретних email через кому і має пріоритет над `AUTH_ALLOWED_EMAIL_DOMAINS`. Якщо `AUTH_ALLOWED_EMAILS` не заданий, застосунок використовує вбудований allowlist команди.

`SMM_EMPLOYEE_COUNT` використовується для EGC KPI: середній EGC count за заповнені місяці порівнюється з 10% від кількості співробітників.

`LOOQME_TOKEN` і `LOOQME_COVERAGE_URL` вмикають live coverage у Dashboard. За документацією Looqme Articles API endpoint — `https://hub.looqme.io/api/v1/articles-external`, токен іде як `Authorization: Token <token>`, а місячний фільтр додається як `start=YYYY-MM-DDT00:00:00&end=YYYY-MM-DDT23:59:59&by_created=false`. Якщо Looqme дає base URL + path окремо, використайте `LOOQME_BASE_URL` і `LOOQME_COVERAGE_PATH`; назви header/query параметрів можна змінити через `LOOQME_AUTH_*`, `LOOQME_TOKEN_QUERY_PARAM`, `LOOQME_DATE_*_PARAM` та `LOOQME_EXTRA_QUERY`. `LOOQME_MAX_PAGES=5` завантажує до 5 сторінок результатів, щоб кількісні сегменти coverage краще сходились із загальним `count`. `VITE_LOOQME_DASHBOARD_URL` робить Looqme-показники в Dashboard клікабельними. `LOOQME_USE_MOCK=true` залишений тільки для локальної демки.

`MAILCHIMP_API_KEY` вмикає email-метрики у Dashboard і Board Report Generator. Сервер бере Mailchimp Marketing API `/reports` і `/reports/{campaign_id}` за вибраний та попередній місяць, а для health бази використовує `/lists/{list_id}` і `/lists/{list_id}/growth-history`. `MAILCHIMP_SERVER_PREFIX` — це `usX` із Mailchimp URL або суфікса API key; якщо ключ має вигляд `...-us19`, сервер визначить prefix автоматично. `MAILCHIMP_LIST_ID` або `MAILCHIMP_AUDIENCE_ID` можна не задавати, якщо Mailchimp віддає `recipients.list_id` у campaign reports: сервер підхопить його сам. Вручну ця змінна потрібна тільки для місяців без кампаній або якщо API не повертає list id, але треба показувати розмір бази й net new growth. `MAILCHIMP_BASE_URL` потрібен лише для нестандартного base URL. `MAILCHIMP_FETCH_REPORT_DETAILS=false` вимикає detail-запити, якщо треба зменшити навантаження на API. `VITE_MAILCHIMP_DASHBOARD_URL` робить Mailchimp-блок клікабельним.

Для збереження Board Report у Notion потрібен `NOTION_REPORTS_PARENT_PAGE_ID` або `NOTION_PARENT_PAGE_ID`.

## Meta Ads (Promo page)

Сторінка «Промо» (`/promo`) показує щомісячний звіт по рекламі: метрики, графік по тижнях, вакансії по платформах (Meta Ads + LinkedIn), інші кампанії, AI-аналіз «що працює / що ні» і коментарі команди.

Змінні:

- `META_ACCESS_TOKEN` — той самий токен, що й для SMM, але він має мати дозвіл **`ads_read`** (і користувач токена має доступ до рекламного кабінету). Без цього сторінка покаже помилку «Токен Meta не має доступу до рекламного кабінету (ads_read)».
- `META_AD_ACCOUNT_ID` — ID рекламного кабінету у форматі `act_XXXX`.
- `META_FOLLOW_ACTION_TYPES` — `action_type` із `actions`, які рахуються як нові підписники Instagram (через кому). Значення за замовчуванням треба звірити у Graph API Explorer для ваших кампаній на підписку.
- `PROMO_SNAPSHOT_TTL_HOURS` — через скільки годин snapshot поточного місяця оновлюється у фоні (за замовчуванням 24). Місяці, що завершились понад 7 днів тому, самі не оновлюються; кнопка «Оновити» синхронізує будь-який місяць.
- `META_ADS_TIMEOUT_MS`, `META_PROMO_MAX_PAGES` — таймаут запитів до Marketing API і ліміт сторінок insights.

Як це працює:

- Тип кампанії береться з назви (однаково для Meta і LinkedIn): `UNI | Вакансія | AI Motion Designer | 11.2026`. Другий сегмент — `Вакансія`, `Підписники` або `Awareness`; усе інше — «Не розпізнано». Мапа типів — `CAMPAIGN_TYPES` у `server/promo/calc.js`, пороги міток креативів — `LABEL_THRESHOLDS` там само.
- Дані за місяць зберігаються в Postgres (`promo_snapshots`), тому сторінка працює, навіть якщо токен Meta протермінувався: тоді показуються останні дані зі жовтим банером. AI-аналіз (`promo_analyses`) і коментарі (`promo_creative_comments`, прив'язані до `ad_id`) теж у БД; для сторінки потрібен `DATABASE_URL`.
- AI-аналіз використовує OpenRouter (`OPENROUTER_MODEL`, має підтримувати зображення) із запасним Anthropic, як і звіти по івентах.

### Шаблон назви кампаній (Meta Ads і LinkedIn Campaign Manager)

`UNI | <Тип> | <Назва> | ММ.РРРР`, наприклад `UNI | Вакансія | AI Motion Designer | 11.2026`.

- Другий сегмент: `Вакансія`, `Підписники` або `Awareness`. У Meta працюють усі три типи.
- У LinkedIn крутяться тільки вакансії, тому **кожна кампанія LinkedIn вважається вакансією**, навіть без шаблону: назва вакансії береться з шаблону, інакше з назви оголошення (`nov26_<Вакансія>_…`), інакше з назви кампанії.
- Вакансія — це третій сегмент без урахування регістра, лапок і подвійних пробілів: `AI Motion Designer` у Meta і `"ai  motion designer"` у LinkedIn — одна вакансія з двома блоками платформ. Кілька кампаній однієї платформи для однієї вакансії (перезапуск) зводяться в один блок.
- «Крутилась» і період рахуються по днях, коли витрати були більшими за нуль: окремо по платформі та по вакансії (від найранішого початку до найпізнішого кінця). Для поточного місяця кінець показується як «зараз», якщо витрати були вчора або сьогодні.
- Еплаї вводяться вручну на картці вакансії (за місяць) і зберігаються в БД (`promo_vacancy_applies`). З них рахується ціна еплаю й KPI «Еплаї».

### Як розпізнаються вакансії

1. **Тип кампанії.** Спершу за шаблоном (`UNI | Вакансія | …`), інакше за ключовими словами в назві: `vacanc` / `вакан` → Вакансії, `follow` (followers, new followers) / `підпис` → Підписники, `awareness` / `впізнаван` → Awareness (список у `CAMPAIGN_TYPES` у `server/promo/calc.js`).
2. **Вакансія.** Якщо кампанія за шаблоном, вакансія — третій сегмент назви кампанії. Інакше (одна кампанія на багато вакансій, наприклад `Vacancies November26`) вакансія береться з **назви оголошення**: `nov26_<Вакансія>_concept1_stat_v1_cv` → `<Вакансія>`. Оголошення без такого шаблону потрапляють у картку «Вакансію не визначено».
3. **A/B-тести всередині вакансії.** Якщо в назвах оголошень вакансії є `cv` / `no_cv` або `general` / `лукалайк` (`lookalike`) і значення різняться, вакансія лишається однією карткою, а оголошення діляться на тести (З CV / Без CV, General / Lookalike). Кожен тест має свої метрики, креативи, лідера й найслабшого.
4. Мітки креативів і частка бюджету рахуються всередині вакансії на платформі (або всередині тесту).

### LinkedIn Marketing API

Змінні: `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AD_ACCOUNT_ID` (числовий id рекламного акаунта), `LINKEDIN_API_VERSION` (заголовок `Linkedin-Version`, формат `YYYYMM`, за замовчуванням `202611`), `LINKEDIN_CURRENCY` (валюта, якщо API кабінету її не повернув) і `LINKEDIN_TIMEOUT_MS`. Без токена й акаунта LinkedIn просто не підключений: сторінка працює лише з Meta і показує невеликий жовтий банер.

Як отримати токен:

1. У [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) відкрийте (або створіть) додаток, прив'язаний до сторінки компанії, і запросіть доступ до продукту Advertising API (Marketing).
2. Згенеруйте 3-legged OAuth токен для користувача, який має роль у рекламному акаунті (мінімум `VIEWER`), зі scopes `r_ads` і `r_ads_reporting`. Для тексту оголошень (best-effort) знадобиться ще `r_organization_social`.
3. Id акаунта візьміть з URL Campaign Manager (`.../accounts/<id>/...`) і запишіть у `LINKEDIN_AD_ACCOUNT_ID`.
4. Токен має обмежений термін дії: коли сторінка покаже «LinkedIn: токен не працює», згенеруйте новий і оновіть `LINKEDIN_ACCESS_TOKEN` у Railway Variables.

Що важливо знати:

- Кліки LinkedIn — `landingPageClicks` (запасний варіант — `clicks`), витрати — `costInLocalCurrency` (поля `costInUsd` у документації немає). Валюта LinkedIn-кабінету має збігатися з Meta, інакше суми не додаються і LinkedIn позначається помилкою.
- Статистика береться з `adAnalytics` (`pivot=CREATIVE`, `timeGranularity=DAILY`) пачками по 20 кампаній, кампанії й креативи — з `adCampaigns` і `creatives`.
- Прев'ю оголошення API віддає лише з версії `202610` (`metadata.assetURL`), текст оголошення — через Posts API з додатковим scope. Якщо їх немає, на картці плейсхолдер з типом (single image / carousel / video / text), а AI аналізує метрики й назву.
- Якщо LinkedIn не відповів, дані Meta показуються як раніше, а LinkedIn — останні збережені зі своєю датою.

### Перепідключення Meta

1. У [Graph API Explorer](https://developers.facebook.com/tools/explorer/) оберіть додаток, додайте дозволи `ads_read` та ті, що потрібні для SMM, і згенеруйте токен (бажано long-lived).
2. Оновіть `META_ACCESS_TOKEN` у Railway Variables і перезапустіть сервіс.
3. На сторінці «Промо» натисніть «Оновити».

Перевірити поля можна запитом: `GET /{META_AD_ACCOUNT_ID}/insights?level=ad&date_preset=last_30d&fields=ad_id,actions,video_play_actions,video_p25_watched_actions,video_thruplay_watched_actions&limit=5`.

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
