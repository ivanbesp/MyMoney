'use client';

import { useMemo } from 'react';
import { Transaction, Category, Period, Settings } from '@/lib/types';
import { filterByPeriod, calcStats, formatMoney, convertAmount } from '@/lib/storage';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format, parseISO, eachDayOfInterval, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, eachMonthOfInterval, eachWeekOfInterval } from 'date-fns';
import { ru } from 'date-fns/locale';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  period: Period;
  settings: Settings;
}

export default function Statistics({ transactions, categories, period, settings }: Props) {
  const filtered = useMemo(() => filterByPeriod(transactions, period), [transactions, period]);
  const { income, expense, balance } = useMemo(() => calcStats(filtered, settings), [filtered, settings]);

  const toBase = (t: Transaction) => convertAmount(t.amount, t.currency, settings.baseCurrency, settings.rates);

  // Expense by category (converted to base currency)
  const expenseByCategory = useMemo(() => {
    const map = new Map<string, number>();
    filtered.filter(t => t.type === 'expense').forEach(t => {
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + toBase(t));
    });
    return Array.from(map.entries())
      .map(([id, value]) => {
        const cat = categories.find(c => c.id === id);
        return { name: cat?.name ?? id, value, color: cat?.color ?? '#B8B8B8', icon: cat?.icon ?? '' };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [filtered, categories, settings]);

  // Timeline data (converted to base currency)
  const timelineData = useMemo(() => {
    const now = new Date();
    let intervals: Date[] = [];
    let fmt = '';

    if (period === 'week') {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      intervals = eachDayOfInterval({ start, end });
      fmt = 'EEE';
    } else if (period === 'month') {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      intervals = eachDayOfInterval({ start, end });
      fmt = 'd';
    } else if (period === 'year') {
      const start = startOfYear(now);
      const end = endOfYear(now);
      intervals = eachMonthOfInterval({ start, end });
      fmt = 'LLL';
    } else if (period === 'day') {
      return [];
    } else {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      intervals = eachMonthOfInterval({ start, end: now });
      fmt = 'LLL yy';
    }

    return intervals.map(date => {
      const key = period === 'year' || period === 'all'
        ? date.toISOString().slice(0, 7)
        : date.toISOString().slice(0, 10);

      const dayIncome = filtered
        .filter(t => t.type === 'income' && t.date.startsWith(key))
        .reduce((s, t) => s + toBase(t), 0);
      const dayExpense = filtered
        .filter(t => t.type === 'expense' && t.date.startsWith(key))
        .reduce((s, t) => s + toBase(t), 0);

      return {
        label: format(date, fmt, { locale: ru }),
        income: dayIncome,
        expense: dayExpense,
      };
    });
  }, [filtered, period, settings]);

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="card px-3 py-2 text-xs">
          <p className="font-medium mb-1">{payload[0]?.name}</p>
          <p style={{ color: 'var(--text-muted)' }}>{formatMoney(payload[0]?.value, settings.baseCurrency)}</p>
        </div>
      );
    }
    return null;
  };

  const barTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="card px-3 py-2 text-xs space-y-1">
          <p className="font-medium mb-1">{label}</p>
          {payload.map((p: any) => (
            <p key={p.name} style={{ color: p.fill }}>
              {p.name === 'income' ? 'Доходы' : 'Расходы'}: {formatMoney(p.value, settings.baseCurrency)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Доходы', value: income, color: 'var(--sage)' },
          { label: 'Расходы', value: expense, color: expense > income ? 'var(--red)' : 'var(--text)' },
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

      {/* Bar chart */}
      {timelineData.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-4">Динамика</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={timelineData} barGap={2} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${Math.round(v / 1000)}k` : v} width={35} />
              <Tooltip content={barTooltip} cursor={{ fill: 'var(--bg-card2)' }} />
              <Bar dataKey="income" fill="#6B8F71" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#E8C4A0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#6B8F71' }} />
              Доходы
            </div>
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#E8C4A0' }} />
              Расходы
            </div>
          </div>
        </div>
      )}

      {/* Pie chart */}
      {expenseByCategory.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-medium mb-4">Расходы по категориям</h3>
          <div className="flex gap-4 items-center">
            <div className="flex-shrink-0">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx={70}
                    cy={70}
                    innerRadius={38}
                    outerRadius={65}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expenseByCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={customTooltip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-1.5">
              {expenseByCategory.map(item => (
                <div key={item.name} className="flex items-center gap-2">
                  <span className="text-sm">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-xs truncate">{item.name}</span>
                      <span className="text-xs num ml-2 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {expense > 0 ? Math.round((item.value / expense) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-1 rounded-full mt-0.5 overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${expense > 0 ? (item.value / expense) * 100 : 0}%`, background: item.color }}
                      />
                    </div>
                  </div>
                </div>
              ))}
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
