'use client';

import { useMemo } from 'react';
import { Transaction, Category, Settings } from '@/lib/types';
import { filterByPeriod, calcStats, formatMoney, convertAmount } from '@/lib/storage';
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
    const result: Insight[] = [];
    const monthly = filterByPeriod(transactions, 'month');
    const { income, expense, balance } = calcStats(monthly, settings);
    const toBase = (t: Transaction) => convertAmount(t.amount, t.currency, settings.baseCurrency, settings.rates);

    // No data
    if (transactions.length === 0) {
      return [{ emoji: '👋', text: 'Начните добавлять записи, чтобы увидеть аналитику', type: 'info' }];
    }

    // Saving rate
    if (income > 0) {
      const saving = ((income - expense) / income) * 100;
      if (saving >= 20) result.push({ emoji: '🌟', text: `Вы откладываете ${Math.round(saving)}% от дохода. Отлично!`, type: 'good' });
      else if (saving > 0) result.push({ emoji: '💡', text: `Попробуйте откладывать больше 20% — сейчас ${Math.round(saving)}%`, type: 'info' });
      else if (expense > income) result.push({ emoji: '⚠️', text: `Расходы превышают доходы на ${formatMoney(expense - income, settings.baseCurrency)} в этом месяце`, type: 'warning' });
    }

    // Top expense category
    const catMap = new Map<string, number>();
    monthly.filter(t => t.type === 'expense').forEach(t => catMap.set(t.categoryId, (catMap.get(t.categoryId) ?? 0) + toBase(t)));
    const topCat = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1])[0];
    if (topCat && expense > 0) {
      const cat = categories.find(c => c.id === topCat[0]);
      const pct = Math.round((topCat[1] / expense) * 100);
      if (pct > 40) {
        result.push({ emoji: cat?.icon ?? '📊', text: `«${cat?.name}» забирает ${pct}% всех расходов`, type: 'warning' });
      }
    }

    // Streak: consecutive days with entries
    const days = new Set(transactions.map(t => t.date.slice(0, 10)));
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toISOString().slice(0, 10))) streak++;
      else break;
    }
    if (streak >= 7) result.push({ emoji: '🔥', text: `${streak} дней подряд ведёте учёт. Так держать!`, type: 'good' });

    // Daily average this month
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const daysPassed = today.getDate();
    if (expense > 0 && daysPassed > 3) {
      const avgDay = expense / daysPassed;
      const projected = avgDay * daysInMonth;
      if (income > 0 && projected > income) {
        result.push({ emoji: '📈', text: `При текущем темпе к концу месяца расходы составят ~${formatMoney(Math.round(projected), settings.baseCurrency)}`, type: 'warning' });
      }
    }

    // Foreign currency usage — only if rates look stale-ish (informational nudge)
    const foreignTx = monthly.filter(t => t.currency !== settings.baseCurrency);
    if (foreignTx.length >= 3) {
      const currencies = Array.from(new Set(foreignTx.map(t => t.currency)));
      result.push({
        emoji: '💱',
        text: `${foreignTx.length} операций в ${currencies.join(' и ')} в этом месяце — проверьте, актуален ли курс в настройках`,
        type: 'info',
      });
    }

    if (result.length === 0) {
      result.push({ emoji: '✅', text: 'Финансы в порядке. Продолжайте вести учёт!', type: 'good' });
    }

    return result.slice(0, 3);
  }, [transactions, categories, settings]);

  const colors = {
    good: { bg: '#f0f4f1', border: '#A8C5A0', icon: '#6B8F71' },
    warning: { bg: '#faf3ec', border: '#E8C4A0', icon: '#C2885A' },
    info: { bg: '#f0f4f8', border: '#A8B8C5', icon: '#5A7A8F' },
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-3">
        <Lightbulb size={14} style={{ color: 'var(--text-muted)' }} />
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Инсайты</span>
      </div>
      {insights.map((ins, i) => {
        const c = colors[ins.type];
        return (
          <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
            style={{ background: c.bg, border: `1px solid ${c.border}` }}>
            <span className="text-base leading-none mt-0.5">{ins.emoji}</span>
            <span style={{ color: 'var(--text)', lineHeight: 1.5 }}>{ins.text}</span>
          </div>
        );
      })}
    </div>
  );
}
