import {
  format, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfYear, endOfYear, isValid, subDays, subWeeks, subMonths, subYears,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { Period } from './types';

/**
 * Все даты в приложении — КАЛЕНДАРНЫЕ, в локальном времени пользователя,
 * в виде строки 'YYYY-MM-DD'.
 *
 * Раньше дата писалась как `new Date('2026-08-10').toISOString()`, то есть
 * полночь по UTC. Дальше её сравнивали с локальными полуночами, и запись
 * уезжала на соседний день: в UTC+ ломался график, в UTC− — фильтр «Сегодня».
 * Поэтому здесь нигде нет toISOString() — только локальный format() из date-fns.
 */

export const DAY = 'yyyy-MM-dd';
export const MONTH = 'yyyy-MM';

/** Локальная календарная дата → 'YYYY-MM-DD' */
export const dayKey = (d: Date): string => format(d, DAY);

/** Локальный месяц → 'YYYY-MM' */
export const monthKey = (d: Date): string => format(d, MONTH);

/** Сегодня в локальном времени */
export const todayKey = (): string => dayKey(new Date());

/** 'YYYY-MM-DD' → Date на локальную полночь */
export const parseDay = (key: string): Date => parseISO(key);

/**
 * Приводит любое унаследованное значение к 'YYYY-MM-DD'.
 * Старые записи хранили полночь UTC ('2026-08-10T00:00:00.000Z'), поэтому
 * первые 10 символов и есть та дата, которую пользователь вводил в форму.
 */
export function normalizeDate(value: unknown, fallback: string = todayKey()): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const head = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(head) && isValid(parseISO(head))) return head;
  const parsed = new Date(value);
  return isValid(parsed) ? dayKey(parsed) : fallback;
}

/** Границы периода в виде ключей 'YYYY-MM-DD'. null — период без границ. */
export function periodRange(period: Period, now: Date = new Date()): { from: string; to: string } | null {
  switch (period) {
    case 'day':   return { from: dayKey(now), to: dayKey(now) };
    case 'week':  return { from: dayKey(startOfWeek(now, { weekStartsOn: 1 })), to: dayKey(endOfWeek(now, { weekStartsOn: 1 })) };
    case 'month': return { from: dayKey(startOfMonth(now)), to: dayKey(endOfMonth(now)) };
    case 'year':  return { from: dayKey(startOfYear(now)), to: dayKey(endOfYear(now)) };
    default:      return null;
  }
}

/** Тот же период, сдвинутый на шаг назад — для сравнения «к прошлому месяцу» */
export function previousPeriodRange(period: Period, now: Date = new Date()) {
  switch (period) {
    case 'day':   return periodRange('day', subDays(now, 1));
    case 'week':  return periodRange('week', subWeeks(now, 1));
    case 'month': return periodRange('month', subMonths(now, 1));
    case 'year':  return periodRange('year', subYears(now, 1));
    default:      return null;
  }
}

/** Человеческое название предыдущего периода: «к июлю», «к прошлой неделе» */
export function previousPeriodLabel(period: Period, now: Date = new Date()): string | null {
  switch (period) {
    case 'day':   return 'ко вчера';
    case 'week':  return 'к прошлой неделе';
    case 'month': return 'к ' + format(subMonths(now, 1), 'LLLL', { locale: ru });
    case 'year':  return 'к ' + format(subYears(now, 1), 'yyyy');
    default:      return null;
  }
}
