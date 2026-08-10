'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  Transaction, Category, Period, Settings, TransactionType,
  Account, Transfer, ACCOUNT_KIND_ICONS,
} from '@/lib/types';
import { filterByPeriod, formatMoney, txInBase, sortTransactions } from '@/lib/storage';
import { parseDay, periodRange } from '@/lib/dates';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Trash2, Pencil, ChevronDown, Search, X, SlidersHorizontal, RotateCcw,
  ArrowLeftRight, ArrowRight,
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
  /** Панель поиска нужна только на вкладке «Записи», на обзоре она лишняя */
  searchable?: boolean;
}

const PAGE = 20;
type TypeFilter = TransactionType | 'all';

export default function TransactionList({
  transactions, categories, accounts, transfers = [], period, settings,
  onDelete, onUpdate, onRepeat, searchable = false,
}: Props) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // При смене периода или фильтров список начинается заново
  useEffect(() => { setLimit(PAGE); }, [period, query, typeFilter, categoryFilter]);

  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const filtered = useMemo(() => {
    let list = filterByPeriod(transactions, period);
    if (typeFilter !== 'all') list = list.filter(t => t.type === typeFilter);
    if (categoryFilter !== 'all') list = list.filter(t => t.categoryId === categoryFilter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const cat = catById.get(t.categoryId);
        const sub = cat?.subcategories.find(s => s.id === t.subcategoryId);
        // Ищем и по сумме тоже: «420» находит запись на 420 ₽
        const haystack = [t.note, cat?.name, sub?.name, String(t.amount), t.date]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return sortTransactions(list);
  }, [transactions, period, typeFilter, categoryFilter, query, catById]);

  const total = useMemo(
    () => filtered.reduce((s, t) => (t.type === 'income' ? s + txInBase(t, settings) : s - txInBase(t, settings)), 0),
    [filtered, settings],
  );

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  /**
   * Переводы показываем в истории, но они не доход и не расход: в дневной итог
   * и в поисковую сумму не входят. Фильтры по типу и категории их скрывают —
   * у перевода нет ни того, ни другого.
   */
  const visibleTransfers = useMemo(() => {
    if (typeFilter !== 'all' || categoryFilter !== 'all') return [];
    const range = periodRange(period);
    let list = range ? transfers.filter(t => t.date >= range.from && t.date <= range.to) : transfers;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const from = accById.get(t.fromAccountId)?.name ?? '';
        const to = accById.get(t.toAccountId)?.name ?? '';
        return [t.note, from, to, String(t.amountFrom), t.date, 'перевод']
          .filter(Boolean).join(' ').toLowerCase().includes(q);
      });
    }
    return list;
  }, [transfers, period, query, typeFilter, categoryFilter, accById]);

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
    const shownDays = new Set(page.map(t => t.date));
    for (const tr of visibleTransfers) {
      if (shownDays.has(tr.date) || page.length === 0) bucket(tr.date).trs.push(tr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, limit, visibleTransfers]);

  const usedCategories = useMemo(() => {
    const ids = new Set(filterByPeriod(transactions, period).map(t => t.categoryId));
    return categories.filter(c => ids.has(c.id));
  }, [transactions, period, categories]);

  const getSub = (catId: string, subId?: string) =>
    subId ? catById.get(catId)?.subcategories.find(s => s.id === subId) ?? null : null;

  const formatDay = (dayKey: string) => {
    try {
      return format(parseDay(dayKey), 'd MMMM, EEEE', { locale: ru });
    } catch {
      return dayKey;
    }
  };

  const hasFilters = typeFilter !== 'all' || categoryFilter !== 'all';

  const searchPanel = searchable && (
    <div className="space-y-2 mb-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-faint)' }}
            aria-hidden="true"
          />
          <input
            className="input pl-10 pr-10"
            type="search"
            placeholder="Поиск по записям"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Поиск по записям"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Очистить поиск"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(v => !v)}
          aria-label="Фильтры"
          aria-expanded={showFilters}
          className="px-3 rounded-lg flex-shrink-0 transition-colors"
          style={{
            background: hasFilters ? 'var(--sage)' : 'var(--bg-card)',
            color: hasFilters ? 'var(--sage-on)' : 'var(--text-muted)',
            border: `1px solid ${hasFilters ? 'var(--sage)' : 'var(--border)'}`,
          }}
        >
          <SlidersHorizontal size={16} />
        </button>
      </div>

      {showFilters && (
        <div className="card p-3 space-y-3 animate-fade-in">
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Тип</div>
            <div className="flex gap-1.5">
              {([['all', 'Все'], ['expense', 'Расходы'], ['income', 'Доходы']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setTypeFilter(v as TypeFilter)}
                  className="chip"
                  aria-pressed={typeFilter === v}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Категория</div>
            <select
              className="input"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              aria-label="Фильтр по категории"
            >
              <option value="all">Все категории</option>
              {usedCategories.map(c => (
                <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>
          {hasFilters && (
            <button
              className="btn-ghost w-full"
              onClick={() => { setTypeFilter('all'); setCategoryFilter('all'); }}
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

      {(query || hasFilters) && (
        <div className="flex justify-between text-xs px-1" style={{ color: 'var(--text-muted)' }}>
          <span>Найдено: {filtered.length}</span>
          <span className="num">
            Итого {total >= 0 ? '+' : '−'}{formatMoney(Math.abs(total), settings.baseCurrency)}
          </span>
        </div>
      )}
    </div>
  );

  if (filtered.length === 0 && visibleTransfers.length === 0) {
    return (
      <>
        {searchPanel}
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {query || hasFilters ? 'Ничего не нашлось — попробуйте изменить запрос' : 'Нет записей за выбранный период'}
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      {editing && (
        <TransactionForm
          categories={categories}
          accounts={accounts}
          settings={settings}
          onAdd={onUpdate}
          onClose={() => setEditing(null)}
          initial={editing}
        />
      )}

      {searchPanel}

      <div className="space-y-3">
        {grouped.map(([day, { txs, trs }]) => {
          // Переводы в дневной итог не входят — деньги не появились и не исчезли
          const dayTotal = txs.reduce(
            (s, t) => (t.type === 'income' ? s + txInBase(t, settings) : s - txInBase(t, settings)), 0);

          return (
            <div key={day} className="card overflow-hidden">
              <div
                className="px-4 py-2.5 flex justify-between items-center"
                style={{ background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xs font-medium capitalize" style={{ color: 'var(--text-muted)' }}>
                  {formatDay(day)}
                </span>
                <span
                  className="text-xs font-medium num"
                  style={{ color: dayTotal >= 0 ? 'var(--sage)' : 'var(--text-muted)' }}
                >
                  {dayTotal >= 0 ? '+' : '−'}{formatMoney(Math.abs(dayTotal), settings.baseCurrency)}
                </span>
              </div>

              {txs.map((tx, i) => {
                const cat = catById.get(tx.categoryId);
                const sub = getSub(tx.categoryId, tx.subcategoryId);
                const isForeign = tx.currency !== settings.baseCurrency;
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 px-4 py-3 row-hover transition-colors"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
                      style={{ background: cat ? cat.color + '22' : 'var(--bg-card2)' }}
                    >
                      {cat?.icon ?? '💸'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {sub ? sub.name : (cat?.name ?? 'Без категории')}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {[
                          sub ? cat?.name : null,
                          tx.note,
                          !sub && !tx.note ? cat?.name : null,
                          // Счёт показываем, только когда их несколько
                          accounts.length > 1 ? accById.get(tx.accountId)?.name : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div
                        className="num font-medium"
                        style={{ color: tx.type === 'income' ? 'var(--sage)' : 'var(--text)' }}
                      >
                        {tx.type === 'income' ? '+' : '−'}{formatMoney(tx.amount, tx.currency)}
                      </div>
                      {isForeign && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          ≈ {formatMoney(txInBase(tx, settings), settings.baseCurrency)}
                        </div>
                      )}
                    </div>

                    {/* На тач-устройствах кнопки видны всегда: hover там не существует,
                        а вкладка спроектирована под телефон. */}
                    <div className="row-actions flex gap-0.5 flex-shrink-0">
                      {onRepeat && (
                        <button
                          onClick={() => onRepeat(tx)}
                          className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors"
                          aria-label="Повторить сегодня"
                          title="Повторить сегодня"
                        >
                          <RotateCcw size={14} style={{ color: 'var(--text-muted)' }} />
                        </button>
                      )}
                      <button
                        onClick={() => setEditing(tx)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors"
                        aria-label="Редактировать запись"
                        title="Редактировать"
                      >
                        <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                      </button>
                      <button
                        onClick={() => onDelete(tx)}
                        className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors"
                        aria-label="Удалить запись"
                        title="Удалить"
                      >
                        <Trash2 size={14} style={{ color: 'var(--red)' }} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {trs.map(tr => {
                const from = accById.get(tr.fromAccountId);
                const to = accById.get(tr.toAccountId);
                return (
                  <div
                    key={tr.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderTop: '1px solid var(--border)' }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--bg-card2)' }}
                    >
                      <ArrowLeftRight size={15} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-1">
                        {from?.name ?? '—'}
                        <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                        {to?.name ?? '—'}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                        {['Перевод', tr.note].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="num" style={{ color: 'var(--text-muted)' }}>
                        {formatMoney(tr.amountFrom, from?.currency ?? settings.baseCurrency)}
                      </div>
                      {from && to && from.currency !== to.currency && (
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          → {formatMoney(tr.amountTo, to.currency)}
                        </div>
                      )}
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
            Показать ещё ({filtered.length - limit})
          </button>
        )}
      </div>
    </>
  );
}
