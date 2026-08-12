'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  AppData, BackupFile, Transaction, Category, PiggyBank, Budget, Account, Transfer, Period,
  Settings, DEFAULT_SETTINGS, Currency, CURRENCY_SYMBOLS, CurrencyRates,
  ThemeMode, THEME_MODES, BUDGET_WARN_THRESHOLD, AccountKind,
} from './types';
import {
  DEFAULT_CATEGORIES, SAVINGS_IN_CATEGORY_ID, SAVINGS_OUT_CATEGORY_ID,
  DEFAULT_ACCOUNT_ID, makeDefaultAccount,
} from './defaults';
import { normalizeDate, periodRange } from './dates';
import { getNumberLocale } from './format';

const STORAGE_KEY = 'finance_tracker_data';
const SETTINGS_KEY = 'finance_tracker_settings';
/** Снимок данных в том виде, в каком они были до первой миграции. Страховка. */
const PRE_MIGRATION_KEY = 'finance_tracker_backup_pre_v2';

export const SCHEMA_VERSION = 5;

const defaultData: AppData = {
  version: SCHEMA_VERSION,
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  piggyBanks: [],
  budgets: [],
  accounts: [makeDefaultAccount(DEFAULT_SETTINGS.baseCurrency)],
  transfers: [],
};

// ─── Курсы ────────────────────────────────────────────────────────────────────

/** Защита от нуля/NaN в настройках: иначе деление даёт Infinity и ломает весь UI */
export function safeRates(rates: Partial<CurrencyRates> | undefined): CurrencyRates {
  const pick = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    USD: pick(rates?.USD, DEFAULT_SETTINGS.rates.USD),
    EUR: pick(rates?.EUR, DEFAULT_SETTINGS.rates.EUR),
  };
}

/** Сколько рублей стоит 1 единица валюты */
export function rateFor(currency: Currency, rates: CurrencyRates): number {
  return currency === 'RUB' ? 1 : safeRates(rates)[currency];
}

/**
 * Курс операции: зафиксированный в момент создания, иначе текущий.
 * Именно благодаря снимку правка курсов в настройках не переписывает историю.
 */
export function txRate(tx: Transaction, rates: CurrencyRates): number {
  const stored = Number(tx.rate);
  if (Number.isFinite(stored) && stored > 0) return stored;
  return rateFor(tx.currency, rates);
}

/** Сумма операции в рублях (внутренняя ось пересчёта) */
export function txToRub(tx: Transaction, rates: CurrencyRates): number {
  return tx.amount * txRate(tx, rates);
}

/** Рубли → валюта отображения */
export function rubTo(rubAmount: number, target: Currency, rates: CurrencyRates): number {
  return target === 'RUB' ? rubAmount : rubAmount / rateFor(target, rates);
}

/** Сумма операции в валюте отображения, с учётом зафиксированного курса */
export function txInBase(tx: Transaction, settings: Settings): number {
  return rubTo(txToRub(tx, settings.rates), settings.baseCurrency, settings.rates);
}

/**
 * Сумма операции в произвольной валюте — нужно для остатка по счёту.
 * Когда валюта совпадает, берём номинал без пересчёта: иначе после правки
 * курсов рублёвая покупка с рублёвого счёта начала бы «дышать» на копейки.
 */
export function txInCurrency(tx: Transaction, target: Currency, rates: CurrencyRates): number {
  if (tx.currency === target) return tx.amount;
  return rubTo(txToRub(tx, rates), target, rates);
}

/** Разовый пересчёт по ТЕКУЩЕМУ курсу (копилки, предпросмотр в формах) */
export function convertAmount(amount: number, from: Currency, to: Currency, rates: CurrencyRates): number {
  if (from === to) return amount;
  return rubTo(amount * rateFor(from, rates), to, rates);
}

/** @deprecated оставлено для совместимости — используйте txToRub */
export function toRub(amount: number, currency: Currency, rates: CurrencyRates): number {
  return amount * rateFor(currency, rates);
}

export function fromRub(rubAmount: number, target: Currency, rates: CurrencyRates): number {
  return rubTo(rubAmount, target, rates);
}

// ─── Форматирование ───────────────────────────────────────────────────────────

export function formatMoney(amount: number, currency: Currency = 'RUB'): string {
  const value = Number.isFinite(amount) ? amount : 0;
  const sym = CURRENCY_SYMBOLS[currency];
  // Копейки показываем только когда они есть: «11 ₽», но «10,5 ₽».
  // Разделители зависят от языка интерфейса: 1 234,56 против 1,234.56
  const formatted = new Intl.NumberFormat(getNumberLocale(), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return currency === 'RUB' ? formatted + ' ' + sym : sym + ' ' + formatted;
}

/** «100 $ ≈ 9 000 ₽» — исходная сумма плюс эквивалент, если валюты разные */
export function formatTxAmount(tx: Transaction, settings: Settings): string {
  const original = formatMoney(tx.amount, tx.currency);
  if (tx.currency === settings.baseCurrency) return original;
  return `${original} ≈ ${formatMoney(txInBase(tx, settings), settings.baseCurrency)}`;
}

// ─── Хранилище ────────────────────────────────────────────────────────────────

type StorageErrorHandler = (message: string) => void;

function readJSON<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown, onError?: StorageErrorHandler): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    const quota = e instanceof DOMException &&
      (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    // Отдаём КЛЮЧ перевода: этот модуль не React и про выбранный язык не знает
    onError?.(quota ? 'storage.quota' : 'storage.failed');
    return false;
  }
}

// ─── Миграции ─────────────────────────────────────────────────────────────────

/** Системные категории движения в копилки — добавляем, если их ещё нет */
function ensureSystemCategories(categories: Category[]): Category[] {
  const missing = DEFAULT_CATEGORIES.filter(
    d => (d.id === SAVINGS_OUT_CATEGORY_ID || d.id === SAVINGS_IN_CATEGORY_ID)
      && !categories.some(c => c.id === d.id),
  );
  return missing.length ? [...categories, ...missing] : categories;
}

/**
 * v1 → v2:
 *  • date: полночь UTC ('...T00:00:00.000Z') → календарное 'YYYY-MM-DD'
 *  • rate: проставляем текущий курс, чтобы история перестала «плавать»
 *    при каждой правке курсов. Значения на экране при этом не меняются —
 *    ровно то же, что приложение показывало до миграции.
 *  • currency: у совсем старых записей поля не было → RUB
 *
 * v2 → v3:
 *  • появляются системные категории «В копилку» / «Из копилки»
 */
const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function migrate(
  raw: Partial<AppData> | null,
  rates: CurrencyRates,
  fallbackCurrency: Currency = 'RUB',
): AppData {
  if (!raw || typeof raw !== 'object') {
    return { ...defaultData, accounts: [makeDefaultAccount(fallbackCurrency)] };
  }

  const safe = safeRates(rates);
  const transactions: Transaction[] = (Array.isArray(raw.transactions) ? raw.transactions : []).map(t => {
    const currency: Currency = (t?.currency ?? 'RUB') as Currency;
    const storedRate = Number(t?.rate);
    return {
      ...t,
      currency,
      rate: Number.isFinite(storedRate) && storedRate > 0 ? storedRate : rateFor(currency, safe),
      date: normalizeDate(t?.date, normalizeDate(t?.createdAt)),
      createdAt: t?.createdAt ?? new Date().toISOString(),
      amount: Number(t?.amount) || 0,
    } as Transaction;
  });

  const piggyBanks: PiggyBank[] = (Array.isArray(raw.piggyBanks) ? raw.piggyBanks : []).map(pb => ({
    ...pb,
    targetCurrency: (pb?.targetCurrency ?? 'RUB') as Currency,
    currentCurrency: (pb?.currentCurrency ?? pb?.targetCurrency ?? 'RUB') as Currency,
    deadline: pb?.deadline ? normalizeDate(pb.deadline) : undefined,
  })) as PiggyBank[];

  const categories = ensureSystemCategories(
    Array.isArray(raw.categories) && raw.categories.length ? raw.categories : DEFAULT_CATEGORIES,
  );

  // v4 → v5: появились счета. Все прежние записи переезжают на «Основной».
  const rawAccounts = Array.isArray(raw.accounts) ? raw.accounts.filter(Boolean) : [];
  const accounts: Account[] = rawAccounts.length
    ? rawAccounts.map(a => ({
        id: a.id ?? DEFAULT_ACCOUNT_ID,
        name: a.name ?? 'Счёт',
        kind: (a.kind ?? 'other') as AccountKind,
        currency: (a.currency ?? 'RUB') as Currency,
        openingBalance: Number(a.openingBalance) || 0,
        color: a.color ?? '#7EB8D4',
        createdAt: a.createdAt ?? new Date().toISOString(),
      }))
    : [makeDefaultAccount(fallbackCurrency)];
  const accountIds = new Set(accounts.map(a => a.id));
  const homeAccount = accounts[0].id;
  for (const t of transactions) {
    // Счёт мог быть удалён вручную в файле копии — не теряем запись
    if (!t.accountId || !accountIds.has(t.accountId)) t.accountId = homeAccount;
  }

  const transfers: Transfer[] = (Array.isArray(raw.transfers) ? raw.transfers : [])
    .filter(t => t && accountIds.has(t.fromAccountId) && accountIds.has(t.toAccountId)
      && Number(t.amountFrom) > 0 && Number(t.amountTo) > 0)
    .map(t => ({
      id: t.id ?? uid(),
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      amountFrom: Number(t.amountFrom),
      amountTo: Number(t.amountTo),
      date: normalizeDate(t.date),
      note: t.note,
      createdAt: t.createdAt ?? new Date().toISOString(),
    }));

  // v3 → v4: появились бюджеты. У старых данных поля просто нет.
  const budgets: Budget[] = (Array.isArray(raw.budgets) ? raw.budgets : [])
    .filter(b => b && typeof b.categoryId === 'string' && Number(b.amount) > 0)
    .map(b => ({
      id: b.id ?? crypto.randomUUID?.() ?? String(Math.random()),
      categoryId: b.categoryId,
      amount: Number(b.amount),
      currency: (b.currency ?? 'RUB') as Currency,
      createdAt: b.createdAt ?? new Date().toISOString(),
    }));

  return { version: SCHEMA_VERSION, transactions, categories, piggyBanks, budgets, accounts, transfers };
}

/** Порядок для показа: свежая дата сверху, при равной — позже созданная */
export function sortTransactions(list: Transaction[]): Transaction[] {
  return [...list].sort((a, b) =>
    b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ─── Настройки ────────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = readJSON<Partial<Settings>>(SETTINGS_KEY);
    if (stored) {
      setSettings({
        baseCurrency: stored.baseCurrency ?? DEFAULT_SETTINGS.baseCurrency,
        rates: safeRates(stored.rates),
        theme: THEME_MODES.includes(stored.theme as ThemeMode) ? stored.theme as ThemeMode : 'system',
        lang: stored.lang === 'en' ? 'en' : 'ru',
        autoRates: stored.autoRates === true,
        ratesUpdatedAt: stored.ratesUpdatedAt,
        ratesSource: stored.ratesSource,
      });
    }
    setLoaded(true);
  }, []);

  const saveSettings = useCallback((s: Settings) => {
    const normalized: Settings = {
      baseCurrency: s.baseCurrency,
      rates: safeRates(s.rates),
      theme: THEME_MODES.includes(s.theme) ? s.theme : 'system',
      lang: s.lang === 'en' ? 'en' : 'ru',
      autoRates: s.autoRates === true,
      ratesUpdatedAt: s.ratesUpdatedAt,
      ratesSource: s.ratesSource,
    };
    setSettings(normalized);
    writeJSON(SETTINGS_KEY, normalized);
  }, []);

  return { settings, saveSettings, loaded };
}

// ─── Данные ───────────────────────────────────────────────────────────────────

/**
 * @param rates курсы из настроек; пока null — загрузка отложена,
 *              потому что миграция проставляет курс в старые операции.
 */
export function useFinanceData(
  rates: CurrencyRates | null,
  onError?: StorageErrorHandler,
  baseCurrency: Currency = 'RUB',
) {
  const [data, setData] = useState<AppData>(defaultData);
  const [loaded, setLoaded] = useState(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  useEffect(() => {
    if (!rates || loaded) return;
    const raw = readJSON<Partial<AppData>>(STORAGE_KEY);

    if (raw && (raw.version ?? 1) < SCHEMA_VERSION) {
      // страховка: кладём исходник рядом, чтобы миграцию можно было откатить
      if (!localStorage.getItem(PRE_MIGRATION_KEY)) {
        writeJSON(PRE_MIGRATION_KEY, { savedAt: new Date().toISOString(), data: raw });
      }
    }

    const migrated = migrate(raw, rates, baseCurrency);
    migrated.transactions = sortTransactions(migrated.transactions);
    setData(migrated);
    setLoaded(true);

    if (raw && (raw.version ?? 1) < SCHEMA_VERSION) {
      writeJSON(STORAGE_KEY, migrated, errorRef.current);
    }
  }, [rates, loaded]);

  // Единственная точка записи. Раньше setItem вызывался внутри setState-апдейтера —
  // апдейтер обязан быть чистым, и в StrictMode он вызывается дважды.
  useEffect(() => {
    if (!loaded) return;
    writeJSON(STORAGE_KEY, data, errorRef.current);
  }, [data, loaded]);

  const addTransaction = useCallback((tx: Transaction) =>
    setData(prev => ({ ...prev, transactions: sortTransactions([tx, ...prev.transactions]) })), []);

  const deleteTransaction = useCallback((id: string) =>
    setData(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) })), []);

  const updateTransaction = useCallback((tx: Transaction) =>
    setData(prev => ({
      ...prev,
      transactions: sortTransactions(prev.transactions.map(t => (t.id === tx.id ? tx : t))),
    })), []);

  const addCategory = useCallback((cat: Category) =>
    setData(prev => ({ ...prev, categories: [...prev.categories, cat] })), []);

  const updateCategory = useCallback((cat: Category) =>
    setData(prev => ({ ...prev, categories: prev.categories.map(c => (c.id === cat.id ? cat : c)) })), []);

  const deleteCategory = useCallback((id: string) =>
    setData(prev => ({ ...prev, categories: prev.categories.filter(c => c.id !== id) })), []);

  const addPiggyBank = useCallback((pb: PiggyBank) =>
    setData(prev => ({ ...prev, piggyBanks: [...prev.piggyBanks, pb] })), []);

  const updatePiggyBank = useCallback((pb: PiggyBank) =>
    setData(prev => ({ ...prev, piggyBanks: prev.piggyBanks.map(p => (p.id === pb.id ? pb : p)) })), []);

  const deletePiggyBank = useCallback((id: string) =>
    setData(prev => ({ ...prev, piggyBanks: prev.piggyBanks.filter(p => p.id !== id) })), []);

  const addAccount = useCallback((a: Account) =>
    setData(prev => ({ ...prev, accounts: [...prev.accounts, a] })), []);

  const updateAccount = useCallback((a: Account) =>
    setData(prev => ({ ...prev, accounts: prev.accounts.map(x => (x.id === a.id ? a : x)) })), []);

  /** Счёт удаляем только вместе с переносом его записей — деньги не должны исчезать */
  const deleteAccount = useCallback((id: string, moveToId: string) =>
    setData(prev => ({
      ...prev,
      accounts: prev.accounts.filter(a => a.id !== id),
      transactions: prev.transactions.map(t => (t.accountId === id ? { ...t, accountId: moveToId } : t)),
      // Переводы, где обе стороны схлопнулись в один счёт, теряют смысл
      transfers: prev.transfers
        .map(t => ({
          ...t,
          fromAccountId: t.fromAccountId === id ? moveToId : t.fromAccountId,
          toAccountId: t.toAccountId === id ? moveToId : t.toAccountId,
        }))
        .filter(t => t.fromAccountId !== t.toAccountId),
    })), []);

  const addTransfer = useCallback((t: Transfer) =>
    setData(prev => ({ ...prev, transfers: [t, ...prev.transfers] })), []);

  const deleteTransfer = useCallback((id: string) =>
    setData(prev => ({ ...prev, transfers: prev.transfers.filter(t => t.id !== id) })), []);

  const addBudget = useCallback((b: Budget) =>
    setData(prev => ({ ...prev, budgets: [...prev.budgets, b] })), []);

  const updateBudget = useCallback((b: Budget) =>
    setData(prev => ({ ...prev, budgets: prev.budgets.map(x => (x.id === b.id ? b : x)) })), []);

  const deleteBudget = useCallback((id: string) =>
    setData(prev => ({ ...prev, budgets: prev.budgets.filter(b => b.id !== id) })), []);

  /** Полная замена состояния — используется при восстановлении из копии */
  const replaceAll = useCallback((next: AppData) => setData({
    ...next,
    version: SCHEMA_VERSION,
    transactions: sortTransactions(next.transactions),
  }), []);

  return {
    data, loaded,
    addTransaction, deleteTransaction, updateTransaction,
    addCategory, updateCategory, deleteCategory,
    addPiggyBank, updatePiggyBank, deletePiggyBank,
    addBudget, updateBudget, deleteBudget,
    addAccount, updateAccount, deleteAccount,
    addTransfer, deleteTransfer,
    replaceAll,
  };
}

// ─── Счета ────────────────────────────────────────────────────────────────────

/**
 * Остаток по счёту в его собственной валюте:
 * начальный остаток + доходы − расходы + входящие переводы − исходящие.
 */
export function accountBalance(
  account: Account,
  transactions: Transaction[],
  transfers: Transfer[],
  rates: CurrencyRates,
): number {
  let sum = account.openingBalance;
  for (const t of transactions) {
    if (t.accountId !== account.id) continue;
    const value = txInCurrency(t, account.currency, rates);
    sum += t.type === 'income' ? value : -value;
  }
  for (const tr of transfers) {
    if (tr.fromAccountId === account.id) sum -= tr.amountFrom;
    if (tr.toAccountId === account.id) sum += tr.amountTo;
  }
  return sum;
}

/** Сумма всех счетов в валюте отображения */
export function totalAccountsBalance(
  accounts: Account[],
  transactions: Transaction[],
  transfers: Transfer[],
  settings: Settings,
): number {
  return accounts.reduce((s, a) => {
    const own = accountBalance(a, transactions, transfers, settings.rates);
    return s + convertAmount(own, a.currency, settings.baseCurrency, settings.rates);
  }, 0);
}

// ─── Бюджеты ──────────────────────────────────────────────────────────────────

export interface BudgetProgress {
  /** Потрачено за текущий месяц, в валюте отображения */
  spent: number;
  /** Лимит, пересчитанный в валюту отображения по текущему курсу */
  limit: number;
  remaining: number;
  /** Доля израсходованного, 0..1 и выше при превышении */
  ratio: number;
  state: 'ok' | 'warn' | 'over';
}

export function budgetProgress(
  budget: Budget,
  transactions: Transaction[],
  settings: Settings,
  now: Date = new Date(),
): BudgetProgress {
  const monthTxs = filterByPeriod(transactions, 'month', now);
  const spent = monthTxs
    .filter(t => t.type === 'expense' && t.categoryId === budget.categoryId)
    .reduce((s, t) => s + txInBase(t, settings), 0);
  // Лимит — намерение на будущее, поэтому по текущему курсу, а не по зафиксированному
  const limit = convertAmount(budget.amount, budget.currency, settings.baseCurrency, settings.rates);
  const ratio = limit > 0 ? spent / limit : 0;
  return {
    spent,
    limit,
    remaining: limit - spent,
    ratio,
    state: ratio >= 1 ? 'over' : ratio >= BUDGET_WARN_THRESHOLD ? 'warn' : 'ok',
  };
}

export const BUDGET_STATE_COLOR: Record<BudgetProgress['state'], string> = {
  ok: 'var(--sage)',
  warn: 'var(--expense)',
  over: 'var(--red)',
};

// ─── Резервные копии ──────────────────────────────────────────────────────────

export function buildBackup(data: AppData, settings: Settings): BackupFile {
  return {
    app: 'fintrack',
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    transactions: data.transactions,
    categories: data.categories,
    piggyBanks: data.piggyBanks,
    budgets: data.budgets,
    accounts: data.accounts,
    transfers: data.transfers,
  };
}

/** Разбирает файл копии. Бросает Error с понятным текстом, если файл чужой. */
export function parseBackup(text: string, rates: CurrencyRates): { data: AppData; settings?: Settings } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Это не JSON-файл');
  }
  const obj = parsed as Partial<BackupFile>;
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.transactions)) {
    throw new Error('Не похоже на резервную копию: нет списка операций');
  }
  const settings: Settings | undefined = obj.settings
    ? {
        baseCurrency: obj.settings.baseCurrency ?? 'RUB',
        rates: safeRates(obj.settings.rates),
        theme: THEME_MODES.includes(obj.settings.theme as ThemeMode) ? obj.settings.theme as ThemeMode : 'system',
        lang: obj.settings.lang === 'en' ? 'en' : 'ru',
        autoRates: obj.settings.autoRates === true,
        ratesUpdatedAt: obj.settings.ratesUpdatedAt,
        ratesSource: obj.settings.ratesSource,
      }
    : undefined;
  return { data: migrate(obj, settings?.rates ?? rates, settings?.baseCurrency ?? 'RUB'), settings };
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildCSV(data: AppData, settings: Settings): string {
  const rows: (string | number)[][] = [[
    'Дата', 'Тип', 'Счёт', 'Категория', 'Подкатегория', 'Заметка',
    'Сумма', 'Валюта', 'Курс к RUB', `Сумма в ${settings.baseCurrency}`,
  ]];
  // Данные могут прийти из старой копии, где счетов ещё не было
  const accounts = data.accounts ?? [];
  const transfers = data.transfers ?? [];
  const accName = (id: string) => accounts.find(a => a.id === id)?.name ?? '';
  for (const tx of sortTransactions(data.transactions)) {
    const cat = data.categories.find(c => c.id === tx.categoryId);
    const sub = cat?.subcategories.find(s => s.id === tx.subcategoryId);
    rows.push([
      tx.date,
      tx.type === 'income' ? 'Доход' : 'Расход',
      accName(tx.accountId),
      cat?.name ?? 'Без категории',
      sub?.name ?? '',
      tx.note ?? '',
      tx.amount,
      tx.currency,
      txRate(tx, settings.rates),
      Math.round(txInBase(tx, settings) * 100) / 100,
    ]);
  }
  // Переводы отдельными строками: в доходы и расходы они не входят
  for (const tr of [...transfers].sort((a, b) => b.date.localeCompare(a.date))) {
    rows.push([
      tr.date, 'Перевод',
      `${accName(tr.fromAccountId)} → ${accName(tr.toAccountId)}`,
      '', '', tr.note ?? '', tr.amountFrom, '', '', '',
    ]);
  }
  // BOM — иначе Excel открывает кириллицу кракозябрами
  return '﻿' + rows
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}

// ─── Фильтрация и статистика ──────────────────────────────────────────────────

/**
 * Сравнение строк 'YYYY-MM-DD' лексикографически — таймзона не участвует вовсе.
 * Верхняя граница отсекает операции, датированные будущим.
 */
export function filterByPeriod(transactions: Transaction[], period: Period, now: Date = new Date()): Transaction[] {
  const range = periodRange(period, now);
  if (!range) return transactions;
  return transactions.filter(t => t.date >= range.from && t.date <= range.to);
}

export function calcStats(transactions: Transaction[], settings: Settings) {
  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    const value = txInBase(t, settings);
    if (t.type === 'income') income += value;
    else expense += value;
  }
  return { income, expense, balance: income - expense };
}
