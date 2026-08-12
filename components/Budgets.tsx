'use client';

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Budget, Category, Currency, CURRENCIES, CURRENCY_SYMBOLS, Settings, Transaction } from '@/lib/types';
import { budgetProgress, BUDGET_STATE_COLOR, formatMoney, convertAmount } from '@/lib/storage';
import ConfirmDialog from './ConfirmDialog';
import { useT } from '@/lib/i18n';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { getDate, getDaysInMonth } from 'date-fns';

interface Props {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  settings: Settings;
  onAdd: (b: Budget) => void;
  onUpdate: (b: Budget) => void;
  onDelete: (id: string) => void;
}

function BudgetForm({ initial, categories, budgets, settings, onSave, onClose }: {
  initial?: Budget;
  categories: Category[];
  budgets: Budget[];
  settings: Settings;
  onSave: (b: Budget) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.baseCurrency);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Одна категория — один лимит, иначе прогресс считался бы дважды
  const taken = new Set(budgets.filter(b => b.id !== initial?.id).map(b => b.categoryId));
  const available = categories.filter(c => c.type === 'expense' && !taken.has(c.id));

  const parsed = Number(amount);
  const preview = currency !== settings.baseCurrency && parsed > 0
    ? convertAmount(parsed, currency, settings.baseCurrency, settings.rates)
    : null;

  const handleSave = () => {
    if (!categoryId) { setError(t('form.errCategory')); return; }
    if (!Number.isFinite(parsed) || parsed <= 0) { setError(t('budgets.errAmount')); return; }
    onSave({
      id: initial?.id ?? uuidv4(),
      categoryId,
      amount: parsed,
      currency,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={initial ? t('budgets.edit') : t('budgets.new')}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? t('budgets.edit') : t('budgets.new')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('budgets.category')}</label>
          {available.length === 0 && !initial ? (
            <p className="text-sm p-3 rounded-xl" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
              {t('budgets.allTaken')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {(initial ? categories.filter(c => c.type === 'expense' && (c.id === initial.categoryId || !taken.has(c.id))) : available).map(cat => (
                <button
                  key={cat.id}
                  onClick={() => { setCategoryId(cat.id); setError(''); }}
                  className="flex items-center gap-2 p-2.5 rounded-xl text-sm text-left transition-all"
                  style={{
                    background: categoryId === cat.id ? cat.color + '22' : 'var(--bg-inset)',
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

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('budgets.monthLimit')}</label>
          <div className="flex gap-2">
            <input
              className="input num text-lg flex-1"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0"
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
            />
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
          {preview !== null && (
            <p className="text-xs mt-1.5 pl-1" style={{ color: 'var(--text-muted)' }}>
              {t('budgets.byRate', { value: formatMoney(preview, settings.baseCurrency) })}
            </p>
          )}
        </div>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" onClick={handleSave}>{initial ? t('common.save') : t('common.create')}</button>
        </div>
      </div>
    </div>
  );
}

export function BudgetRow({ budget, category, transactions, settings, compact }: {
  budget: Budget;
  category?: Category;
  transactions: Transaction[];
  settings: Settings;
  compact?: boolean;
}) {
  const { t } = useT();
  const p = budgetProgress(budget, transactions, settings);
  const color = BUDGET_STATE_COLOR[p.state];

  // Ожидаемая доля месяца: если потрачено заметно больше — темп слишком быстрый
  const now = new Date();
  const expected = getDate(now) / getDaysInMonth(now);
  const tooFast = p.state === 'ok' && p.ratio > expected + 0.15;

  return (
    <div className={compact ? 'py-2.5' : 'p-4'}>
      <div className="flex items-center gap-2 mb-2">
        {!compact && (
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
            style={{ background: (category?.color ?? '#B8B8B8') + '22' }}
          >
            {category?.icon ?? '📦'}
          </span>
        )}
        <span className="text-sm font-medium flex-1 truncate">{category?.name ?? t('list.noCategory')}</span>
        <span className="text-xs num flex-shrink-0" style={{ color }}>
          {p.state === 'over'
            ? t('budgets.over', { value: formatMoney(-p.remaining, settings.baseCurrency) })
            : t('budgets.left', { value: formatMoney(p.remaining, settings.baseCurrency) })}
        </span>
      </div>

      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(p.ratio, 1) * 100}%`, background: color }}
        />
      </div>

      <div className="flex justify-between text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
        <span className="num">
          {t('budgets.spentOf', { spent: formatMoney(p.spent, settings.baseCurrency), limit: formatMoney(p.limit, settings.baseCurrency) })}
        </span>
        <span>{Math.round(p.ratio * 100)}%</span>
      </div>

      {tooFast && (
        <p className="text-xs mt-1" style={{ color: 'var(--expense)' }}>
          {t('budgets.tooFast')}
        </p>
      )}
    </div>
  );
}

/** Три самых горящих лимита — блок для обзора */
export function BudgetSummary({ budgets, categories, transactions, settings, onOpen }: {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  settings: Settings;
  onOpen: () => void;
}) {
  const { t } = useT();
  const top = useMemo(() => {
    return [...budgets]
      .map(b => ({ b, p: budgetProgress(b, transactions, settings) }))
      .sort((a, x) => x.p.ratio - a.p.ratio)
      .slice(0, 3);
  }, [budgets, transactions, settings]);

  if (top.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">{t('nav.budgets')}</h2>
        <button onClick={onOpen} className="text-xs" style={{ color: 'var(--sage)' }}>{t('common.seeAll')}</button>
      </div>
      <div className="card px-4">
        {top.map(({ b }, i) => (
          <div key={b.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
            <BudgetRow
              budget={b}
              category={categories.find(c => c.id === b.categoryId)}
              transactions={transactions}
              settings={settings}
              compact
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Budgets({ budgets, categories, transactions, settings, onAdd, onUpdate, onDelete }: Props) {
  const { t } = useT();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleting, setDeleting] = useState<Budget | null>(null);

  const sorted = useMemo(
    () => [...budgets]
      .map(b => ({ b, p: budgetProgress(b, transactions, settings) }))
      .sort((a, x) => x.p.ratio - a.p.ratio),
    [budgets, transactions, settings],
  );

  const totals = useMemo(() => {
    const limit = sorted.reduce((s, { p }) => s + p.limit, 0);
    const spent = sorted.reduce((s, { p }) => s + p.spent, 0);
    return { limit, spent, ratio: limit > 0 ? spent / limit : 0 };
  }, [sorted]);

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  return (
    <div className="space-y-4">
      {showForm && (
        <BudgetForm categories={categories} budgets={budgets} settings={settings}
          onSave={onAdd} onClose={() => setShowForm(false)} />
      )}
      {editing && (
        <BudgetForm initial={editing} categories={categories} budgets={budgets} settings={settings}
          onSave={onUpdate} onClose={() => setEditing(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('budgets.deleteTitle', { name: catById.get(deleting.categoryId)?.name ?? '' })}
          description={t('budgets.deleteHint')}
          onConfirm={() => onDelete(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}

      {budgets.length > 0 && (
        <div className="card p-4">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{t('budgets.allMonth')}</span>
            <span className="text-xs num" style={{ color: 'var(--text-muted)' }}>
              {Math.round(totals.ratio * 100)}%
            </span>
          </div>
          <div className="num-hero text-2xl mb-2">
            {t('budgets.spentOf', {
              spent: formatMoney(totals.spent, settings.baseCurrency),
              limit: formatMoney(totals.limit, settings.baseCurrency),
            })}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-card2)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(totals.ratio, 1) * 100}%`,
                background: totals.ratio >= 1 ? 'var(--red)' : totals.ratio >= 0.8 ? 'var(--expense)' : 'var(--sage)',
              }}
            />
          </div>
        </div>
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={16} /> {t('budgets.new')}
      </button>

      {budgets.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-sm mb-1" style={{ color: 'var(--text)' }}>{t('budgets.emptyTitle')}</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {t('budgets.emptyHint')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(({ b }) => (
          <div key={b.id} className="card row-hover">
            <div className="flex items-start">
              <div className="flex-1 min-w-0">
                <BudgetRow
                  budget={b}
                  category={catById.get(b.categoryId)}
                  transactions={transactions}
                  settings={settings}
                />
              </div>
              <div className="row-actions flex gap-0.5 p-2 flex-shrink-0">
                <button onClick={() => setEditing(b)} aria-label={t('budgets.edit')}
                  className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                  <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => setDeleting(b)} aria-label={t('common.delete')}
                  className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors">
                  <Trash2 size={14} style={{ color: 'var(--red)' }} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
