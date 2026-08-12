'use client';

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Transaction, TransactionType, Category, Currency, Account, ACCOUNT_KIND_ICONS,
  CURRENCY_SYMBOLS, CURRENCIES, Settings,
} from '@/lib/types';
import { formatMoney, convertAmount, rateFor } from '@/lib/storage';
import { todayKey, normalizeDate } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { X } from 'lucide-react';

interface Props {
  categories: Category[];
  accounts: Account[];
  settings: Settings;
  onAdd: (tx: Transaction) => void;
  onClose: () => void;
  initial?: Transaction;
}

export default function TransactionForm({ categories, accounts, settings, onAdd, onClose, initial }: Props) {
  const { t } = useT();
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [accountId, setAccountId] = useState(initial?.accountId ?? accounts[0]?.id ?? '');
  // Новая запись по умолчанию в валюте счёта, а не в основной валюте приложения
  const [currency, setCurrency] = useState<Currency>(
    initial?.currency ?? accounts.find(a => a.id === (initial?.accountId ?? accounts[0]?.id))?.currency ?? settings.baseCurrency,
  );
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  // Дата — календарная строка, без Date и без UTC
  const [date, setDate] = useState(initial ? normalizeDate(initial.date) : todayKey());
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = categories.filter(c => c.type === type);
  const selectedCat = categories.find(c => c.id === categoryId);

  const parsedAmount = Number(amount);
  const amountValid = amount !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;

  // Курс, который будет записан в операцию.
  // При правке сохраняем исходный — иначе старая запись пересчитается по-новому.
  const currencyUnchanged = initial && initial.currency === currency;
  const effectiveRate = currencyUnchanged && Number(initial?.rate) > 0
    ? Number(initial!.rate)
    : rateFor(currency, settings.rates);

  // Подсказка пересчёта. Раньше здесь всегда подставлялся курс USD или EUR,
  // из-за чего для рублёвой операции при базовой валюте $ выводилось «1 ₽ = 98 ₽».
  const conversion = (() => {
    if (!amountValid || currency === settings.baseCurrency) return null;
    const converted = convertAmount(parsedAmount, currency, settings.baseCurrency, settings.rates);
    const pairRate = convertAmount(1, currency, settings.baseCurrency, settings.rates);
    return {
      approx: `≈ ${formatMoney(converted, settings.baseCurrency)}`,
      rate: t('form.rateHint', { sym: CURRENCY_SYMBOLS[currency], value: formatMoney(pairRate, settings.baseCurrency) }),
    };
  })();

  const handleSubmit = () => {
    if (!amountValid) { setError(t('form.errAmount')); return; }
    if (!categoryId) { setError(t('form.errCategory')); return; }
    if (!accountId) { setError(t('form.errAccount')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError(t('form.errDate')); return; }

    onAdd({
      id: initial?.id ?? uuidv4(),
      type,
      amount: parsedAmount,
      currency,
      rate: effectiveRate,
      accountId,
      categoryId,
      subcategoryId: subcategoryId || undefined,
      note: note.trim() || undefined,
      date,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={initial ? t('form.editRecord') : t('form.newRecord')}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? t('form.editRecord') : t('form.newRecord')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
          {/* переменная цикла названа tt, чтобы не затенять функцию перевода t */}
          {(['expense', 'income'] as TransactionType[]).map(tt => (
            <button
              key={tt}
              onClick={() => { setType(tt); setCategoryId(''); setSubcategoryId(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: type === tt ? 'var(--bg-card)' : 'transparent',
                color: type === tt
                  ? (tt === 'income' ? 'var(--sage)' : 'var(--red)')
                  : 'var(--text-muted)',
                boxShadow: type === tt ? 'var(--shadow-seg)' : 'none',
              }}
            >
              {tt === 'expense' ? t('type.expense') : t('type.income')}
            </button>
          ))}
        </div>

        {/* Amount + Currency */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.amount')}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="input pr-3 num text-lg"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoFocus
              />
            </div>
            <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: 'var(--bg-card2)' }}>
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  aria-label={c}
                  className="px-2.5 py-1 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: currency === c ? 'var(--bg-card)' : 'transparent',
                    color: currency === c ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: currency === c ? 'var(--shadow-seg)' : 'none',
                    minWidth: 36,
                  }}
                >
                  {CURRENCY_SYMBOLS[c]}
                </button>
              ))}
            </div>
          </div>
          {conversion && (
            <p className="text-xs mt-1.5 pl-1" style={{ color: 'var(--text-muted)' }}>
              {conversion.approx}
              <span className="ml-1">({conversion.rate})</span>
            </p>
          )}
          {currency !== 'RUB' && (
            <p className="text-xs mt-1 pl-1" style={{ color: 'var(--text-muted)' }}>
              {t('form.rateFrozen')}
            </p>
          )}
        </div>

        {/* Счёт */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.account')}</label>
          <select
            className="input"
            value={accountId}
            onChange={e => {
              setAccountId(e.target.value);
              // Подстраиваем валюту под счёт, пока пользователь не выбрал её вручную
              const acc = accounts.find(a => a.id === e.target.value);
              if (acc && !initial) setCurrency(acc.currency);
              setError('');
            }}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {ACCOUNT_KIND_ICONS[a.kind]} {a.name} · {a.currency}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.date')}</label>
          <input
            className="input"
            type="date"
            value={date}
            max={todayKey()}
            onChange={e => { setDate(e.target.value); setError(''); }}
          />
        </div>

        {/* Category */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.category')}</label>
          {filtered.length === 0 ? (
            <p className="text-sm p-3 rounded-xl" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
              {t('form.noCategories')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {filtered.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setCategoryId(cat.id); setSubcategoryId(''); setError(''); }}
                  className="flex items-center gap-2 p-2.5 rounded-xl text-sm text-left transition-all"
                  style={{
                    background: categoryId === cat.id ? cat.color + '22' : 'var(--bg)',
                    border: `1px solid ${categoryId === cat.id ? cat.color + '66' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Subcategory */}
        {selectedCat && selectedCat.subcategories.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.subcategory')}</label>
            <select
              className="input"
              value={subcategoryId}
              onChange={e => setSubcategoryId(e.target.value)}
            >
              <option value="">{t('form.subcategoryNone')}</option>
              {selectedCat.subcategories.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Note */}
        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.note', { optional: t('common.optional') })}</label>
          <input
            className="input"
            type="text"
            placeholder={t('form.notePlaceholder')}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" onClick={handleSubmit}>
            {initial ? t('common.save') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
