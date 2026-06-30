'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, TransactionType, Category, Currency, CURRENCY_SYMBOLS, CURRENCY_LABELS, Settings } from '@/lib/types';
import { formatMoney, convertAmount } from '@/lib/storage';
import { X } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  categories: Category[];
  settings: Settings;
  onAdd: (tx: Transaction) => void;
  onClose: () => void;
  initial?: Transaction;
}

const CURRENCIES: Currency[] = ['RUB', 'USD', 'EUR'];

export default function TransactionForm({ categories, settings, onAdd, onClose, initial }: Props) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.baseCurrency);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(initial?.subcategoryId ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [date, setDate] = useState(initial?.date ? initial.date.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
  const [error, setError] = useState('');

  const filtered = categories.filter(c => c.type === type);
  const selectedCat = categories.find(c => c.id === categoryId);

  // Show converted amount hint when currency ≠ baseCurrency
  const convertedHint = (() => {
    const n = Number(amount);
    if (!n || currency === settings.baseCurrency) return null;
    const converted = convertAmount(n, currency, settings.baseCurrency, settings.rates);
    return `≈ ${formatMoney(converted, settings.baseCurrency)}`;
  })();

  const handleSubmit = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setError('Введите корректную сумму');
      return;
    }
    if (!categoryId) {
      setError('Выберите категорию');
      return;
    }
    const tx: Transaction = {
      id: initial?.id ?? uuidv4(),
      type,
      amount: Number(amount),
      currency,
      categoryId,
      subcategoryId: subcategoryId || undefined,
      note: note || undefined,
      date: new Date(date).toISOString(),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    onAdd(tx);
    onClose();
  };

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? 'Редактировать' : 'Новая запись'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
          {(['expense', 'income'] as TransactionType[]).map(t => (
            <button
              key={t}
              onClick={() => { setType(t); setCategoryId(''); setSubcategoryId(''); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: type === t ? 'var(--bg-card)' : 'transparent',
                color: type === t
                  ? (t === 'income' ? 'var(--sage)' : 'var(--red)')
                  : 'var(--text-muted)',
                boxShadow: type === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {t === 'expense' ? '↓ Расход' : '↑ Доход'}
            </button>
          ))}
        </div>

        {/* Amount + Currency */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Сумма</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                className="input pr-3 num text-lg"
                type="number"
                placeholder="0"
                value={amount}
                onChange={e => { setAmount(e.target.value); setError(''); }}
                autoFocus
              />
            </div>
            {/* Currency picker */}
            <div className="flex gap-1 p-1 rounded-xl flex-shrink-0" style={{ background: 'var(--bg-card2)' }}>
              {CURRENCIES.map(c => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className="px-2.5 py-1 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: currency === c ? 'var(--bg-card)' : 'transparent',
                    color: currency === c ? 'var(--text)' : 'var(--text-muted)',
                    boxShadow: currency === c ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    minWidth: 36,
                  }}
                >
                  {CURRENCY_SYMBOLS[c]}
                </button>
              ))}
            </div>
          </div>
          {/* Converted hint */}
          {convertedHint && (
            <p className="text-xs mt-1.5 pl-1" style={{ color: 'var(--text-muted)' }}>
              {convertedHint}
              <span className="ml-1" style={{ color: 'var(--warm-400)' }}>
                (курс: 1 {CURRENCY_SYMBOLS[currency]} = {currency === 'USD' ? settings.rates.USD : settings.rates.EUR} ₽)
              </span>
            </p>
          )}
        </div>

        {/* Date */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Дата</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        {/* Category */}
        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Категория</label>
          <div className="grid grid-cols-2 gap-1.5">
            {filtered.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCategoryId(cat.id); setSubcategoryId(''); }}
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
        </div>

        {/* Subcategory */}
        {selectedCat && selectedCat.subcategories.length > 0 && (
          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Подкатегория</label>
            <select
              className="input"
              value={subcategoryId}
              onChange={e => setSubcategoryId(e.target.value)}
            >
              <option value="">— не указана —</option>
              {selectedCat.subcategories.map(sub => (
                <option key={sub.id} value={sub.id}>{sub.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Note */}
        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Заметка (необязательно)</label>
          <input
            className="input"
            type="text"
            placeholder="Добавить заметку..."
            value={note}
            onChange={e => setNote(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>
        )}

        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Отмена</button>
          <button className="btn-primary flex-1" onClick={handleSubmit}>
            {initial ? 'Сохранить' : 'Добавить'}
          </button>
        </div>
      </div>
    </div>
  );
}
