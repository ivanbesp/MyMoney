'use client';

import { useMemo } from 'react';
import { Transaction, Category, Period, Settings, Account, Transfer } from '@/lib/types';
import { calcStats, filterByPeriod, formatMoney, txInBase, totalAccountsBalance } from '@/lib/storage';
import { useT } from '@/lib/i18n';
import { previousPeriodRange } from '@/lib/dates';
import { buildTimeline } from '@/lib/timeline';
import { useChartColors } from '@/lib/theme';
import { format, subMonths, getDate, getDaysInMonth } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';

/**
 * Виджеты обзора. Раньше здесь была одна карточка баланса с кольцом —
 * на широком экране её сменил ряд из четырёх цифр, график по дням и разбивка
 * по категориям. Файл сохранил имя, чтобы не ломать историю правок.
 */

interface KpiProps {
  transactions: Transaction[];
  accounts: Account[];
  transfers: Transfer[];
  period: Period;
  periodLabel: string;
  settings: Settings;
}

/** «к сентябрю»: в русском после «к» нужен дательный падеж, date-fns его не даёт */
const RU_MONTHS_DATIVE = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];

function usePrevLabel(period: Period) {
  const { t, dateLocale, lang } = useT();
  const now = new Date();
  const prevMonth = subMonths(now, 1);
  return period === 'day' ? t('prev.day')
    : period === 'week' ? t('prev.week')
    : period === 'month' ? t('prev.month', {
      month: lang === 'ru' ? RU_MONTHS_DATIVE[prevMonth.getMonth()] : format(prevMonth, 'LLLL', { locale: dateLocale }),
    })
    : period === 'year' ? t('prev.year', { year: now.getFullYear() - 1 })
    : null;
}

export default function KpiRow({ transactions, accounts, transfers, period, periodLabel, settings }: KpiProps) {
  const { t, plural } = useT();
  const periodTxs = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const { income, expense, balance } = useMemo(() => calcStats(periodTxs, settings), [periodTxs, settings]);
  const total = useMemo(
    () => totalAccountsBalance(accounts, transactions, transfers, settings),
    [accounts, transactions, transfers, settings],
  );
  const prevLabel = usePrevLabel(period);

  // Сравнение с тем же периодом в прошлом: отдельно доход и расход
  const prev = useMemo(() => {
    const range = previousPeriodRange(period);
    if (!range) return null;
    const txs = transactions.filter(x => x.date >= range.from && x.date <= range.to);
    return calcStats(txs, settings);
  }, [transactions, period, settings]);

  const delta = (cur: number, before: number | undefined) => {
    if (!prevLabel || !before || before <= 0) return null;
    const pct = Math.round(((cur - before) / before) * 100);
    return Number.isFinite(pct) ? pct : null;
  };
  const incomeDelta = delta(income, prev?.income);
  const expenseDelta = delta(expense, prev?.expense);
  const fmtDelta = (pct: number) => t('kpi.delta', { sign: pct > 0 ? '+' : pct < 0 ? '−' : '±', pct: Math.abs(pct), period: prevLabel ?? '' });

  const now = new Date();
  const daysLeft = getDaysInMonth(now) - getDate(now) + 1;
  const isMonth = period === 'month';
  const negative = balance < 0;

  const heroSub = isMonth
    ? negative ? t('kpi.overspent')
      : t('kpi.perDay', { value: formatMoney(Math.floor(balance / daysLeft), settings.baseCurrency), days: plural(daysLeft, 'days') })
    : income > 0 ? t('balance.spentShare', { pct: Math.round((expense / income) * 100) }) : t('balance.noIncome');

  const muted = { color: 'var(--text-muted)' };

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
      <div
        className="rounded-2xl px-5 py-[18px]"
        style={negative
          ? { background: 'var(--bg-card)', border: '1px solid var(--red)' }
          : { background: 'var(--sage)', color: 'var(--sage-on)' }}
      >
        <div className="text-[13px] font-semibold" style={negative ? muted : { opacity: 0.85 }}>
          {isMonth ? t('kpi.free') : t('balance.label', { period: periodLabel })}
        </div>
        <div className="num-hero text-[32px] leading-tight mt-1.5 truncate" style={negative ? { color: 'var(--red)' } : undefined}>
          {negative ? '−' : ''}{formatMoney(Math.abs(balance), settings.baseCurrency)}
        </div>
        <div className="text-[13px] mt-1" style={negative ? muted : { opacity: 0.85 }}>{heroSub}</div>
      </div>

      <div className="card px-5 py-[18px]">
        <div className="text-[13px] font-semibold" style={muted}>{t('kpi.income')}</div>
        <div className="num-hero text-[28px] leading-tight mt-1.5 truncate" style={{ color: 'var(--sage)' }}>
          {formatMoney(income, settings.baseCurrency)}
        </div>
        <div className="text-[13px] mt-1" style={muted}>
          {incomeDelta !== null ? fmtDelta(incomeDelta) : ' '}
        </div>
      </div>

      <div className="card px-5 py-[18px]">
        <div className="text-[13px] font-semibold" style={muted}>{t('kpi.expense')}</div>
        <div className="num-hero text-[28px] leading-tight mt-1.5 truncate" style={{ color: 'var(--expense)' }}>
          {formatMoney(expense, settings.baseCurrency)}
        </div>
        <div
          className="text-[13px] mt-1 font-semibold"
          style={{ color: expenseDelta === null ? 'var(--text-muted)' : expenseDelta <= 0 ? 'var(--tone-good-fg)' : 'var(--tone-warning-fg)' }}
        >
          {expenseDelta !== null ? fmtDelta(expenseDelta) : ' '}
        </div>
      </div>

      <div className="card px-5 py-[18px]">
        <div className="text-[13px] font-semibold" style={muted}>{t('kpi.accounts')}</div>
        <div className="num-hero text-[28px] leading-tight mt-1.5 truncate" style={{ color: total < 0 ? 'var(--red)' : 'var(--text)' }}>
          {formatMoney(total, settings.baseCurrency)}
        </div>
        <div className="text-[13px] mt-1 truncate" style={muted}>
          {accounts.slice(0, 3).map(a => a.name).join(' · ')}{accounts.length > 3 ? ` +${accounts.length - 3}` : ''}
        </div>
      </div>
    </div>
  );
}

// ─── График трат ──────────────────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean;
  payload?: { value?: number; payload?: { label: string } }[];
}

export function SpendingChart({ transactions, period, settings, theme }: {
  transactions: Transaction[];
  period: Period;
  settings: Settings;
  theme: 'light' | 'dark';
}) {
  const { t, dateLocale } = useT();
  const colors = useChartColors(theme);
  const { points, byMonth } = useMemo(
    () => buildTimeline(transactions, period, settings, dateLocale),
    [transactions, period, settings, dateLocale],
  );

  // Среднее — только по прошедшим столбикам, иначе пустое будущее его занижает
  const past = points.filter(p => !p.future);
  const avg = past.length ? past.reduce((s, p) => s + p.expense, 0) / past.length : 0;
  const hasData = points.some(p => p.expense > 0);

  const tip = ({ active, payload }: ChartTooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card px-3 py-2 text-xs">
        <p className="font-semibold mb-0.5">{payload[0]?.payload?.label}</p>
        <p style={{ color: 'var(--text-muted)' }}>{formatMoney(payload[0]?.value ?? 0, settings.baseCurrency)}</p>
      </div>
    );
  };

  return (
    <section className="card px-5 py-[18px] min-w-0">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-[15px] font-bold">{byMonth ? t('chart.byMonth') : t('chart.byDay')}</h2>
        {hasData && (
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {t(byMonth ? 'chart.avgMonth' : 'chart.avgDay', { value: formatMoney(Math.round(avg), settings.baseCurrency) })}
          </span>
        )}
      </div>
      <div className="mt-4" role="img" aria-label={t('chart.aria')}>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={points} barCategoryGap="18%" margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: colors.muted }}
              axisLine={{ stroke: colors.grid }}
              tickLine={false}
              interval={points.length > 14 ? 'preserveStartEnd' : 0}
              minTickGap={8}
            />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip content={tip} cursor={{ fill: colors.grid, fillOpacity: 0.35 }} />
            {avg > 0 && <ReferenceLine y={avg} stroke={colors.muted} strokeDasharray="4 4" strokeOpacity={0.6} />}
            <Bar dataKey="expense" radius={[4, 4, 0, 0]} minPointSize={2}>
              {points.map(p => (
                <Cell
                  key={p.key}
                  fill={p.current ? colors.income : colors.bar}
                  fillOpacity={p.future ? 0.4 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

// ─── Куда ушли деньги ─────────────────────────────────────────────────────────

const SHARE_SLICES = 4;

export function CategoryShare({ transactions, categories, period, settings }: {
  transactions: Transaction[];
  categories: Category[];
  period: Period;
  settings: Settings;
}) {
  const { t } = useT();
  const rows = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of filterByPeriod(transactions, period)) {
      if (x.type !== 'expense') continue;
      map.set(x.categoryId, (map.get(x.categoryId) ?? 0) + txInBase(x, settings));
    }
    const sorted = Array.from(map.entries())
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id);
        return { id, name: cat?.name ?? t('list.noCategory'), color: cat?.color ?? '#B8B8B8', value };
      })
      .sort((a, b) => b.value - a.value);
    const head = sorted.slice(0, SHARE_SLICES);
    const rest = sorted.slice(SHARE_SLICES).reduce((s, r) => s + r.value, 0);
    return rest > 0
      ? [...head, { id: 'rest', name: t('share.rest'), color: 'var(--border-strong)', value: rest }]
      : head;
  }, [transactions, categories, period, settings, t]);

  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <section className="card px-5 py-[18px] min-w-0">
      <h2 className="text-[15px] font-bold">{t('share.title')}</h2>
      {total <= 0 ? (
        <p className="text-sm mt-4" style={{ color: 'var(--text-muted)' }}>{t('share.empty')}</p>
      ) : (
        <>
          <div
            className="flex h-3 rounded-md overflow-hidden mt-[18px] gap-0.5"
            role="img"
            aria-label={rows.map(r => `${r.name} ${Math.round((r.value / total) * 100)}%`).join(', ')}
          >
            {rows.map(r => (
              <div key={r.id} style={{ width: `${(r.value / total) * 100}%`, background: r.color }} />
            ))}
          </div>
          <div className="flex flex-col gap-3 mt-[18px]">
            {rows.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 text-sm">
                <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: r.color }} />
                <span className="flex-1 font-semibold truncate">{r.name}</span>
                <span className="num w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                  {Math.round((r.value / total) * 100)}%
                </span>
                <span className="num font-bold text-right" style={{ minWidth: 96 }}>
                  {formatMoney(Math.round(r.value), settings.baseCurrency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
