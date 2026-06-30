'use client';

import { useState, useMemo } from 'react';
import { Transaction, Category, Period, Settings } from '@/lib/types';
import { filterByPeriod, formatMoney, convertAmount } from '@/lib/storage';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Trash2, Pencil, ChevronDown } from 'lucide-react';
import TransactionForm from './TransactionForm';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  period: Period;
  settings: Settings;
  onDelete: (id: string) => void;
  onUpdate: (tx: Transaction) => void;
}

export default function TransactionList({ transactions, categories, period, settings, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(20);

  const filtered = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const day = tx.date.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(tx);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const getCat = (id: string) => categories.find(c => c.id === id);
  const getSub = (catId: string, subId?: string) => {
    if (!subId) return null;
    return categories.find(c => c.id === catId)?.subcategories.find(s => s.id === subId);
  };

  const formatDay = (dateStr: string) => {
    try {
      return format(parseISO(dateStr), 'd MMMM, EEEE', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  // Convert a transaction's amount to base currency for totals
  const toBase = (tx: Transaction) => convertAmount(tx.amount, tx.currency, settings.baseCurrency, settings.rates);

  if (filtered.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-3xl mb-2">📭</div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Нет записей за выбранный период
        </p>
      </div>
    );
  }

  let count = 0;

  return (
    <>
      {editing && (
        <TransactionForm
          categories={categories}
          settings={settings}
          onAdd={onUpdate}
          onClose={() => setEditing(null)}
          initial={editing}
        />
      )}

      <div className="space-y-3">
        {grouped.map(([day, txs]) => {
          const shown = txs.slice(0, Math.max(0, limit - count));
          count += shown.length;
          if (shown.length === 0) return null;

          const dayTotal = txs.reduce((s, t) => t.type === 'income' ? s + toBase(t) : s - toBase(t), 0);

          return (
            <div key={day} className="card overflow-hidden">
              {/* Day header */}
              <div
                className="px-4 py-2.5 flex justify-between items-center"
                style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xs font-medium capitalize" style={{ color: 'var(--text-muted)' }}>
                  {formatDay(day)}
                </span>
                <span
                  className="text-xs font-medium num"
                  style={{ color: dayTotal >= 0 ? 'var(--sage)' : 'var(--red)' }}
                >
                  {dayTotal >= 0 ? '+' : ''}{formatMoney(dayTotal, settings.baseCurrency)}
                </span>
              </div>

              {/* Transactions */}
              {shown.map((tx, i) => {
                const cat = getCat(tx.categoryId);
                const sub = getSub(tx.categoryId, tx.subcategoryId);
                const isForeign = tx.currency !== settings.baseCurrency;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-4 py-3 group transition-colors hover:bg-[var(--bg-card2)]"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                  >
                    {/* Icon */}
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                      style={{ background: cat ? cat.color + '22' : 'var(--bg-card2)' }}
                    >
                      {cat?.icon ?? '💸'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {sub ? sub.name : (cat?.name ?? 'Без категории')}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {sub && cat?.name}
                        {tx.note && (sub ? ' · ' : '') + tx.note}
                        {!sub && !tx.note && cat?.name}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="text-right flex-shrink-0">
                      <div
                        className="num font-medium"
                        style={{ color: tx.type === 'income' ? 'var(--sage)' : 'var(--text)' }}
                      >
                        {tx.type === 'income' ? '+' : '−'}{formatMoney(tx.amount, tx.currency)}
                      </div>
                      {isForeign && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          ≈ {formatMoney(toBase(tx), settings.baseCurrency)}
                        </div>
                      )}
                    </div>

                    {/* Actions (visible on hover) */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditing(tx)}
                        className="p-1.5 rounded-lg hover:bg-[var(--border)] transition-colors"
                        title="Редактировать"
                      >
                        <Pencil size={13} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button
                        onClick={() => onDelete(tx.id)}
                        className="p-1.5 rounded-lg hover:bg-[var(--red-light)] transition-colors"
                        title="Удалить"
                      >
                        <Trash2 size={13} style={{ color: 'var(--red)' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {limit < filtered.length && (
          <button
            onClick={() => setLimit(l => l + 30)}
            className="btn-ghost w-full flex items-center justify-center gap-1"
          >
            <ChevronDown size={16} />
            Показать ещё
          </button>
        )}
      </div>
    </>
  );
}
