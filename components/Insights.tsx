'use client';

import { useMemo } from 'react';
import { Transaction, Category, Settings } from '@/lib/types';
import { filterByPeriod, calcStats, formatMoney, txInBase } from '@/lib/storage';
import { dayKey } from '@/lib/dates';
import { subDays, getDate, getDaysInMonth } from 'date-fns';
import { Lightbulb } from 'lucide-react';

interface Props {
  transactions: Transaction[];
  categories: Category[];
  settings: Settings;
}

interface Insight {
  emoji: string;
  text: string;
  type: 'good' | 'warning' | 'info';
}

export default function Insights({ transactions, categories, settings }: Props) {
  const insights = useMemo<Insight[]>(() => {
    if (transactions.length === 0) {
      return [{ emoji: '👋', text: 'Начните добавлять записи, чтобы увидеть аналитику', type: 'info' }];
    }

    const result: Insight[] = [];
    const monthly = filterByPeriod(transactions, 'month');
    const { income, expense } = calcStats(monthly, settings);

    // Норма сбережений
    if (income > 0) {
      const saving = ((income - expense) / income) * 100;
      if (saving >= 20) result.push({ emoji: '🌟', text: `Вы откладываете ${Math.round(saving)}% от дохода. Отлично!`, type: 'good' });
      else if (saving > 0) result.push({ emoji: '💡', text: `Попробуйте откладывать больше 20% — сейчас ${Math.round(saving)}%`, type: 'info' });
      else result.push({ emoji: '⚠️', text: `Расходы превышают доходы на ${formatMoney(expense - income, settings.baseCurrency)} в этом месяце`, type: 'warning' });
    } else if (expense > 0) {
      result.push({ emoji: '⚠️', text: `За этот месяц потрачено ${formatMoney(expense, settings.baseCurrency)}, доходов не записано`, type: 'warning' });
    }

    // Самая тяжёлая категория расходов
    const catMap = new Map<string, number>();
    for (const t of monthly) {
      if (t.type !== 'expense') continue;
      catMap.set(t.categoryId, (catMap.get(t.categoryId) ?? 0) + txInBase(t, settings));
    }
    const topCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCat && expense > 0) {
      const cat = categories.find(c => c.id === topCat[0]);
      const pct = Math.round((topCat[1] / expense) * 100);
      if (pct > 40) {
        result.push({ emoji: cat?.icon ?? '📊', text: `«${cat?.name ?? 'Без категории'}» забирает ${pct}% всех расходов`, type: 'warning' });
      }
    }

    // Серия дней подряд. Ключи локальные — раньше здесь был toISOString(),
    // и после полуночи по UTC серия обрывалась на ровном месте.
    const days = new Set(transactions.map(t => t.date));
    const now = new Date();
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      if (days.has(dayKey(subDays(now, i)))) streak++;
      else break;
    }
    if (streak >= 7) result.push({ emoji: '🔥', text: `${streak} дней подряд ведёте учёт. Так держать!`, type: 'good' });

    // Прогноз до конца месяца
    const daysPassed = getDate(now);
    if (expense > 0 && daysPassed > 3) {
      const projected = (expense / daysPassed) * getDaysInMonth(now);
      if (income > 0 && projected > income) {
        result.push({
          emoji: '📈',
          text: `При текущем темпе к концу месяца расходы составят ~${formatMoney(Math.round(projected), settings.baseCurrency)}`,
          type: 'warning',
        });
      }
    }

    // Напоминание о курсах
    const foreign = monthly.filter(t => t.currency !== settings.baseCurrency);
    if (foreign.length >= 3) {
      const currencies = Array.from(new Set(foreign.map(t => t.currency)));
      result.push({
        emoji: '💱',
        text: `${foreign.length} операций в ${currencies.join(' и ')} в этом месяце — проверьте, актуален ли курс в настройках`,
        type: 'info',
      });
    }

    if (result.length === 0) {
      result.push({ emoji: '✅', text: 'Финансы в порядке. Продолжайте вести учёт!', type: 'good' });
    }

    return result.slice(0, 2);
  }, [transactions, categories, settings]);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Lightbulb size={13} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Инсайты</span>
      </div>
      {/* Раньше каждый инсайт сидел в своей пастельной рамке — три цветных
          прямоугольника подряд спорили с палитрой. Хватает цветной иконки. */}
      <div className="card">
        {insights.map((ins, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 px-4 py-3 text-sm"
            style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
          >
            <span
              className="flex items-center justify-center flex-shrink-0 rounded-lg text-sm"
              style={{ width: 26, height: 26, background: `var(--tone-${ins.type}-bg)` }}
              aria-hidden="true"
            >
              {ins.emoji}
            </span>
            <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
