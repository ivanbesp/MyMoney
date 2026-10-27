'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Transaction, Category, Period, Settings, TransactionType, Account, Transfer,
} from '@/lib/types';
import { filterByPeriod, formatMoney, txInBase, sortTransactions } from '@/lib/storage';
import { parseDay, periodRange } from '@/lib/dates';
import { useT } from '@/lib/i18n';
import { format } from 'date-fns';
import {
  Trash2, Pencil, ChevronDown, Search, X, RotateCcw, ArrowLeftRight, ArrowRight,
} from 'lucide-react';
import TransactionForm from './TransactionForm';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  accounts: Account[];
  transfers?: Transfer[];
  period: Period;
  settings: Settings;
  onDelete: (tx: Transaction) => void;
  onUpdate: (tx: Transaction) => void;
  /** Создаёт копию записи сегодняшним числом */
  onRepeat?: (tx: Transaction) => void;
}

export const SEARCH_INPUT_ID = 'tx-search';
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PAGE = 30;
type TypeFilter = TransactionType | 'all';

// ─── Строка операции ──────────────────────────────────────────────────────────

function TxRow({ tx, cat, subName, accountName, settings, showDate, dateLabel, onRepeat, onEdit, onDelete }: {
  tx: Transaction;
  cat?: Category;
  subName?: string;
  accountName?: string;
  settings: Settings;
  showDate?: boolean;
  dateLabel?: string;
  onRepeat?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useT();
  const isForeign = tx.currency !== settings.baseCurrency;
  const income = tx.type === 'income';

  return (
    <tr className="row-hover transition-colors">
      {showDate && (
        <td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{dateLabel}</td>
      )}
      <td>
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 text-[15px]"
            style={{ background: cat ? cat.color + '26' : 'var(--bg-card2)' }}
            aria-hidden="true"
          >
            {cat?.icon ?? '💸'}
          </span>
          <span className="min-w-0">
            <span className="block font-semibold truncate">{cat?.name ?? t('list.noCategory')}</span>
            {subName && <span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subName}</span>}
          </span>
        </div>
      </td>
      <td className="max-w-[280px]">
        <span className="block truncate" style={{ color: 'var(--text)' }} title={tx.note}>{tx.note ?? ''}</span>
      </td>
      <td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{accountName ?? ''}</td>
      <td className="text-right whitespace-nowrap">
        <span className="num font-bold" style={{ color: income ? 'var(--sage)' : 'var(--text)' }}>
          {income ? '+' : '−'}{formatMoney(tx.amount, tx.currency)}
        </span>
        {isForeign && (
          <span className="block text-xs num" style={{ color: 'var(--text-muted)' }}>
            ≈ {formatMoney(txInBase(tx, settings), settings.baseCurrency)}
          </span>
        )}
      </td>
      <td className="w-[112px]">
        <div className="row-actions flex gap-0.5 justify-end">
          {onRepeat && (
            <button onClick={onRepeat} className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
              aria-label={t('list.repeat')} title={t('list.repeat')}>
              <RotateCcw size={15} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-[var(--bg-card)] transition-colors"
            aria-label={t('list.editRecord')} title={t('list.editRecord')}>
            <Pencil size={15} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors"
            aria-label={t('list.deleteRecord')} title={t('list.deleteRecord')}>
            <Trash2 size={15} style={{ color: 'var(--red)' }} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TableHead({ showDate }: { showDate?: boolean }) {
  const { t } = useT();
  return (
    <thead>
      <tr>
        {showDate && <th>{t('table.date')}</th>}
        <th>{t('table.category')}</th>
        <th>{t('table.note')}</th>
        <th>{t('table.account')}</th>
        <th className="text-right" style={{ textAlign: 'right' }}>{t('table.amount')}</th>
        <th><span className="sr-only">{t('table.actions')}</span></th>
      </tr>
    </thead>
  );
}

// ─── Последние операции (обзор) ───────────────────────────────────────────────

export function RecentTransactions({
  transactions, categories, accounts, settings, onDelete, onUpdate, onRepeat, onOpenAll, limit = 8,
}: Omit<Props, 'period' | 'transfers'> & { onOpenAll: () => void; limit?: number }) {
  const { t, dateLocale } = useT();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const rows = transactions.slice(0, limit);

  return (
    <section className="card pt-2 min-w-0">
      {editing && (
        <TransactionForm categories={categories} accounts={accounts} settings={settings}
          onAdd={onUpdate} onClose={() => setEditing(null)} initial={editing} />
      )}
      <div className="flex items-center justify-between px-5 py-2.5">
        <h2 className="text-[15px] font-bold">{t('list.recent')}</h2>
        <button onClick={onOpenAll} className="text-[13px] font-bold" style={{ color: 'var(--sage)' }}>
          {t('list.recentAll')}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm" style={{ color: 'var(--text-muted)' }}>{t('list.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="dtable min-w-[560px]">
            <TableHead showDate />
            <tbody>
              {rows.map(tx => {
                const cat = catById.get(tx.categoryId);
                return (
                  <TxRow
                    key={tx.id}
                    tx={tx}
                    cat={cat}
                    subName={cat?.subcategories.find(s => s.id === tx.subcategoryId)?.name}
                    accountName={accById.get(tx.accountId)?.name}
                    settings={settings}
                    showDate
                    dateLabel={format(parseDay(tx.date), 'd MMM', { locale: dateLocale })}
                    onRepeat={onRepeat ? () => onRepeat(tx) : undefined}
                    onEdit={() => setEditing(tx)}
                    onDelete={() => onDelete(tx)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Все операции ─────────────────────────────────────────────────────────────

export default function TransactionList({
  transactions, categories, accounts, transfers = [], period, settings,
  onDelete, onUpdate, onRepeat,
}: Props) {
  const { t, dateLocale } = useT();
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  // При смене периода или фильтров список начинается заново
  useEffect(() => { setLimit(PAGE); }, [period, query, typeFilter, categoryFilter, accountFilter]);

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    let list = filterByPeriod(transactions, period);
    if (typeFilter !== 'all') list = list.filter(x => x.type === typeFilter);
    if (categoryFilter !== 'all') list = list.filter(x => x.categoryId === categoryFilter);
    if (accountFilter !== 'all') list = list.filter(x => x.accountId === accountFilter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(x => {
        const cat = catById.get(x.categoryId);
        const sub = cat?.subcategories.find(s => s.id === x.subcategoryId);
        // Ищем и по сумме тоже: «420» находит запись на 420 ₽
        const haystack = [x.note, cat?.name, sub?.name, String(x.amount), x.date]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return sortTransactions(list);
  }, [transactions, period, typeFilter, categoryFilter, accountFilter, query, catById]);

  const totals = useMemo(() => {
    let income = 0, expense = 0;
    for (const x of filtered) {
      if (x.type === 'income') income += txInBase(x, settings);
      else expense += txInBase(x, settings);
    }
    return { income, expense, net: income - expense };
  }, [filtered, settings]);

  /**
   * Переводы показываем в истории, но они не доход и не расход: в дневной итог
   * и в поисковую сумму не входят. Фильтры по типу и категории их скрывают —
   * у перевода нет ни того, ни другого.
   */
  const visibleTransfers = useMemo(() => {
    if (typeFilter !== 'all' || categoryFilter !== 'all') return [];
    const range = periodRange(period);
    let list = range ? transfers.filter(x => x.date >= range.from && x.date <= range.to) : transfers;
    if (accountFilter !== 'all') list = list.filter(x => x.fromAccountId === accountFilter || x.toAccountId === accountFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(tr => {
        const from = accById.get(tr.fromAccountId)?.name ?? '';
        const to = accById.get(tr.toAccountId)?.name ?? '';
        return [tr.note, from, to, String(tr.amountFrom), tr.date, t('list.transfer').toLowerCase()]
          .filter(Boolean).join(' ').toLowerCase().includes(q);
      });
    }
    return list;
  }, [transfers, period, query, typeFilter, categoryFilter, accountFilter, accById, t]);

  const grouped = useMemo(() => {
    const page = filtered.slice(0, limit);
    const map = new Map<string, { txs: Transaction[]; trs: Transfer[] }>();
    const bucket = (date: string) => {
      if (!map.has(date)) map.set(date, { txs: [], trs: [] });
      return map.get(date)!;
    };
    for (const tx of page) bucket(tx.date).txs.push(tx);
    // Переводы подмешиваем только к тем дням, что уже попали на страницу,
    // иначе пагинация «Показать ещё» начнёт скакать
    const shownDays = new Set(page.map(x => x.date));
    for (const tr of visibleTransfers) {
      if (shownDays.has(tr.date) || page.length === 0) bucket(tr.date).trs.push(tr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, limit, visibleTransfers]);

  const usedCategories = useMemo(() => {
    const ids = new Set(filterByPeriod(transactions, period).map(x => x.categoryId));
    return categories.filter(c => ids.has(c.id));
  }, [transactions, period, categories]);

  const formatDay = (key: string) => {
    try {
      return format(parseDay(key), 'EEEE, d MMMM', { locale: dateLocale });
    } catch {
      return key;
    }
  };

  const hasFilters = typeFilter !== 'all' || categoryFilter !== 'all' || accountFilter !== 'all';
  const resetFilters = () => { setTypeFilter('all'); setCategoryFilter('all'); setAccountFilter('all'); setQuery(''); };
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${formatMoney(Math.abs(n), settings.baseCurrency)}`;

  return (
    <>
      {editing && (
        <TransactionForm categories={categories} accounts={accounts} settings={settings}
          onAdd={onUpdate} onClose={() => setEditing(null)} initial={editing} />
      )}

      <div className="card p-3.5 flex flex-wrap items-center gap-2">
        <label className="field flex items-center gap-2 flex-[2_1_240px] min-w-[200px]">
          <Search size={16} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
          <input
            id={SEARCH_INPUT_ID}
            type="search"
            className="bg-transparent outline-none flex-1 min-w-0 text-sm"
            placeholder={t('list.search')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label={t('list.search')}
          />
          {query ? (
            <button onClick={() => setQuery('')} aria-label={t('list.clearSearch')} className="p-1 rounded-md"
              style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          ) : <span className="kbd" aria-hidden="true">/</span>}
        </label>

        <div className="seg" role="group" aria-label={t('list.filterType')}>
          {([['all', t('common.all')], ['expense', t('type.expensePlain')], ['income', t('type.incomePlain')]] as const).map(([v, label]) => (
            <button key={v} aria-pressed={typeFilter === v} onClick={() => setTypeFilter(v as TypeFilter)}>{label}</button>
          ))}
        </div>

        <select
          className="field cursor-pointer font-semibold flex-[1_1_170px] min-w-[150px]"
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          aria-label={t('list.filterCategory')}
        >
          <option value="all">{t('list.allCategories')}</option>
          {usedCategories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>

        {accounts.length > 1 && (
          <select
            className="field cursor-pointer font-semibold flex-[1_1_140px] min-w-[130px]"
            value={accountFilter}
            onChange={e => setAccountFilter(e.target.value)}
            aria-label={t('table.account')}
          >
            <option value="all">{t('list.allAccounts')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}

        {(hasFilters || query) && (
          <button className="btn-ghost h-[42px] py-0" onClick={resetFilters}>{t('list.resetFilters')}</button>
        )}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 px-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
        <span>{t('list.found', { n: filtered.length })}</span>
        <span className="num">{t('balance.income')}: <b style={{ color: 'var(--sage)' }}>+{formatMoney(totals.income, settings.baseCurrency)}</b></span>
        <span className="num">{t('balance.expense')}: <b style={{ color: 'var(--text)' }}>−{formatMoney(totals.expense, settings.baseCurrency)}</b></span>
        <span className="num">{t('list.net')}: <b style={{ color: totals.net >= 0 ? 'var(--sage)' : 'var(--red)' }}>{signed(totals.net)}</b></span>
      </div>

      {filtered.length === 0 && visibleTransfers.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {query || hasFilters ? t('list.emptySearch') : t('list.empty')}
          </p>
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="dtable min-w-[640px]">
              <TableHead />
              {grouped.map(([day, { txs, trs }]) => {
                // Переводы в дневной итог не входят — деньги не появились и не исчезли
                const dayTotal = txs.reduce(
                  (s, x) => (x.type === 'income' ? s + txInBase(x, settings) : s - txInBase(x, settings)), 0);
                return (
                  <tbody key={day}>
                    <tr style={{ background: 'var(--bg-card2)' }}>
                      <td colSpan={4} className="py-2 text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                        {capitalize(formatDay(day))}
                      </td>
                      <td className="py-2 text-right text-[13px] font-bold num whitespace-nowrap"
                        style={{ color: dayTotal >= 0 ? 'var(--sage)' : 'var(--text-muted)' }}>
                        {signed(dayTotal)}
                      </td>
                      <td className="py-2" />
                    </tr>
                    {txs.map(tx => {
                      const cat = catById.get(tx.categoryId);
                      return (
                        <TxRow
                          key={tx.id}
                          tx={tx}
                          cat={cat}
                          subName={cat?.subcategories.find(s => s.id === tx.subcategoryId)?.name}
                          accountName={accById.get(tx.accountId)?.name}
                          settings={settings}
                          onRepeat={onRepeat ? () => onRepeat(tx) : undefined}
                          onEdit={() => setEditing(tx)}
                          onDelete={() => onDelete(tx)}
                        />
                      );
                    })}
                    {trs.map(tr => {
                      const from = accById.get(tr.fromAccountId);
                      const to = accById.get(tr.toAccountId);
                      return (
                        <tr key={tr.id}>
                          <td>
                            <div className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0"
                                style={{ background: 'var(--bg-card2)' }} aria-hidden="true">
                                <ArrowLeftRight size={15} style={{ color: 'var(--text-muted)' }} />
                              </span>
                              <span className="font-semibold">{t('list.transfer')}</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text)' }}>{tr.note ?? ''}</td>
                          <td className="whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                            <span className="inline-flex items-center gap-1">
                              {from?.name ?? '—'} <ArrowRight size={12} /> {to?.name ?? '—'}
                            </span>
                          </td>
                          <td className="text-right whitespace-nowrap num" style={{ color: 'var(--text-muted)' }}>
                            {formatMoney(tr.amountFrom, from?.currency ?? settings.baseCurrency)}
                            {from && to && from.currency !== to.currency && (
                              <span className="block text-xs">→ {formatMoney(tr.amountTo, to.currency)}</span>
                            )}
                          </td>
                          <td />
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
          {limit < filtered.length && (
            <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setLimit(l => l + PAGE)} className="btn-ghost w-full flex items-center justify-center gap-1">
                <ChevronDown size={16} />
                {t('list.showMore', { n: filtered.length - limit })}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}
