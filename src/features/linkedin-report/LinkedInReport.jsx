import { useState, useEffect, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceDot } from "recharts";
import { ChevronDown, ChevronUp, Plus, Trash2, Save, Pencil, ArrowUp, ArrowDown, X } from "lucide-react";
import { apiRequest } from "../../lib/api";
import "./LinkedInReport.css";

const TOKENS = {
  paper: "var(--bg)",
  paperCard: "var(--surface)",
  ink: "var(--ink)",
  inkSoft: "var(--muted)",
  indigo: "var(--accent)",
  indigoSoft: "var(--accent-d)",
  gold: "var(--warn)",
  goldBg: "var(--warn-soft)",
  sage: "var(--good)",
  sageBg: "var(--good-soft)",
  clay: "var(--warn)",
  clayBg: "var(--warn-soft)",
  line: "var(--line)",
  lineSoft: "var(--line)",
};

const DEFAULT_PERSON_ID = "yaroslav-morozov";
const DEFAULT_PERSON = {
  id: DEFAULT_PERSON_ID,
  name: "Ярослав Морозов",
  role: "CEO",
};

const seedMonths = [
  { id: "2025-08", label: "Серпень 2025", posts: 4, followers: 17270, views: null, viewsDelta: null, impressionsOverview: null, impressionsDelta: null, postsList: [], conclusions: [] },
  { id: "2025-09", label: "Вересень 2025", posts: 9, followers: 17545, views: null, viewsDelta: null, impressionsOverview: null, impressionsDelta: null, postsList: [], conclusions: [] },
  { id: "2025-10", label: "Жовтень 2025", posts: 9, followers: 17715, views: 66392, viewsDelta: -21, impressionsOverview: 18184, impressionsDelta: -28.52,
    postsList: [
      { title: "Допис про візит Google", impressions: 3036, clicks: 0, likes: 115, comments: 2, reposts: 0, saves: 0, shares: 0, total: 117, er: 3.85 },
      { title: "Анонс статті The Page", impressions: 8089, clicks: 88, likes: 60, comments: 1, reposts: 0, saves: 8, shares: 0, total: 69, er: 0.85 },
      { title: "Рев'ю книги «Мислити ставками»", impressions: 3879, clicks: 0, likes: 65, comments: 2, reposts: 0, saves: 9, shares: 0, total: 76, er: 1.96 },
      { title: "Чи потрібно всім бути менеджерами?", impressions: 3752, clicks: 0, likes: 103, comments: 4, reposts: 0, saves: 3, shares: 0, total: 110, er: 2.93 },
      { title: "Книги продакт-менеджерам", impressions: 6472, clicks: 0, likes: 118, comments: 10, reposts: 0, saves: 55, shares: 8, total: 191, er: 2.95 },
      { title: "Цілі мають лякати", impressions: 9823, clicks: 0, likes: 226, comments: 21, reposts: 1, saves: 7, shares: 0, total: 255, er: 2.60 },
      { title: "Вірю в теорію мультивсесвітів", impressions: 6517, clicks: 0, likes: 138, comments: 2, reposts: 0, saves: 3, shares: 0, total: 143, er: 2.19 },
      { title: "Горталка «Як приймати бізнес-рішення?»", impressions: 5500, clicks: 0, likes: 85, comments: 9, reposts: 1, saves: 12, shares: 0, total: 107, er: 1.95 },
      { title: "Що я забрав у підприємців?", impressions: 13023, clicks: 0, likes: 214, comments: 15, reposts: 0, saves: 8, shares: 0, total: 237, er: 2.41 },
    ],
    conclusions: [
      "Вдались публікації з широкими темами — корисні і джунам, і експертам, і колегам. Широка тема = широка воронка",
      "Просіли через невіральний контент: не вистачало живих фото, дискусійних запитів, актуальних тем",
      "Не спрацював допис-горталка — можливо, заскладний контент або візуальний стиль",
      "Класно працюють підбірки книг, особистий досвід і сторітелінг через власну призму — лишаємо",
    ],
  },
  { id: "2025-11", label: "Листопад 2025", posts: 7, followers: 17973, views: 155538, viewsDelta: 134, impressionsOverview: 58301, impressionsDelta: 220.62,
    postsList: [
      { title: "Ветеранський проєкт", impressions: 3656, clicks: 0, likes: 113, comments: 2, reposts: 0, saves: 0, shares: 0, total: 115, er: 3.15 },
      { title: "Відкрите питання про АІ", impressions: 15149, clicks: 0, likes: 116, comments: 25, reposts: 0, saves: 2, shares: 0, total: 143, er: 0.94 },
      { title: "Як ви робите ретро року?", impressions: 6646, clicks: 0, likes: 87, comments: 19, reposts: 0, saves: 4, shares: 0, total: 110, er: 1.66 },
      { title: "Ціни в США", impressions: 25912, clicks: 0, likes: 155, comments: 15, reposts: 2, saves: 7, shares: 9, total: 188, er: 0.73 },
      { title: "Інсайти з зустрічі Gemini", impressions: 4003, clicks: 0, likes: 105, comments: 6, reposts: 0, saves: 2, shares: 1, total: 114, er: 2.85 },
      { title: "Зустріч з Meta", impressions: 23332, clicks: 0, likes: 358, comments: 12, reposts: 4, saves: 4, shares: 0, total: 378, er: 1.62 },
      { title: "AI Hiring", impressions: 66176, clicks: 0, likes: 230, comments: 67, reposts: 1, saves: 36, shares: 30, total: 364, er: 0.55 },
    ],
    conclusions: [
      "Вдались публікації про АІ у конкретних бізнес-контекстах — варто тягнути лінію до статусу експерта",
      "Круто працюють фото з галереї — нативність і різноманітність стрічки",
      "Корисний контент + актуальність теми дають комбо-ефект",
    ],
  },
  { id: "2025-12", label: "Грудень 2025", posts: 8, followers: 18142, views: 64459, viewsDelta: -59, impressionsOverview: 19825, impressionsDelta: -66.00,
    postsList: [
      { title: "Слово 2025 з АІ", impressions: 9006, clicks: 0, likes: 54, comments: 12, reposts: 0, saves: 1, shares: 1, total: 68, er: 0.76 },
      { title: "Привітання з Новим роком", impressions: 3846, clicks: 0, likes: 117, comments: 2, reposts: 0, saves: 1, shares: 0, total: 120, er: 3.12 },
      { title: "Домашнє завдання", impressions: 2477, clicks: 0, likes: 60, comments: 14, reposts: 0, saves: 2, shares: 0, total: 76, er: 3.07 },
      { title: "Кейсі Нейстат", impressions: 6672, clicks: 0, likes: 90, comments: 6, reposts: 0, saves: 2, shares: 0, total: 98, er: 1.47 },
      { title: "Шукаю персонального асистента", impressions: 13534, clicks: 147, likes: 113, comments: 9, reposts: 7, saves: 1, shares: 4, total: 281, er: 2.08 },
      { title: "Задача СЕО — найм", impressions: 17289, clicks: 0, likes: 170, comments: 13, reposts: 0, saves: 4, shares: 0, total: 187, er: 1.08 },
      { title: "Книги менеджерам", impressions: 6736, clicks: 0, likes: 108, comments: 9, reposts: 0, saves: 34, shares: 4, total: 155, er: 2.30 },
      { title: "400 млн користувачів", impressions: 9470, clicks: 0, likes: 258, comments: 13, reposts: 1, saves: 3, shares: 0, total: 275, er: 2.90 },
    ],
    conclusions: ["Не спрацював віжуал у мемі — дуже мало охоплень. Більше меми не беремо"],
  },
  { id: "2026-01", label: "Січень 2026", posts: 9, followers: 18369, views: 90005, viewsDelta: 40, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "Ви = ваше оточення", impressions: 9340, clicks: 0, likes: 232, comments: 14, reposts: 0, saves: 6, shares: 5, total: 257, er: 2.75 },
      { title: "Навіщо компанії вайбкодинг культура?", impressions: 4599, clicks: 0, likes: 82, comments: 1, reposts: 0, saves: 2, shares: 0, total: 85, er: 1.85 },
      { title: "Фокус на сильних сторонах", impressions: 8283, clicks: 0, likes: 230, comments: 4, reposts: 0, saves: 9, shares: 1, total: 244, er: 2.95 },
      { title: "5 етапів співбесід — норма", impressions: 6881, clicks: 0, likes: 88, comments: 23, reposts: 0, saves: 2, shares: 1, total: 114, er: 1.66 },
      { title: "Mission Possible анонс батчу", impressions: 7513, clicks: 0, likes: 183, comments: 0, reposts: 0, saves: 9, shares: 1, total: 193, er: 2.57 },
      { title: "Ми у шортлісті премії DOU", impressions: 3196, clicks: 0, likes: 69, comments: 2, reposts: 1, saves: 0, shares: 0, total: 72, er: 2.25 },
      { title: "Знову фінальна співбесіда — BarRaising", impressions: 22189, clicks: 0, likes: 171, comments: 6, reposts: 0, saves: 8, shares: 2, total: 187, er: 0.84 },
      { title: "Голосуйте за нас у премії ДОУ", impressions: 4650, clicks: 0, likes: 105, comments: 5, reposts: 1, saves: 0, shares: 0, total: 111, er: 2.39 },
      { title: "АІ в культурі компанії", impressions: 6212, clicks: 0, likes: 107, comments: 5, reposts: 0, saves: 4, shares: 1, total: 117, er: 1.88 },
    ],
    conclusions: [
      "Дописи на широкі теми — оточення, сильні/слабкі сторони, мотивація — стабільно добре працюють",
      "Дописи про співбесіди — топ серед коментаторів",
      "Дописи з нереалістичними / графічними фото — найнижчі охоплення",
      "Настав час переносити контент substack у LinkedIn",
    ],
  },
  { id: "2026-02", label: "Лютий 2026", posts: 5, followers: 18531, views: 52863, viewsDelta: -41, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "Часто мене питають, як я вчуся", impressions: 8923, clicks: 0, likes: 141, comments: 4, reposts: 0, saves: 4, shares: 1, total: 150, er: 1.68 },
      { title: "Виділяйте час на роботу", impressions: 9306, clicks: 0, likes: 160, comments: 1, reposts: 0, saves: 7, shares: 1, total: 169, er: 1.82 },
      { title: "Улюблений лайфхак для продуктивності", impressions: 5499, clicks: 0, likes: 120, comments: 6, reposts: 0, saves: 2, shares: 0, total: 128, er: 2.33 },
      { title: "UniCore команда", impressions: 13837, clicks: 0, likes: 222, comments: 3, reposts: 3, saves: 2, shares: 1, total: 231, er: 1.67 },
      { title: "Анонс ЗР", impressions: 4523, clicks: 64, likes: 67, comments: 3, reposts: 1, saves: 1, shares: 1, total: 137, er: 3.03 },
    ],
    conclusions: ["Стабільно всі пости показали +- однакові результати, антитопу немає"],
  },
  { id: "2026-03", label: "Березень 2026", posts: 9, followers: 18673, views: 69785, viewsDelta: 7, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "Анонс Substack", impressions: 3005, clicks: 0, likes: 58, comments: 1, reposts: 0, saves: 6, shares: 0, total: 65, er: 2.16 },
      { title: "OpenAI закриває Sora", impressions: 5527, clicks: 0, likes: 52, comments: 0, reposts: 0, saves: 1, shares: 1, total: 54, er: 0.98 },
      { title: "АІ агенти", impressions: 4978, clicks: 0, likes: 65, comments: 8, reposts: 0, saves: 4, shares: 0, total: 77, er: 1.55 },
      { title: "Гейм-ченджери 2026", impressions: 5088, clicks: 0, likes: 58, comments: 4, reposts: 0, saves: 1, shares: 0, total: 63, er: 1.24 },
      { title: "Перемога в премії ДОУ", impressions: 3531, clicks: 0, likes: 125, comments: 0, reposts: 0, saves: 0, shares: 0, total: 125, er: 3.54 },
      { title: "Ціль — стати АІ гіком", impressions: 11015, clicks: 0, likes: 149, comments: 16, reposts: 0, saves: 24, shares: 3, total: 192, er: 1.74 },
      { title: "Щотижнева рефлексія", impressions: 9190, clicks: 0, likes: 143, comments: 12, reposts: 0, saves: 15, shares: 3, total: 173, er: 1.88 },
      { title: "Тестую різні браузери", impressions: 5187, clicks: 0, likes: 58, comments: 9, reposts: 0, saves: 3, shares: 0, total: 70, er: 1.35 },
      { title: "Де я зник", impressions: 16289, clicks: 0, likes: 162, comments: 14, reposts: 0, saves: 23, shares: 4, total: 203, er: 1.25 },
    ],
    conclusions: [
      "Розробили айдентику для впізнаваності постів — продовжуємо тестувати дизайн",
      "Треба активніший діалог з аудиторією — розкручуємо тему АІ та онлайн-івент",
    ],
  },
  { id: "2026-04", label: "Квітень 2026", posts: 7, followers: 18833, views: 51208, viewsDelta: null, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "Асистентка Клавдія", impressions: 5906, clicks: 0, likes: 174, comments: 13, reposts: 0, saves: 37, shares: 8, total: 203, er: 3.44 },
      { title: "8 років, як я фаундер", impressions: 5868, clicks: 0, likes: 185, comments: 3, reposts: 0, saves: 3, shares: 0, total: 191, er: 3.25 },
      { title: "Про системне навчання менеджерів", impressions: 2901, clicks: 0, likes: 63, comments: 0, reposts: 0, saves: 9, shares: 1, total: 73, er: 2.52 },
      { title: "Ми не експерти в усьому", impressions: 3424, clicks: 0, likes: 76, comments: 4, reposts: 0, saves: 4, shares: 0, total: 84, er: 2.45 },
      { title: "Питай АІ як вивчати АІ", impressions: 6809, clicks: 0, likes: 86, comments: 10, reposts: 1, saves: 10, shares: 1, total: 108, er: 1.59 },
      { title: "80% наших запусків успішні", impressions: 8422, clicks: 110, likes: 115, comments: 8, reposts: 0, saves: 7, shares: 8, total: 248, er: 2.94 },
      { title: "Власний Health Coach", impressions: 6233, clicks: 0, likes: 143, comments: 14, reposts: 0, saves: 18, shares: 1, total: 176, er: 2.82 },
    ],
    conclusions: [
      "Антитоп — пости про менторство менеджерів. Люди реагують на конкретику й кейси, які можна повторити самотужки",
    ],
  },
  { id: "2026-05", label: "Травень 2026", posts: 9, followers: 19048, views: 63933, viewsDelta: null, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "Люди дуже недооцінюють нетворкінг", impressions: 5649, clicks: 0, likes: 150, comments: 17, reposts: 0, saves: 4, shares: 0, total: 171, er: 3.03 },
      { title: "3 АІ моделі", impressions: 2205, clicks: 0, likes: 48, comments: 1, reposts: 0, saves: 1, shares: 0, total: 50, er: 2.27 },
      { title: "Google I/O 2026", impressions: 7995, clicks: 0, likes: 197, comments: 0, reposts: 0, saves: 2, shares: 0, total: 199, er: 2.49 },
      { title: "Революція з Клавдією", impressions: 3087, clicks: 0, likes: 94, comments: 0, reposts: 0, saves: 4, shares: 2, total: 100, er: 3.24 },
      { title: "San Francisco, let's connect", impressions: 5991, clicks: 0, likes: 114, comments: 0, reposts: 0, saves: 0, shares: 1, total: 115, er: 1.92 },
      { title: "Оновлення Universe", impressions: 9176, clicks: 0, likes: 208, comments: 3, reposts: 7, saves: 1, shares: 3, total: 222, er: 2.42 },
      { title: "Страх менеджера — найняти досвідчену людину", impressions: 4205, clicks: 0, likes: 136, comments: 3, reposts: 1, saves: 8, shares: 0, total: 148, er: 3.52 },
      { title: "Риси сильних особистостей", impressions: 7937, clicks: 0, likes: 116, comments: 10, reposts: 3, saves: 19, shares: 2, total: 150, er: 1.89 },
      { title: "«Роботодавець року 2026» Форбс", impressions: 8648, clicks: 0, likes: 165, comments: 5, reposts: 5, saves: 1, shares: 0, total: 176, er: 2.04 },
    ],
    conclusions: [],
  },
  { id: "2026-06", label: "Червень 2026", posts: 3, followers: 19151, views: 31470, viewsDelta: null, impressionsOverview: null, impressionsDelta: null,
    postsList: [
      { title: "8 уроків за 8 років", impressions: 8604, clicks: 0, likes: 100, comments: 7, reposts: 0, saves: 6, shares: 1, total: 114, er: 1.32 },
      { title: "Рефлексія 35 років", impressions: 8716, clicks: 0, likes: 299, comments: 27, reposts: 1, saves: 11, shares: 5, total: 343, er: 3.94 },
      { title: "АІ хайп", impressions: 5771, clicks: 0, likes: 83, comments: 11, reposts: 0, saves: 8, shares: 0, total: 102, er: 1.77 },
    ],
    conclusions: [],
  },
];

const seedPR = [
  { date: "2025-09-16", source: "Економічна правда", title: "Ветеранський бізнес — рушій нової української економіки", format: "колонка", views: 400, audience: null },
  { date: "2025-10-24", source: "The Page", title: "ChatGPT — не єдиний наш Google", format: "колонка", views: null, audience: 2390000 },
  { date: "2025-11-11", source: "DOU", title: "Як ми створили навчальну програму з підприємництва для ветеранів", format: "колонка", views: null, audience: null },
  { date: "2025-11-27", source: "Genesis team (Telegram)", title: "Допис про матеріали «Шлях менеджера»", format: "допис", views: 1000, audience: null },
  { date: "2025-12-03", source: "NV", title: "Гранти, програми, інкубатори для ветеранського бізнесу", format: "колонка", views: 565, audience: null },
  { date: "2026-01-03", source: "Vector", title: "Як ветеранському бізнесу масштабуватися", format: "колонка", views: 1000, audience: null },
  { date: "2026-01-20", source: "NV бізнес", title: "Час ШІ-працівників. Що зміниться у продуктовому ІТ", format: "колонка", views: 10159, audience: null },
  { date: "2026-01-20", source: "Подкаст «Закрив Раунд»", title: "Побудувати бізнес на утилітах на 100+ млн завантажень", format: "подкаст", views: 14600, audience: null },
  { date: "2026-01-20", source: "Подкаст Vector", title: "Всередині Universe Group: 200 млн юзерів", format: "подкаст", views: 14400, audience: null },
  { date: "2026-04-17", source: "AIN", title: "Портрет фаундера та ключі до успіху в еру ШІ", format: "колонка", views: null, audience: 393000 },
  { date: "2026-05-01", source: "dev.ua", title: "Очільник Universe Group створив собі ШІ-асистентку Клавдію", format: "новина", views: null, audience: 382000 },
  { date: "2026-05-12", source: "Vector", title: "Скоротили цикл запуску з 3 років до 9 місяців", format: "стаття", views: null, audience: 217000 },
  { date: "2026-05-12", source: "Forbes", title: "Universe вийшла з екосистеми Genesis та зробила ребрендинг", format: "стаття", views: null, audience: 2990000 },
];

function fmt(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("uk-UA").format(Math.round(n));
}
function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  const s = n > 0 ? "+" : "";
  return `${s}${n.toFixed(1)}%`;
}
function sumPostMetric(posts, key) {
  if (!Array.isArray(posts)) return 0;
  return posts.reduce((sum, post) => sum + (Number(post?.[key]) || 0), 0);
}
function monthImpressions(month) {
  if (!month) return null;
  if (month.impressionsOverview !== null && month.impressionsOverview !== undefined) return month.impressionsOverview;
  const total = sumPostMetric(month.postsList, "impressions");
  return total || null;
}
function normalizePostTag(value) {
  const tag = String(value || "").trim().toLowerCase();
  if (tag === "top" || tag === "топ") return "top";
  if (tag === "antitop" || tag === "anti-top" || tag === "антитоп") return "antitop";
  return "";
}
function effectivePostTag(post, maxTotal, minTotal) {
  const manualTag = normalizePostTag(post?.tag);
  if (manualTag) return manualTag;
  if (maxTotal !== null && maxTotal !== undefined && post?.total === maxTotal) return "top";
  if (minTotal !== null && minTotal !== undefined && post?.total === minTotal && post?.total !== maxTotal) return "antitop";
  return "";
}
function postTagLabel(tag) {
  return tag === "top" ? "топ" : tag === "antitop" ? "антитоп" : "";
}
function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
function computeGrowth(months) {
  return months.map((m, i) => {
    const prev = months[i - 1];
    const delta = prev ? m.followers - prev.followers : null;
    const pct = prev && prev.followers ? (delta / prev.followers) * 100 : null;
    return { ...m, delta, pct };
  });
}
function withoutGrowthFields(month) {
  const clean = { ...month };
  delete clean.delta;
  delete clean.pct;
  return clean;
}

const UK_MONTHS = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];
const UK_MONTH_INDEX = new Map(UK_MONTHS.map((month, index) => [month.toLowerCase(), index]));

function currentMonthValue(date = new Date()) {
  return date.getFullYear() * 12 + date.getMonth();
}

function currentMonthLabel(date = new Date()) {
  return `${UK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function currentDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function monthValue(month) {
  const idMatch = String(month?.id || "").match(/^(\d{4})-(\d{2})$/);
  if (idMatch) return Number(idMatch[1]) * 12 + Number(idMatch[2]) - 1;

  const labelMatch = String(month?.label || "").trim().match(/^(.+?)\s+(\d{4})$/);
  if (!labelMatch) return Number.POSITIVE_INFINITY;

  const index = UK_MONTH_INDEX.get(labelMatch[1].toLowerCase());
  return index === undefined ? Number.POSITIVE_INFINITY : Number(labelMatch[2]) * 12 + index;
}

function monthIdFromLabel(label) {
  const labelMatch = String(label || "").trim().match(/^(.+?)\s+(\d{4})$/);
  if (labelMatch) {
    const index = UK_MONTH_INDEX.get(labelMatch[1].toLowerCase());
    if (index !== undefined) return `${labelMatch[2]}-${String(index + 1).padStart(2, "0")}`;
  }

  return String(label || "").toLowerCase().replace(/\s+/g, "-");
}

function sortMonthsChronologically(items) {
  return [...items].sort((a, b) => monthValue(a) - monthValue(b));
}

function orderMonthsForRail(items) {
  const target = currentMonthValue();
  return [...items].sort((a, b) => {
    const aValue = monthValue(a);
    const bValue = monthValue(b);
    const distance = Math.abs(aValue - target) - Math.abs(bValue - target);
    return distance || bValue - aValue;
  });
}

function closestMonthId(items) {
  return orderMonthsForRail(items)[0]?.id ?? null;
}

function personName(person) {
  return [person?.name, person?.role].filter(Boolean).join(" · ");
}

function personIdFromName(name, people = []) {
  const base =
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || `c-level-${Date.now()}`;

  if (!people.some((person) => person.id === base)) return base;

  let index = 2;
  while (people.some((person) => person.id === `${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function normalizePeople(items, months = [], pr = []) {
  const byId = new Map();
  [DEFAULT_PERSON, ...(Array.isArray(items) ? items : [])].forEach((person) => {
    const id = String(person?.id || "").trim();
    const name = String(person?.name || "").trim();
    if (!id || !name) return;
    byId.set(id, {
      id,
      name,
      role: String(person?.role || "").trim(),
    });
  });

  [...months, ...pr].forEach((item) => {
    const personId = String(item?.personId || "").trim();
    if (!personId || byId.has(personId)) return;
    byId.set(personId, {
      id: personId,
      name: String(item?.personName || personId).trim(),
      role: String(item?.personRole || "").trim(),
    });
  });

  return Array.from(byId.values());
}

function withPersonId(item, fallbackPersonId = DEFAULT_PERSON_ID) {
  return {
    ...item,
    personId: item?.personId || fallbackPersonId,
  };
}

function recordIdForPerson(personId, label) {
  return `${personId}-${monthIdFromLabel(label)}`;
}

const emptyPost = { title: "", impressions: "", clicks: "", likes: "", comments: "", reposts: "", saves: "", shares: "", tag: "" };
const emptyMonth = { label: "", followers: "", posts: "", views: "", impressionsOverview: "" };
const emptyPrPublication = { date: "", source: "", title: "", url: "", format: "", views: "", audience: "" };
const emptyPerson = { name: "", role: "" };

export default function LinkedInReport() {
  const [months, setMonths] = useState([]);
  const [selected, setSelected] = useState(null);
  const [people, setPeople] = useState([DEFAULT_PERSON]);
  const [selectedPerson, setSelectedPerson] = useState(DEFAULT_PERSON_ID);
  const [tab, setTab] = useState("linkedin");
  const [pr, setPr] = useState([]);
  const [sortKey, setSortKey] = useState("total");
  const [sortDir, setSortDir] = useState("desc");
  const [postTagFilter, setPostTagFilter] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftConclusions, setDraftConclusions] = useState("");
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryType, setEntryType] = useState("linkedin");
  const [entryPersonId, setEntryPersonId] = useState(DEFAULT_PERSON_ID);
  const [addingPerson, setAddingPerson] = useState(false);
  const [newPerson, setNewPerson] = useState(emptyPerson);
  const [newMonth, setNewMonth] = useState(() => ({ ...emptyMonth, label: currentMonthLabel() }));
  const [newPosts, setNewPosts] = useState([{ ...emptyPost }]);
  const [newPrPublication, setNewPrPublication] = useState(() => ({
    ...emptyPrPublication,
    date: currentDateInputValue(),
  }));

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiRequest("/api/linkedin-report");
        const m = sortMonthsChronologically(
          (Array.isArray(payload.months) && payload.months.length ? payload.months : seedMonths).map((item) => withPersonId(item))
        );
        const p = (Array.isArray(payload.pr) && payload.pr.length ? payload.pr : seedPR).map((item) => withPersonId(item));
        const normalizedPeople = normalizePeople(payload.people, m, p);
        const firstPersonId = normalizedPeople[0]?.id || DEFAULT_PERSON_ID;
        setMonths(m);
        setPr(p);
        setPeople(normalizedPeople);
        setSelectedPerson(firstPersonId);
        setEntryPersonId(firstPersonId);
        setSelected(closestMonthId(m.filter((item) => item.personId === firstPersonId)));
      } catch (error) {
        console.warn("Failed to load LinkedIn report data", error);
        const m = sortMonthsChronologically(seedMonths.map((item) => withPersonId(item)));
        const p = seedPR.map((item) => withPersonId(item));
        setMonths(m);
        setPr(p);
        setPeople([DEFAULT_PERSON]);
        setSelectedPerson(DEFAULT_PERSON_ID);
        setEntryPersonId(DEFAULT_PERSON_ID);
        setSelected(closestMonthId(m.filter((item) => item.personId === DEFAULT_PERSON_ID)));
      }
      setLoaded(true);
    })();
  }, []);

  async function persistReportData(nextMonths, nextPr, nextPeople = people) {
    setMonths(nextMonths);
    setPr(nextPr);
    setPeople(nextPeople);
    try {
      await apiRequest("/api/linkedin-report", {
        method: "PATCH",
        body: JSON.stringify({ months: nextMonths, pr: nextPr, people: nextPeople }),
      });
    } catch (error) {
      console.warn("Failed to save LinkedIn report data", error);
    }
  }

  async function persistMonths(next) {
    await persistReportData(next, pr);
  }

  const activePerson = people.find((person) => person.id === selectedPerson) || people[0] || DEFAULT_PERSON;
  const filteredMonths = useMemo(
    () => sortMonthsChronologically(months.filter((month) => (month.personId || DEFAULT_PERSON_ID) === selectedPerson)),
    [months, selectedPerson],
  );
  const filteredPr = useMemo(
    () => pr.filter((item) => (item.personId || DEFAULT_PERSON_ID) === selectedPerson),
    [pr, selectedPerson],
  );
  const withGrowth = useMemo(() => computeGrowth(filteredMonths), [filteredMonths]);
  const effectiveSelected = withGrowth.some((m) => m.id === selected) ? selected : closestMonthId(withGrowth);
  const current = withGrowth.find((m) => m.id === effectiveSelected);
  const postTotals = current?.postsList?.map((p) => Number(p.total) || 0) || [];
  const maxTotal = postTotals.length ? Math.max(...postTotals) : null;
  const minTotal = postTotals.length > 1 ? Math.min(...postTotals) : null;

  const sortedPosts = useMemo(() => {
    if (!current || !current.postsList?.length) return [];
    const arr = current.postsList.filter((post) => {
      if (postTagFilter === "all") return true;
      return effectivePostTag(post, maxTotal, minTotal) === postTagFilter;
    });
    arr.sort((a, b) => {
      const aValue = Number(a[sortKey]) || 0;
      const bValue = Number(b[sortKey]) || 0;
      return sortDir === "desc" ? bValue - aValue : aValue - bValue;
    });
    return arr;
  }, [current, sortKey, sortDir, postTagFilter, maxTotal, minTotal]);

  const currentImpressions = monthImpressions(current);
  const hasCurrentPosts = Boolean(current?.postsList?.length);

  useEffect(() => {
    if (!showEntryModal) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAddingPerson(false);
        setShowEntryModal(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showEntryModal]);

  if (!loaded) {
    return <div className="linkedin-report-loading">Завантаження звіту…</div>;
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  function handleSelectPerson(personId) {
    setSelectedPerson(personId);
    setEntryPersonId(personId);
    setSelected(closestMonthId(months.filter((month) => (month.personId || DEFAULT_PERSON_ID) === personId)));
    setEditingNotes(false);
  }

  function openEntryModal(type = tab === "pr" ? "pr" : "linkedin") {
    setEntryType(type);
    setEntryPersonId(selectedPerson);
    setAddingPerson(false);
    setNewMonth((current) => ({ ...current, label: current.label || currentMonthLabel() }));
    setNewPrPublication((current) => ({
      ...current,
      date: current.date || currentDateInputValue(),
    }));
    setShowEntryModal(true);
  }

  function closeEntryModal() {
    setAddingPerson(false);
    setShowEntryModal(false);
  }

  function startEditNotes() {
    if (!current) return;
    setDraftConclusions((current.conclusions || []).join("\n"));
    setEditingNotes(true);
  }
  async function saveNotes() {
    if (!current) return;
    const next = withGrowth.map((m) =>
      m.id === current.id
        ? { ...m, conclusions: draftConclusions.split("\n").map((s) => s.trim()).filter(Boolean) }
        : m
    );
    const mergedMonths = months.map((month) => {
      const updated = next.find((item) => item.id === month.id);
      return updated ? withoutGrowthFields(updated) : month;
    });
    await persistMonths(mergedMonths);
    setEditingNotes(false);
  }

  function updateNewPost(idx, field, val) {
    setNewPosts((arr) => arr.map((p, i) => (i === idx ? { ...p, [field]: val } : p)));
  }
  function addPostRow() {
    setNewPosts((arr) => [...arr, { ...emptyPost }]);
  }
  function removePostRow(idx) {
    setNewPosts((arr) => arr.filter((_, i) => i !== idx));
  }

  function updateNewPrPublication(field, value) {
    setNewPrPublication((current) => ({ ...current, [field]: value }));
  }

  async function saveNewPerson() {
    const name = newPerson.name.trim();
    if (!name) return;

    const person = {
      id: personIdFromName(name, people),
      name,
      role: newPerson.role.trim(),
    };
    const nextPeople = [...people, person];
    await persistReportData(months, pr, nextPeople);
    setSelectedPerson(person.id);
    setEntryPersonId(person.id);
    setSelected(null);
    setNewPerson(emptyPerson);
    setAddingPerson(false);
  }

  async function saveNewMonth() {
    if (!newMonth.label || !newMonth.followers) return;
    const personId = entryPersonId || selectedPerson || DEFAULT_PERSON_ID;
    const cleanPosts = newPosts
      .filter((p) => p.title && p.impressions)
      .map((p) => {
        const likes = Number(p.likes) || 0, comments = Number(p.comments) || 0, reposts = Number(p.reposts) || 0, saves = Number(p.saves) || 0, shares = Number(p.shares) || 0, clicks = Number(p.clicks) || 0;
        const impressions = Number(p.impressions) || 0;
        const total = likes + comments + reposts + saves + shares;
        const er = impressions ? (total / impressions) * 100 : 0;
        const tag = normalizePostTag(p.tag);
        return { title: p.title, impressions, clicks, likes, comments, reposts, saves, shares, total, er: Number(er.toFixed(2)), ...(tag ? { tag } : {}) };
      });
    const postsImpressions = sumPostMetric(cleanPosts, "impressions");
    const id = recordIdForPerson(personId, newMonth.label);
    const month = {
      id,
      personId,
      label: newMonth.label,
      posts: Number(newMonth.posts) || cleanPosts.length,
      followers: Number(newMonth.followers),
      views: newMonth.views ? Number(newMonth.views) : null,
      viewsDelta: null,
      impressionsOverview: newMonth.impressionsOverview ? Number(newMonth.impressionsOverview) : postsImpressions || null,
      impressionsDelta: null,
      postsList: cleanPosts,
      conclusions: [],
    };
    const nextMonthValue = monthValue(month);
    const next = sortMonthsChronologically(
      months.some((item) => (item.personId || DEFAULT_PERSON_ID) === personId && monthValue(item) === nextMonthValue)
        ? months.map((item) => ((item.personId || DEFAULT_PERSON_ID) === personId && monthValue(item) === nextMonthValue ? month : item))
        : [...months, month]
    );
    await persistMonths(next);
    setSelectedPerson(personId);
    setSelected(id);
    setTab("linkedin");
    setShowEntryModal(false);
    setNewMonth({ ...emptyMonth, label: currentMonthLabel() });
    setNewPosts([{ ...emptyPost }]);
  }

  async function savePrPublication() {
    if (!newPrPublication.date || !newPrPublication.source || !newPrPublication.title) return;
    const personId = entryPersonId || selectedPerson || DEFAULT_PERSON_ID;

    const nextPr = [
      ...pr,
      {
        personId,
        date: newPrPublication.date,
        source: newPrPublication.source,
        title: newPrPublication.title,
        url: normalizeUrl(newPrPublication.url),
        format: newPrPublication.format,
        views: newPrPublication.views ? Number(newPrPublication.views) : null,
        audience: newPrPublication.audience ? Number(newPrPublication.audience) : null,
      },
    ];

    await persistReportData(months, nextPr);
    setSelectedPerson(personId);
    setTab("pr");
    setShowEntryModal(false);
    setNewPrPublication({ ...emptyPrPublication, date: currentDateInputValue() });
  }

  const chartData = withGrowth.map((m) => ({ id: m.id, label: m.label.split(" ")[0].slice(0, 3), followers: m.followers }));
  const viewsChartData = withGrowth
    .filter((m) => m.views !== null && m.views !== undefined)
    .map((m) => ({ id: m.id, label: m.label.split(" ")[0].slice(0, 3), views: m.views }));
  const monthRailMonths = orderMonthsForRail(withGrowth);

  return (
    <div className="linkedin-report">
      <div className="li-actionbar">
        <div className="li-source-chip">
          <span className="li-pulse" />
          щомісячна статистика ведення сторінки
        </div>
        <div className="li-toolbar">
          <label className="li-person-select">
            <span>C-level</span>
            <select
              value={selectedPerson}
              onChange={(event) => handleSelectPerson(event.target.value)}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {personName(person)}
                </option>
              ))}
            </select>
          </label>
          <div className="li-seg" aria-label="Перемикання розділу звіту">
            {["linkedin", "pr"].map((t) => (
              <button
                key={t}
                type="button"
                className={tab === t ? "on" : ""}
                onClick={() => setTab(t)}
              >
                {t === "linkedin" ? "LinkedIn" : "PR-публікації"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="ymr-btn li-primary-btn li-add-entry-btn"
            onClick={() => openEntryModal()}
          >
            <Plus size={14} /> додати запис
          </button>
        </div>
      </div>

      {showEntryModal && (
        <div className="li-modal-overlay" role="presentation" onMouseDown={closeEntryModal}>
          <div
            aria-labelledby="li-entry-modal-title"
            aria-modal="true"
            className="li-modal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="li-modal-h">
              <div>
                <div id="li-entry-modal-title" className="li-card-t">Новий запис</div>
                <div className="li-card-sub">Оберіть тип і заповніть відповідні поля</div>
              </div>
              <button
                aria-label="Закрити модальне вікно"
                className="li-icon-btn"
                type="button"
                onClick={closeEntryModal}
              >
                <X size={14} />
              </button>
            </div>
            <div className="li-modal-body">
              <div className="li-entry-type" aria-label="Тип запису">
                {[
                  ["linkedin", "LinkedIn"],
                  ["pr", "PR-публікація"],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    className={entryType === type ? "on" : ""}
                    onClick={() => setEntryType(type)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className={`li-person-panel ${addingPerson ? "is-adding" : "is-choosing"}`}>
                {addingPerson ? (
                  <div className="li-new-person-grid">
                    <label className="li-field">Нова C-level людина
                      <input
                        className="ymr-input"
                        placeholder="Імʼя та прізвище"
                        value={newPerson.name}
                        onChange={(event) => setNewPerson({ ...newPerson, name: event.target.value })}
                      />
                    </label>
                    <label className="li-field">Роль
                      <input
                        className="ymr-input"
                        placeholder="CEO / CFO / CMO"
                        value={newPerson.role}
                        onChange={(event) => setNewPerson({ ...newPerson, role: event.target.value })}
                      />
                    </label>
                    <button className="ymr-btn li-primary-btn" type="button" onClick={saveNewPerson}>
                      <Plus size={13} /> зберегти людину
                    </button>
                    <button className="ymr-btn" type="button" onClick={() => setAddingPerson(false)}>
                      обрати існуючу
                    </button>
                  </div>
                ) : (
                  <>
                    <label className="li-field">C-level людина
                      <select
                        className="ymr-input"
                        value={entryPersonId}
                        onChange={(event) => setEntryPersonId(event.target.value)}
                      >
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {personName(person)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="ymr-btn"
                      type="button"
                      onClick={() => {
                        setNewPerson(emptyPerson);
                        setAddingPerson(true);
                      }}
                    >
                      <Plus size={13} /> додати людину
                    </button>
                  </>
                )}
              </div>

              {entryType === "linkedin" ? (
                <>
                  <div className="li-form-grid">
                    <label className="li-field">Назва
                      <input className="ymr-input" placeholder="Липень 2026" value={newMonth.label} onChange={(e) => setNewMonth({ ...newMonth, label: e.target.value })} />
                    </label>
                    <label className="li-field">Фоловери
                      <input className="ymr-input" type="number" value={newMonth.followers} onChange={(e) => setNewMonth({ ...newMonth, followers: e.target.value })} />
                    </label>
                    <label className="li-field">Публікації
                      <input className="ymr-input" type="number" value={newMonth.posts} onChange={(e) => setNewMonth({ ...newMonth, posts: e.target.value })} />
                    </label>
                    <label className="li-field">Views
                      <input className="ymr-input" type="number" value={newMonth.views} onChange={(e) => setNewMonth({ ...newMonth, views: e.target.value })} />
                    </label>
                  </div>
                  <div className="li-form-section-title">Дописи</div>
                  <div className="li-post-form-list">
                    {newPosts.map((p, i) => (
                      <div key={i} className="li-post-form-row">
                        <input className="ymr-input" placeholder="назва допису" value={p.title} onChange={(e) => updateNewPost(i, "title", e.target.value)} />
                        <input className="ymr-input" placeholder="покази" type="number" value={p.impressions} onChange={(e) => updateNewPost(i, "impressions", e.target.value)} />
                        <input className="ymr-input" placeholder="лайки" type="number" value={p.likes} onChange={(e) => updateNewPost(i, "likes", e.target.value)} />
                        <input className="ymr-input" placeholder="коменти" type="number" value={p.comments} onChange={(e) => updateNewPost(i, "comments", e.target.value)} />
                        <input className="ymr-input" placeholder="репости" type="number" value={p.reposts} onChange={(e) => updateNewPost(i, "reposts", e.target.value)} />
                        <input className="ymr-input" placeholder="збереж." type="number" value={p.saves} onChange={(e) => updateNewPost(i, "saves", e.target.value)} />
                        <input className="ymr-input" placeholder="поширення" type="number" value={p.shares} onChange={(e) => updateNewPost(i, "shares", e.target.value)} />
                        <select className="ymr-input" value={p.tag} onChange={(e) => updateNewPost(i, "tag", e.target.value)}>
                          <option value="">без тегу</option>
                          <option value="top">топ</option>
                          <option value="antitop">антитоп</option>
                        </select>
                        <button
                          aria-label="Видалити рядок допису"
                          className="li-icon-btn"
                          type="button"
                          onClick={() => removePostRow(i)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="li-actions">
                    <button className="ymr-btn" type="button" onClick={addPostRow}>
                      <Plus size={13} /> рядок
                    </button>
                  </div>
                  <div className="li-help-text">ER і разом рахуються автоматично на основі лайків, коментарів, репостів, збережень і поширень.</div>
                </>
              ) : (
                <div className="li-pr-form-grid">
                  <label className="li-field">Дата
                    <input className="ymr-input" type="date" value={newPrPublication.date} onChange={(e) => updateNewPrPublication("date", e.target.value)} />
                  </label>
                  <label className="li-field">Джерело
                    <input className="ymr-input" placeholder="Forbes" value={newPrPublication.source} onChange={(e) => updateNewPrPublication("source", e.target.value)} />
                  </label>
                  <label className="li-field">Лінк
                    <input className="ymr-input" placeholder="https://..." value={newPrPublication.url} onChange={(e) => updateNewPrPublication("url", e.target.value)} />
                  </label>
                  <label className="li-field li-field-wide">Матеріал
                    <input className="ymr-input" placeholder="Назва матеріалу" value={newPrPublication.title} onChange={(e) => updateNewPrPublication("title", e.target.value)} />
                  </label>
                  <label className="li-field">Формат
                    <input className="ymr-input" placeholder="стаття / колонка / подкаст" value={newPrPublication.format} onChange={(e) => updateNewPrPublication("format", e.target.value)} />
                  </label>
                  <label className="li-field">Перегляди
                    <input className="ymr-input" type="number" value={newPrPublication.views} onChange={(e) => updateNewPrPublication("views", e.target.value)} />
                  </label>
                  <label className="li-field">Аудиторія джерела
                    <input className="ymr-input" type="number" value={newPrPublication.audience} onChange={(e) => updateNewPrPublication("audience", e.target.value)} />
                  </label>
                </div>
              )}
            </div>
            <div className="li-modal-footer">
              <button className="ymr-btn" type="button" onClick={closeEntryModal}>
                скасувати
              </button>
              <button
                className="ymr-btn li-primary-btn"
                type="button"
                onClick={entryType === "linkedin" ? saveNewMonth : savePrPublication}
              >
                <Save size={13} /> зберегти
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === "linkedin" && (
        <>
          <div className="li-mrail">
            {monthRailMonths.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`li-mpill ${m.id === effectiveSelected ? "on" : ""}`}
                onClick={() => setSelected(m.id)}
              >
                <span className="li-mpill-label">
                  {m.label.split(" ")[0].slice(0, 3)} {m.label.split(" ")[1]}
                </span>
                <span className="li-mpill-pct ymr-mono">
                  {m.pct !== null ? fmtPct(m.pct) : "старт"}
                </span>
              </button>
            ))}
          </div>

          {current ? (
            <>
              <div className="li-hero-grid">
                <div className="li-card li-followers-card">
                  <div className="li-card-h">
                    <div>
                      <div className="li-card-t">{current.label} · підписники</div>
                      <div className="li-card-sub">{personName(activePerson)} · обраний місяць</div>
                    </div>
                  </div>
                  <div className="li-card-body">
                    <div className="li-foll ymr-mono">{fmt(current.followers)}</div>
                    {current.delta !== null && (
                      <div className="li-delta-row">
                        <span className={`li-follbadge ${current.delta >= 0 ? "lb-up" : "lb-dn"}`}>
                          {current.delta >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />} {fmt(Math.abs(current.delta))} ({fmtPct(current.pct)})
                        </span>
                        <span className="li-muted">за місяць</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="li-card li-chart-card">
                  <div className="li-card-h">
                    <div>
                      <div className="li-card-t">Ріст фоловерів, увесь період</div>
                      <div className="li-card-sub">{personName(activePerson)}</div>
                    </div>
                  </div>
                  <div className="li-card-body">
                    <div className="li-chart-wrap">
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ymrGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={TOKENS.indigo} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={TOKENS.indigo} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={TOKENS.lineSoft} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: TOKENS.inkSoft }} axisLine={{ stroke: TOKENS.line }} tickLine={false} />
                          <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
                          <Tooltip formatter={(v) => fmt(v)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 4, border: `1px solid ${TOKENS.line}` }} />
                          <Area type="monotone" dataKey="followers" stroke={TOKENS.indigo} strokeWidth={2} fill="url(#ymrGrad)" dot={false} />
                          <ReferenceDot x={current.label.split(" ")[0].slice(0, 3)} y={current.followers} r={4} fill={TOKENS.gold} stroke={TOKENS.paperCard} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="li-card li-chart-card">
                  <div className="li-card-h">
                    <div>
                      <div className="li-card-t">Перегляди, увесь період</div>
                      <div className="li-card-sub">{personName(activePerson)}</div>
                    </div>
                  </div>
                  <div className="li-card-body">
                    <div className="li-chart-wrap">
                      <ResponsiveContainer width="100%" height={150}>
                        <AreaChart data={viewsChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="ymrViewsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={TOKENS.sage} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={TOKENS.sage} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={TOKENS.lineSoft} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: TOKENS.inkSoft }} axisLine={{ stroke: TOKENS.line }} tickLine={false} />
                          <YAxis hide domain={["dataMin - 200", "dataMax + 200"]} />
                          <Tooltip formatter={(v) => fmt(v)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12, borderRadius: 4, border: `1px solid ${TOKENS.line}` }} />
                          <Area type="monotone" dataKey="views" stroke={TOKENS.sage} strokeWidth={2} fill="url(#ymrViewsGrad)" dot={false} />
                          {current.views !== null && current.views !== undefined && (
                            <ReferenceDot x={current.label.split(" ")[0].slice(0, 3)} y={current.views} r={4} fill={TOKENS.gold} stroke={TOKENS.paperCard} />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>

              <div className="li-side-stats">
                <div className="li-stat-card">
                  <div className="li-stat-label">Публікації за місяць</div>
                  <div className="li-stat-value ymr-mono">{current.posts}</div>
                </div>
                <div className="li-stat-card">
                  <div className="li-stat-label">Перегляди (views)</div>
                  <div className="li-stat-value ymr-mono">{fmt(current.views)}</div>
                  {current.viewsDelta !== null && current.viewsDelta !== undefined && (
                    <div className={`li-stat-delta ${current.viewsDelta >= 0 ? "up" : "dn"}`}>{fmtPct(current.viewsDelta)} до попер. місяця</div>
                  )}
                </div>
                <div className="li-stat-card">
                  <div className="li-stat-label">Покази (impressions)</div>
                  <div className="li-stat-value ymr-mono">{fmt(currentImpressions)}</div>
                  {current.impressionsDelta !== null && current.impressionsDelta !== undefined && (
                    <div className={`li-stat-delta ${current.impressionsDelta >= 0 ? "up" : "dn"}`}>{fmtPct(current.impressionsDelta)} до попер. місяця</div>
                  )}
                </div>
              </div>

          {hasCurrentPosts ? (
            <div className="li-card li-table-card">
              <div className="li-card-h">
                <div>
                  <div className="li-card-t">Дописи місяця</div>
                  <div className="li-card-sub">{personName(activePerson)} · відсортовано за сумарним залученням</div>
                </div>
                <label className="li-tag-filter">
                  <span>Фільтр</span>
                  <select value={postTagFilter} onChange={(event) => setPostTagFilter(event.target.value)}>
                    <option value="all">усі</option>
                    <option value="top">топ</option>
                    <option value="antitop">антитоп</option>
                  </select>
                </label>
              </div>
              <div className="li-table-scroll">
                <table className="li-ptbl">
                  <thead>
                    <tr>
                      <th className="l">Допис</th>
                      {[["impressions", "Покази"], ["likes", "Лайки"], ["comments", "Коменти"], ["reposts", "Репости"], ["saves", "Збереж."], ["shares", "Поширення"], ["total", "Разом"], ["er", "ER"]].map(([k, label]) => (
                      <th key={k} className="ymr-th" onClick={() => toggleSort(k)}>
                        {label} {sortKey === k ? (sortDir === "desc" ? <ChevronDown size={11} style={{ display: "inline" }} /> : <ChevronUp size={11} style={{ display: "inline" }} />) : null}
                      </th>
                    ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPosts.length ? sortedPosts.map((p, i) => {
                      const tag = effectivePostTag(p, maxTotal, minTotal);
                      return (
                        <tr key={i}>
                          <td className="l">
                            {p.title}
                            {tag && (
                              <span className={`li-ptag ${tag === "top" ? "li-ptop" : "li-pbot"}`}>{postTagLabel(tag)}</span>
                            )}
                          </td>
                          <td className="ymr-mono">{fmt(p.impressions)}</td>
                          <td className="ymr-mono">{fmt(p.likes)}</td>
                          <td className="ymr-mono">{fmt(p.comments)}</td>
                          <td className="ymr-mono">{fmt(p.reposts)}</td>
                          <td className="ymr-mono">{fmt(p.saves)}</td>
                          <td className="ymr-mono">{fmt(p.shares)}</td>
                          <td className="ymr-mono tot">{fmt(p.total)}</td>
                          <td className="ymr-mono">{p.er.toFixed(2)}%</td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td className="li-empty" colSpan={9}>Немає дописів за цим фільтром.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="li-card">
              <div className="li-card-body li-empty">Детальних даних по дописах за цей місяць ще немає.</div>
            </div>
          )}

          <div className="li-notes-grid">
            <div className="li-card">
              <div className="li-card-h">
                <div className="li-card-t">Висновки</div>
                {!editingNotes && (
                  <button
                    aria-label="Редагувати висновки"
                    className="ymr-btn li-small-btn"
                    type="button"
                    onClick={startEditNotes}
                  >
                    <Pencil size={12} /> редагувати
                  </button>
                )}
              </div>
              <div className="li-card-body">
                {editingNotes ? (
                  <textarea className="ymr-textarea" value={draftConclusions} onChange={(e) => setDraftConclusions(e.target.value)} placeholder="один висновок на рядок" />
                ) : (current.conclusions || []).length ? (
                  <ul className="li-notes-list">
                    {current.conclusions.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                ) : (
                  <div className="li-empty">Немає записів за цей місяць</div>
                )}
              </div>
            </div>
          </div>
          {editingNotes && (
            <div className="li-actions">
              <button className="ymr-btn li-primary-btn" type="button" onClick={saveNotes}><Save size={13} /> зберегти</button>
              <button className="ymr-btn" type="button" onClick={() => setEditingNotes(false)}>скасувати</button>
            </div>
          )}
            </>
          ) : (
            <div className="li-card li-empty-person">
              <div className="li-card-body">
                <div className="li-card-t">Для {personName(activePerson)} ще немає LinkedIn-статистики</div>
                <div className="li-card-sub">Додайте перший місяць для цієї C-level людини, щоб побачити графік і таблицю постів.</div>
                <button
                  className="ymr-btn li-primary-btn"
                  type="button"
                  onClick={() => openEntryModal("linkedin")}
                >
                  <Plus size={13} /> додати LinkedIn-запис
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "pr" && (
        <div className="li-card li-table-card">
          <div className="li-card-h">
            <div>
              <div className="li-card-t">Публікації у медіа</div>
              <div className="li-card-sub">{personName(activePerson)} · PR-згадки та колонки · весь період</div>
            </div>
          </div>
          <div className="li-table-scroll">
            <table className="li-ptbl">
              <thead>
                <tr>
                  <th className="l">Дата</th>
                  <th className="l">Джерело</th>
                  <th className="l">Матеріал</th>
                  <th className="l">Формат</th>
                  <th>Перегляди</th>
                  <th>Аудиторія джерела</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredPr].sort((a, b) => new Date(a.date) - new Date(b.date)).map((r, i) => (
                  <tr key={i}>
                    <td className="l ymr-mono nowrap">{r.date}</td>
                    <td className="l source">{r.source}</td>
                    <td className="l normal-weight">
                      {r.url ? (
                        <a className="li-material-link" href={r.url} rel="noreferrer" target="_blank">{r.title}</a>
                      ) : (
                        r.title
                      )}
                    </td>
                    <td className="l muted normal-weight">{r.format}</td>
                    <td className="ymr-mono">{fmt(r.views)}</td>
                    <td className="ymr-mono">{fmt(r.audience)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredPr.length && (
            <div className="li-card-body li-empty">
              Для цієї C-level людини ще немає PR-публікацій.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
