'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppData, Transaction, Category, PiggyBank, Period, Settings, DEFAULT_SETTINGS, Currency, CURRENCY_SYMBOLS } from './types';
import { DEFAULT_CATEGORIES } from './defaults';
import { startOfDay, startOfWeek, startOfMonth, startOfYear, isAfter, parseISO } from 'date-fns';

const STORAGE_KEY = 'finance_tracker_data';
const SETTINGS_KEY = 'finance_tracker_settings';

const defaultData: AppData = {
  transactions: [],
  categories: DEFAULT_CATEGORIES,
  piggyBanks: [],
};

// ─── Currency conversion ──────────────────────────────────────────────────────

/** Convert any amount+currency to RUB (the internal base for arithmetic) */
export function toRub(amount: number, currency: Currency, rates: Settings['rates']): number {
  if (currency === 'RUB') return amount;
  return amount * rates[currency];
}

/** Convert RUB amount to the user's display base currency */
export function fromRub(rubAmount: number, target: Currency, rates: Settings['rates']): number {
  if (target === 'RUB') return rubAmount;
  return rubAmount / rates[target];
}

/** Convert an amount from one currency to another via RUB pivot */
export function convertAmount(
  amount: number,
  from: Currency,
  to: Currency,
  rates: Settings['rates'],
): number {
  if (from === to) return amount;
  const rub = toRub(amount, from, rates);
  return fromRub(rub, to, rates);
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatMoney(
  amount: number,
  currency: Currency = 'RUB',
  opts?: { compact?: boolean },
): string {
  const sym = CURRENCY_SYMBOLS[currency];
  const formatted = new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === 'RUB' ? 0 : 2,
  }).format(opts?.compact && Math.abs(amount) >= 1000 ? Math.round(amount) : amount);
  // USD/EUR: symbol before; RUB: after
  if (currency === 'RUB') return formatted + '\u00A0' + sym;
  return sym + '\u00A0' + formatted;
}

/** Format a transaction's original amount then show base-currency equivalent if different */
export function formatTxAmount(
  amount: number,
  txCurrency: Currency,
  settings: Settings,
): string {
  const original = formatMoney(amount, txCurrency);
  if (txCurrency === settings.baseCurrency) return original;
  const converted = convertAmount(amount, txCurrency, settings.baseCurrency, settings.rates);
  return `${original} ≈ ${formatMoney(converted, settings.baseCurrency)}`;
}

// ─── Settings hook ────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const saveSettings = useCallback((s: Settings) => {
    setSettings(s);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, []);

  return { settings, saveSettings, loaded };
}

// ─── Data hook ────────────────────────────────────────────────────────────────

export function useFinanceData() {
  const [data, setData] = useState<AppData>(defaultData);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppData;
        // Back-compat: old transactions without currency field → assume RUB
        parsed.transactions = parsed.transactions.map(t => ({
          ...t,
          currency: t.currency ?? ('RUB' as Currency),
        }));
        // Back-compat: old piggy banks without currency fields
        parsed.piggyBanks = parsed.piggyBanks.map(pb => ({
          ...pb,
          targetCurrency: pb.targetCurrency ?? ('RUB' as Currency),
          currentCurrency: pb.currentCurrency ?? ('RUB' as Currency),
        }));
        setData(parsed);
      }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  const persist = (updated: AppData) => {
    setData(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const addTransaction = useCallback((tx: Transaction) =>
    setData(prev => { const u = { ...prev, transactions: [tx, ...prev.transactions] }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const deleteTransaction = useCallback((id: string) =>
    setData(prev => { const u = { ...prev, transactions: prev.transactions.filter(t => t.id !== id) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const updateTransaction = useCallback((tx: Transaction) =>
    setData(prev => { const u = { ...prev, transactions: prev.transactions.map(t => t.id === tx.id ? tx : t) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const addCategory = useCallback((cat: Category) =>
    setData(prev => { const u = { ...prev, categories: [...prev.categories, cat] }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const updateCategory = useCallback((cat: Category) =>
    setData(prev => { const u = { ...prev, categories: prev.categories.map(c => c.id === cat.id ? cat : c) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const deleteCategory = useCallback((id: string) =>
    setData(prev => { const u = { ...prev, categories: prev.categories.filter(c => c.id !== id) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const addPiggyBank = useCallback((pb: PiggyBank) =>
    setData(prev => { const u = { ...prev, piggyBanks: [...prev.piggyBanks, pb] }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const updatePiggyBank = useCallback((pb: PiggyBank) =>
    setData(prev => { const u = { ...prev, piggyBanks: prev.piggyBanks.map(p => p.id === pb.id ? pb : p) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  const deletePiggyBank = useCallback((id: string) =>
    setData(prev => { const u = { ...prev, piggyBanks: prev.piggyBanks.filter(p => p.id !== id) }; localStorage.setItem(STORAGE_KEY, JSON.stringify(u)); return u; }), []);

  return {
    data, loaded, persist,
    addTransaction, deleteTransaction, updateTransaction,
    addCategory, updateCategory, deleteCategory,
    addPiggyBank, updatePiggyBank, deletePiggyBank,
  };
}

// ─── Filtering & stats (currency-aware) ──────────────────────────────────────

export function filterByPeriod(transactions: Transaction[], period: Period): Transaction[] {
  if (period === 'all') return transactions;
  const now = new Date();
  let start: Date;
  switch (period) {
    case 'day': start = startOfDay(now); break;
    case 'week': start = startOfWeek(now, { weekStartsOn: 1 }); break;
    case 'month': start = startOfMonth(now); break;
    case 'year': start = startOfYear(now); break;
    default: return transactions;
  }
  return transactions.filter(t => {
    const d = parseISO(t.date);
    return isAfter(d, start) || d.getTime() === start.getTime();
  });
}

/** All amounts converted to baseCurrency via RUB pivot */
export function calcStats(transactions: Transaction[], settings: Settings) {
  const convert = (t: Transaction) =>
    convertAmount(t.amount, t.currency, settings.baseCurrency, settings.rates);
  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + convert(t), 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + convert(t), 0);
  return { income, expense, balance: income - expense };
}

