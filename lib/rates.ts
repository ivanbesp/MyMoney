import { CurrencyRates } from './types';

/**
 * Загрузка курсов валют из открытых источников — без ключей и без бэкенда,
 * потому что приложение может жить статикой на GitHub Pages.
 *
 * Важно: курс каждой операции зафиксирован в самой записи, поэтому обновление
 * курсов НЕ переписывает историю. Оно влияет только на новые записи, на пересчёт
 * лимитов и на остатки валютных счетов.
 */

export interface FetchedRates {
  rates: CurrencyRates;
  /** Человекочитаемое название источника, показывается в настройках */
  source: string;
  /** Дата, на которую источник даёт курс (не момент запроса) */
  rateDate?: string;
  fetchedAt: string;
}

const TIMEOUT_MS = 8000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Курсы правдоподобны? Защита от мусора и от источников без рубля. */
function validate(rates: Partial<CurrencyRates>): CurrencyRates | null {
  const usd = num(rates.USD);
  const eur = num(rates.EUR);
  if (usd === null || eur === null) return null;
  // Рубль за доллар исторически в диапазоне единиц–сотен. Если пришло 0.011,
  // значит источник отдал обратный курс, и лучше отбраковать, чем сломать все суммы.
  if (usd < 1 || usd > 100000 || eur < 1 || eur > 100000) return null;
  return { USD: usd, EUR: eur };
}

interface Provider {
  name: string;
  url: string;
  parse: (json: unknown) => { rates: CurrencyRates; rateDate?: string } | null;
}

/**
 * Порядок неслучаен: сначала официальный курс ЦБ — именно его ожидает увидеть
 * пользователь в России. Дальше запасные варианты на случай, если ЦБ не отдаёт
 * заголовки CORS или недоступен.
 */
const PROVIDERS: Provider[] = [
  {
    name: 'ЦБ РФ',
    url: 'https://www.cbr-xml-daily.ru/daily_json.js',
    parse: json => {
      if (!isRecord(json) || !isRecord(json.Valute)) return null;
      const valute = json.Valute;
      const read = (code: string): number | null => {
        const item = valute[code];
        if (!isRecord(item)) return null;
        const value = num(item.Value);
        // Nominal у некоторых валют равен 10 или 100 — курс дают за пачку
        const nominal = num(item.Nominal) ?? 1;
        return value === null ? null : value / nominal;
      };
      const rates = validate({ USD: read('USD') ?? undefined, EUR: read('EUR') ?? undefined });
      if (!rates) return null;
      const date = typeof json.Date === 'string' ? json.Date.slice(0, 10) : undefined;
      return { rates, rateDate: date };
    },
  },
  {
    name: 'ExchangeRate-API',
    url: 'https://open.er-api.com/v6/latest/RUB',
    parse: json => {
      if (!isRecord(json) || !isRecord(json.rates)) return null;
      // Ответ даёт «сколько валюты за 1 рубль», нам нужно наоборот
      const usdPerRub = num(json.rates.USD);
      const eurPerRub = num(json.rates.EUR);
      if (usdPerRub === null || eurPerRub === null) return null;
      const rates = validate({ USD: 1 / usdPerRub, EUR: 1 / eurPerRub });
      if (!rates) return null;
      const date = typeof json.time_last_update_utc === 'string'
        ? new Date(json.time_last_update_utc).toISOString().slice(0, 10)
        : undefined;
      return { rates, rateDate: date };
    },
  },
  {
    name: 'Frankfurter',
    // ЕЦБ не публикует курс рубля с 2022 года, поэтому источник запасной:
    // если рубля в ответе нет, validate() его отбракует
    url: 'https://api.frankfurter.dev/v1/latest?base=RUB&symbols=USD,EUR',
    parse: json => {
      if (!isRecord(json) || !isRecord(json.rates)) return null;
      const usdPerRub = num(json.rates.USD);
      const eurPerRub = num(json.rates.EUR);
      if (usdPerRub === null || eurPerRub === null) return null;
      const rates = validate({ USD: 1 / usdPerRub, EUR: 1 / eurPerRub });
      if (!rates) return null;
      return { rates, rateDate: typeof json.date === 'string' ? json.date : undefined };
    },
  },
];

async function tryProvider(p: Provider): Promise<FetchedRates | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(p.url, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return null;
    const parsed = p.parse(await res.json());
    if (!parsed) return null;
    return {
      rates: parsed.rates,
      rateDate: parsed.rateDate,
      source: p.name,
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    // Сетевая ошибка, отвалившийся CORS, таймаут, битый JSON — идём к следующему
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Перебирает источники по очереди и возвращает первый удачный */
export async function fetchRates(): Promise<FetchedRates | null> {
  for (const provider of PROVIDERS) {
    const result = await tryProvider(provider);
    if (result) return result;
  }
  return null;
}

/** Экспортируется для тестов: разбор ответа конкретного источника */
export const PROVIDERS_FOR_TEST = PROVIDERS;

/** Пора ли обновляться. По умолчанию раз в 12 часов — курс меняется раз в сутки. */
export function ratesAreStale(updatedAt: string | undefined, maxAgeHours = 12): boolean {
  if (!updatedAt) return true;
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > maxAgeHours * 3600_000;
}

/** «3 часа назад», «вчера» — для подписи под курсами */
export function formatAgo(iso: string | undefined): string {
  if (!iso) return 'ещё не обновлялись';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return 'ещё не обновлялись';
  const minutes = Math.floor((Date.now() - ts) / 60000);
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  return `${days} дн. назад`;
}
