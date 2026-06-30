'use client';

import { useMemo } from 'react';
import { Transaction, Settings } from '@/lib/types';
import { filterByPeriod, calcStats, formatMoney } from '@/lib/storage';
import { startOfMonth } from 'date-fns';

interface Props {
  transactions: Transaction[];
  settings: Settings;
}

export default function FinancePulse({ transactions, settings }: Props) {
  const { income, expense, balance } = useMemo(() => {
    const monthly = filterByPeriod(transactions, 'month');
    return calcStats(monthly, settings);
  }, [transactions, settings]);

  const ratio = income > 0 ? Math.min(expense / income, 1) : expense > 0 ? 1 : 0;

  // Health: 0 = great (green), 1 = critical (red)
  const getColor = () => {
    if (ratio < 0.5) return { stroke: '#6B8F71', fill: '#A8C5A0', label: 'Отлично', bg: '#f0f4f1' };
    if (ratio < 0.75) return { stroke: '#D4A855', fill: '#F0D9A0', label: 'Умеренно', bg: '#faf6ec' };
    if (ratio < 0.9) return { stroke: '#C2885A', fill: '#E8C4A0', label: 'Осторожно', bg: '#faf3ec' };
    return { stroke: '#C26B6B', fill: '#F0D0D0', label: 'Критично', bg: '#faf0f0' };
  };

  const theme = getColor();
  const pct = Math.round(ratio * 100);

  // SVG arc path for the gauge
  const r = 54;
  const cx = 70;
  const cy = 70;
  const startAngle = -200;
  const totalAngle = 220;
  const filledAngle = startAngle + totalAngle * ratio;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (from: number, to: number, radius: number) => {
    const x1 = cx + radius * Math.cos(toRad(from));
    const y1 = cy + radius * Math.sin(toRad(from));
    const x2 = cx + radius * Math.cos(toRad(to));
    const y2 = cy + radius * Math.sin(toRad(to));
    const large = to - from > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className="card p-5" style={{ background: theme.bg }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Финансовый пульс
        </span>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: theme.fill, color: theme.stroke }}
        >
          {theme.label}
        </span>
      </div>
      <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Соотношение трат к доходам за этот месяц
      </p>

      <div className="flex items-center gap-6">
        {/* Gauge */}
        <div className="flex-shrink-0">
          <svg width="140" height="95" viewBox="0 0 140 100">
            {/* Background arc */}
            <path
              d={arcPath(startAngle, startAngle + totalAngle, r)}
              fill="none"
              stroke={theme.fill}
              strokeWidth="10"
              strokeLinecap="round"
            />
            {/* Filled arc */}
            {ratio > 0 && (
              <path
                d={arcPath(startAngle, filledAngle, r)}
                fill="none"
                stroke={theme.stroke}
                strokeWidth="10"
                strokeLinecap="round"
                style={{ transition: 'all 0.6s ease' }}
              />
            )}
            {/* Center text */}
            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              fontSize="20"
              fontWeight="600"
              fontFamily="DM Serif Display, serif"
              fill={theme.stroke}
            >
              {pct}%
            </text>
            <text
              x={cx}
              y={cy + 20}
              textAnchor="middle"
              fontSize="9"
              fill="var(--text-muted)"
              fontFamily="Inter, sans-serif"
            >
              расходов
            </text>
          </svg>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-2">
          <div>
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Доходы</div>
            <div className="num text-lg" style={{ color: 'var(--sage)' }}>{formatMoney(income, settings.baseCurrency)}</div>
          </div>
          <div>
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Расходы</div>
            <div className="num text-lg" style={{ color: ratio > 0.9 ? 'var(--red)' : 'var(--text)' }}>
              {formatMoney(expense, settings.baseCurrency)}
            </div>
          </div>
          <div className="pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
            <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Остаток</div>
            <div
              className="num text-lg font-medium"
              style={{ color: balance >= 0 ? 'var(--sage)' : 'var(--red)' }}
            >
              {balance >= 0 ? '+' : ''}{formatMoney(balance, settings.baseCurrency)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
