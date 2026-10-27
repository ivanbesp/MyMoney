'use client';

import { useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Account, Category, Currency, CURRENCIES, CURRENCY_SYMBOLS, Settings, Transaction, TransactionType,
} from '@/lib/types';
import { rateFor } from '@/lib/storage';
import { todayKey } from '@/lib/dates';
import { SAVINGS_IN_CATEGORY_ID, SAVINGS_OUT_CATEGORY_ID } from '@/lib/defaults';
import { useT } from '@/lib/i18n';
import { Maximize2 } from 'lucide-react';

interface Props {
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  settings: Settings;
  onAdd: (tx: Transaction) => void;
  /** Открыть полную форму — для подкатегорий, курса и прочих тонкостей */
  onOpenFull: () => void;
}

export const QUICK_AMOUNT_ID = 'quick-amount';

/** Значение селекта категории: 'catId|subId' или 'catId|' */
const pack = (cat: string, sub = '') => `${cat}|${sub}`;
const unpack = (v: string) => {
  const [cat, sub] = v.split('|');
  return { cat: cat ?? '', sub: sub || undefined };
};

/** «1 250,50» и «1250.5» — оба варианта ввода должны работать */
export const parseAmount = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

/**
 * Строка быстрой записи: на ПК запись добавляется без всплывающего окна —
 * сумма, Tab по полям, Enter. Категория и счёт запоминаются по последней записи
 * того же типа, поэтому обычно достаточно ввести только сумму.
 */
export default function QuickAdd({ categories, accounts, transactions, settings, onAdd, onOpenFull }: Props) {
  const { t } = useT();
  const amountRef = useRef<HTMLInputElement>(null);

  const lastOf = (type: TransactionType) => transactions.find(x => x.type === type && !x.piggyBankId);

  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [catValue, setCatValue] = useState(() => {
    const last = lastOf('expense');
    return last ? pack(last.categoryId, last.subcategoryId) : '';
  });
  const [accountId, setAccountId] = useState(() => lastOf('expense')?.accountId ?? accounts[0]?.id ?? '');
  const [currency, setCurrency] = useState<Currency>(
    () => accounts.find(a => a.id === accountId)?.currency ?? settings.baseCurrency,
  );
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Системные категории копилок выбираются кнопками копилки, не руками
  const options = useMemo(() => categories
    .filter(c => c.type === type && c.id !== SAVINGS_IN_CATEGORY_ID && c.id !== SAVINGS_OUT_CATEGORY_ID)
    .flatMap(c => [
      { value: pack(c.id), label: `${c.icon} ${c.name}` },
      ...c.subcategories.map(s => ({ value: pack(c.id, s.id), label: `${c.icon} ${c.name} · ${s.name}` })),
    ]), [categories, type]);

  const switchType = (next: TransactionType) => {
    setType(next);
    const last = lastOf(next);
    setCatValue(last ? pack(last.categoryId, last.subcategoryId) : '');
    setError('');
  };

  const changeAccount = (id: string) => {
    setAccountId(id);
    const acc = accounts.find(a => a.id === id);
    if (acc) setCurrency(acc.currency);
  };

  const submit = () => {
    const value = parseAmount(amount);
    if (!amount || !Number.isFinite(value) || value <= 0) { setError(t('form.errAmount')); amountRef.current?.focus(); return; }
    const { cat, sub } = unpack(catValue);
    if (!cat || !categories.some(c => c.id === cat)) { setError(t('form.errCategory')); return; }
    if (!accountId) { setError(t('form.errAccount')); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError(t('form.errDate')); return; }

    onAdd({
      id: uuidv4(),
      type,
      amount: value,
      currency,
      rate: rateFor(currency, settings.rates),
      accountId,
      categoryId: cat,
      subcategoryId: sub,
      note: note.trim() || undefined,
      date,
      createdAt: new Date().toISOString(),
    });
    // Категорию, счёт и дату оставляем: следующая запись чаще всего похожа
    setAmount('');
    setNote('');
    setError('');
    amountRef.current?.focus();
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  return (
    <section className="card p-3.5" aria-label={t('quick.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="seg" role="group" aria-label={t('form.type')}>
          {(['expense', 'income'] as TransactionType[]).map(tt => (
            <button
              key={tt}
              type="button"
              aria-pressed={type === tt}
              onClick={() => switchType(tt)}
              style={type === tt ? { color: tt === 'income' ? 'var(--sage)' : 'var(--expense)' } : undefined}
            >
              {tt === 'expense' ? t('type.expenseOne') : t('type.incomeOne')}
            </button>
          ))}
        </div>

        <label className="field flex items-center gap-1 flex-[1_1_120px] min-w-[110px]">
          <span className="sr-only">{t('quick.amount')}</span>
          <input
            id={QUICK_AMOUNT_ID}
            ref={amountRef}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={onEnter}
            className="bg-transparent outline-none w-full min-w-0 text-[17px] font-extrabold num"
            style={{ color: 'var(--text)' }}
          />
          <select
            value={currency}
            onChange={e => setCurrency(e.target.value as Currency)}
            aria-label={t('form.currency')}
            className="bg-transparent outline-none font-bold text-[15px] cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{CURRENCY_SYMBOLS[c]}</option>)}
          </select>
        </label>

        <label className="flex-[2_1_190px] min-w-[170px]">
          <span className="sr-only">{t('quick.category')}</span>
          <select
            className="field w-full cursor-pointer font-semibold"
            value={catValue}
            onChange={e => { setCatValue(e.target.value); setError(''); }}
            onKeyDown={onEnter}
          >
            {!catValue && <option value="">{t('form.category')}…</option>}
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        {accounts.length > 1 && (
          <label className="flex-[1_1_120px] min-w-[110px]">
            <span className="sr-only">{t('quick.account')}</span>
            <select
              className="field w-full cursor-pointer font-semibold"
              value={accountId}
              onChange={e => changeAccount(e.target.value)}
              onKeyDown={onEnter}
            >
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        )}

        <label className="flex-[0_1_140px] min-w-[130px]">
          <span className="sr-only">{t('quick.date')}</span>
          <input
            type="date"
            className="field w-full"
            value={date}
            max={todayKey()}
            onChange={e => setDate(e.target.value)}
            onKeyDown={onEnter}
          />
        </label>

        <label className="flex-[2_1_140px] min-w-[120px]">
          <span className="sr-only">{t('quick.note')}</span>
          <input
            className="field w-full"
            placeholder={t('quick.notePlaceholder')}
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={onEnter}
          />
        </label>

        <button type="button" onClick={submit} className="btn-primary h-[42px] flex items-center gap-2 px-[18px]">
          {t('quick.add')}
        </button>
        <button
          type="button"
          onClick={onOpenFull}
          className="h-[42px] w-[42px] rounded-[11px] flex items-center justify-center transition-colors hover:bg-[var(--bg-card2)]"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          aria-label={t('quick.more')}
          title={t('quick.more')}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      {error && <p className="text-[13px] mt-2 px-1" style={{ color: 'var(--red)' }}>{error}</p>}
    </section>
  );
}
