import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { Period, Settings, Transaction } from './types';
import { filterByPeriod, txInBase } from './storage';
import { dayKey, monthKey, todayKey } from './dates';

export interface TimelinePoint {
  key: string;
  label: string;
  income: number;
  expense: number;
  /** Корзина целиком в будущем — рисуем её бледной и не берём в среднее */
  future: boolean;
  /** Корзина, в которую попадает сегодня */
  current: boolean;
}

/**
 * Разбивка периода на столбики: дни для недели и месяца, месяцы для года и
 * «всего времени» (последние 12). Ключи строятся локальным format(), а не
 * toISOString(): из-за UTC-конвертации столбцы уезжали на день в UTC+ зонах.
 */
export function buildTimeline(
  transactions: Transaction[],
  period: Period,
  settings: Settings,
  dateLocale: Locale,
  now: Date = new Date(),
): { points: TimelinePoint[]; byMonth: boolean } {
  // «День» одним столбиком ничего не показывает — берём неделю вокруг него
  const p: Period = period === 'day' ? 'week' : period;
  let intervals: Date[];
  let labelFmt: string;
  let byMonth = false;

  if (p === 'week') {
    intervals = eachDayOfInterval({ start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
    labelFmt = 'EEEEEE';
  } else if (p === 'month') {
    intervals = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
    labelFmt = 'd';
  } else if (p === 'year') {
    intervals = eachMonthOfInterval({ start: startOfYear(now), end: endOfYear(now) });
    labelFmt = 'LLL';
    byMonth = true;
  } else {
    intervals = eachMonthOfInterval({ start: new Date(now.getFullYear() - 1, now.getMonth() + 1, 1), end: now });
    labelFmt = 'LLL yy';
    byMonth = true;
  }

  const txs = p === 'all' ? transactions : filterByPeriod(transactions, p, now);
  const income = new Map<string, number>();
  const expense = new Map<string, number>();
  for (const t of txs) {
    const key = byMonth ? t.date.slice(0, 7) : t.date;
    const target = t.type === 'income' ? income : expense;
    target.set(key, (target.get(key) ?? 0) + txInBase(t, settings));
  }

  const today = todayKey();
  const thisMonth = monthKey(now);
  const points = intervals.map(date => {
    const key = byMonth ? monthKey(date) : dayKey(date);
    const current = byMonth ? key === thisMonth : key === today;
    const future = byMonth ? key > thisMonth : key > today;
    return {
      key,
      label: format(date, labelFmt, { locale: dateLocale }),
      income: income.get(key) ?? 0,
      expense: expense.get(key) ?? 0,
      future,
      current,
    };
  });
  return { points, byMonth };
}
