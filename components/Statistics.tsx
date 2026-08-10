'use client';

import { useMemo } from 'react';
import { Transaction, Category, Period, Settings } from '@/lib/types';
import { filterByPeriod, calcStats, formatMoney, txInBase } from '@/lib/storage';
import { dayKey, monthKey } from '@/lib/dates';
import { useChartColors } from '@/lib/theme';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear,
  eachDayOfInterval, eachMonthOfInterval,
} from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  period: Period;
  settings: Settings;
  theme: 'light' | 'dark';
}

interface TooltipProps {
  active?: boolean;
  label?: string;
  payload?: { name?: string; value?: number; fill?: string }[];
}

const MAX_PIE_SLICES = 7;

export default function Statistics({ transactions, categories, period, settings, theme }: Props) {
  // Recharts принимает только конкретные цвета — переменные приходится вычислять
  const chart = useChartColors(theme);
  const filtered = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const { income, expense, balance } = useMemo(() => calcStats(filtered, settings), [filtered, settings]);

  // Расходы по категориям: топ-N плюс «Прочее», иначе проценты не складывались в 100%
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type !== 'expense') continue;
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + txInBase(t, settings));
    }
    const all = Array.from(map.entries())
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id);
        return { name: cat?.name ?? 'Без категории', value, color: cat?.color ?? '#B8B8B8', icon: cat?.icon ?? '📦' };
      })
      .sort((a, b) => b.value - a.value);

    if (all.length <= MAX_PIE_SLICES) return all;
    const head = all.slice(0, MAX_PIE_SLICES);
    const restValue = all.slice(MAX_PIE_SLICES).reduce((s, c) => s + c.value, 0);
    return [...head, { name: 'Прочее', value: restValue, color: '#B8B8B8', icon: '📦' }];
  }, [filtered, categories, settings]);

  // Динамика. Ключи считаются локальным format(), а не toISOString():
  // из-за UTC-конвертации столбцы уезжали на день назад в UTC+ зонах.
  const timelineData = useMemo(() => {
    if (period === 'day') return [];

    const now = new Date();
    let intervals: Date[];
    let labelFmt: string;
    let byMonth = false;

    if (period === 'week') {
      intervals = eachDayOfInterval({ start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
      labelFmt = 'EEE';
    } else if (period === 'month') {
      intervals = eachDayOfInterval({ start: startOfMonth(now), end: endOfMonth(now) });
      labelFmt = 'd';
    } else if (period === 'year') {
      intervals = eachMonthOfInterval({ start: startOfYear(now), end: endOfYear(now) });
      labelFmt = 'LLL';
      byMonth = true;
    } else {
      intervals = eachMonthOfInterval({ start: new Date(now.getFullYear() - 1, now.getMonth(), 1), end: now });
      labelFmt = 'LLL yy';
      byMonth = true;
    }

    // Один проход по операциям вместо фильтрации внутри цикла по дням
    const income = new Map<string, number>();
    const expense = new Map<string, number>();
    for (const t of filtered) {
      const key = byMonth ? t.date.slice(0, 7) : t.date;
      const target = t.type === 'income' ? income : expense;
      target.set(key, (target.get(key) ?? 0) + txInBase(t, settings));
    }

    return intervals.map(date => {
      const key = byMonth ? monthKey(date) : dayKey(date);
      return {
        label: format(date, labelFmt, { locale: ru }),
        income: income.get(key) ?? 0,
        expense: expense.get(key) ?? 0,
      };
    });
  }, [filtered, period, settings]);

  const pieTooltip = ({ active, payload }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card px-3 py-2 text-xs">
        <p className="font-medium mb-1">{payload[0]?.name}</p>
        <p style={{ color: 'var(--text-muted)' }}>{formatMoney(payload[0]?.value ?? 0, settings.baseCurrency)}</p>
      </div>
    );
  };

  const barTooltip = ({ active, payload, label }: TooltipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card px-3 py-2 text-xs space-y-1">
        <p className="font-medium mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.name} style={{ color: p.fill }}>
            {p.name === 'income' ? 'Доходы' : 'Расходы'}: {formatMoney(p.value ?? 0, settings.baseCurrency)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Доходы', value: income, color: 'var(--sage)', prefix: '' },
          { label: 'Расходы', value: expense, color: 'var(--expense)', prefix: '' },
          { label: 'Баланс', value: balance, color: balance >= 0 ? 'var(--sage)' : 'var(--red)', prefix: balance > 0 ? '+' : '' },
        ].map(item => (
          <div key={item.label} className="card p-4 text-center">
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{item.label}</div>
            <div className="num text-base font-medium" style={{ color: item.color }}>
              {item.prefix}{formatMoney(item.value, settings.baseCurrency)}
            </div>
          </div>
        ))}
      </div>

      {timelineData.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-4">Динамика</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={timelineData} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.muted }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 10, fill: chart.muted }}
                axisLine={false}
                tickLine={false}
                tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                width={35}
              />
              <Tooltip content={barTooltip} cursor={{ fill: chart.grid, fillOpacity: 0.4 }} />
              <Bar dataKey="income" fill={chart.income} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill={chart.expense} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: chart.income }} />
              Доходы
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: chart.expense }} />
              Расходы
            </div>
          </div>
        </div>
      )}

      {expenseByCategory.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-4">Расходы по категориям</h3>
          <div className="flex gap-4 items-center">
            <div className="flex-shrink-0">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie data={expenseByCategory} cx={70} cy={70} innerRadius={38} outerRadius={65} paddingAngle={2} dataKey="value">
                    {expenseByCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={pieTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {expenseByCategory.map(item => {
                const pct = expense > 0 ? (item.value / expense) * 100 : 0;
                return (
                  <div key={item.name} className="flex items-center gap-2">
                    <span className="text-sm">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <span className="text-xs truncate">{item.name}</span>
                        <span className="text-xs num ml-2 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full mt-0.5 overflow-hidden" style={{ background: 'var(--border)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: item.color }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">📊</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Нет данных для отображения</p>
        </div>
      )}
    </div>
  );
}
