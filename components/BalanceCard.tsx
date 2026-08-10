'use client';

import { useMemo } from 'react';
import { Transaction, Category, Period, Settings } from '@/lib/types';
import { calcStats, filterByPeriod, formatMoney, txInBase } from '@/lib/storage';
import { previousPeriodLabel, previousPeriodRange } from '@/lib/dates';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  period: Period;
  periodLabel: string;
  settings: Settings;
}

const MAX_SLICES = 5;

/**
 * Одна карточка вместо трёх блоков, которые раньше показывали одни и те же
 * числа: баланс, «финансовый пульс» и сводка расходились ещё и по периоду —
 * карточка следовала выбранному периоду, а пульс всегда считал месяц.
 */
export default function BalanceCard({ transactions, categories, period, periodLabel, settings }: Props) {
  const periodTxs = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const { income, expense, balance } = useMemo(() => calcStats(periodTxs, settings), [periodTxs, settings]);

  // Доля дохода, которую съели расходы — заменяет отдельный датчик «пульса»
  const ratio = income > 0 ? Math.min(expense / income, 1) : expense > 0 ? 1 : 0;
  const health =
    income === 0 && expense === 0 ? { label: 'Нет данных', color: 'var(--text-muted)' }
    : ratio < 0.5  ? { label: 'Отлично',   color: 'var(--sage)' }
    : ratio < 0.75 ? { label: 'Умеренно',  color: 'var(--sage)' }
    : ratio < 0.95 ? { label: 'Осторожно', color: 'var(--expense)' }
    :                { label: 'Критично',  color: 'var(--red)' };

  // Сравнение расходов с прошлым периодом — понятнее, чем сравнение баланса:
  // баланс легко меняет знак, и процент становится бессмысленным
  const delta = useMemo(() => {
    const prev = previousPeriodRange(period);
    const label = previousPeriodLabel(period);
    if (!prev || !label) return null;
    const prevExpense = transactions
      .filter(t => t.type === 'expense' && t.date >= prev.from && t.date <= prev.to)
      .reduce((s, t) => s + txInBase(t, settings), 0);
    if (prevExpense <= 0) return null;
    const pct = Math.round(((expense - prevExpense) / prevExpense) * 100);
    if (!Number.isFinite(pct)) return null;
    return { pct, label };
  }, [transactions, period, settings, expense]);

  // Кольцо расходов по категориям через conic-gradient: без библиотеки и
  // без перерисовки при смене темы
  const ring = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of periodTxs) {
      if (t.type !== 'expense') continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + txInBase(t, settings));
    }
    const sorted = Array.from(map.entries())
      .map(([id, value]) => ({ value, color: categories.find(c => c.id === id)?.color ?? '#B8B8B8' }))
      .sort((a, b) => b.value - a.value);
    const total = sorted.reduce((s, c) => s + c.value, 0);
    if (total <= 0) return 'conic-gradient(var(--bg-card2) 0 100%)';

    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES).reduce((s, c) => s + c.value, 0);
    const slices = rest > 0 ? [...head, { value: rest, color: 'var(--border-strong)' }] : head;

    let at = 0;
    const stops = slices.map(s => {
      const from = (at / total) * 100;
      at += s.value;
      return `${s.color} ${from.toFixed(2)}% ${((at / total) * 100).toFixed(2)}%`;
    });
    return `conic-gradient(${stops.join(',')})`;
  }, [periodTxs, categories, settings]);

  const compact = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
    if (abs >= 1_000) return Math.round(n / 1000) + 'k';
    return String(Math.round(n));
  };

  return (
    <div className="card p-4">
      <div className="flex gap-4 items-center mb-4">
        <div
          className="rounded-full flex items-center justify-center flex-shrink-0"
          style={{ width: 86, height: 86, background: ring }}
          role="img"
          aria-label={`Расходы за период: ${formatMoney(expense, settings.baseCurrency)}`}
        >
          <div
            className="rounded-full flex flex-col items-center justify-center"
            style={{ width: 60, height: 60, background: 'var(--bg-card)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>расход</span>
            <span className="text-xs num" style={{ color: 'var(--text)' }}>{compact(expense)}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Остаток · {periodLabel}</div>
          <div
            className="num-hero text-3xl truncate"
            style={{ color: balance >= 0 ? 'var(--text)' : 'var(--red)' }}
          >
            {balance >= 0 ? '' : '−'}{formatMoney(Math.abs(balance), settings.baseCurrency)}
          </div>
          {delta && (
            <div
              className="inline-block text-xs mt-1.5 px-2 py-0.5 rounded-full"
              style={{
                background: delta.pct <= 0 ? 'var(--tone-good-bg)' : 'var(--tone-warning-bg)',
                color: delta.pct <= 0 ? 'var(--tone-good-fg)' : 'var(--tone-warning-fg)',
              }}
            >
              Расходы {delta.pct > 0 ? '+' : '−'}{Math.abs(delta.pct)}% {delta.label}
            </div>
          )}
        </div>
      </div>

      <div className="h-1.5 rounded-full overflow-hidden mb-1.5" style={{ background: 'var(--bg-card2)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${ratio * 100}%`, background: health.color }}
        />
      </div>
      <div className="flex justify-between text-xs mb-4">
        <span style={{ color: 'var(--text-muted)' }}>
          {income > 0 ? `Потрачено ${Math.round(ratio * 100)}% дохода` : 'Доходов за период нет'}
        </span>
        <span style={{ color: health.color }}>{health.label}</span>
      </div>

      <div className="flex gap-2">
        <div className="tile flex-1 px-3 py-2">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Доходы</div>
          <div className="num text-[15px] font-medium" style={{ color: 'var(--sage)' }}>
            {formatMoney(income, settings.baseCurrency)}
          </div>
        </div>
        <div className="tile flex-1 px-3 py-2">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Расходы</div>
          <div className="num text-[15px] font-medium" style={{ color: 'var(--expense)' }}>
            {formatMoney(expense, settings.baseCurrency)}
          </div>
        </div>
      </div>
    </div>
  );
}
