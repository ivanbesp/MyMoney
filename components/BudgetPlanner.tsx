'use client';

import { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Budget, BudgetPlan, Category, Settings, Transaction } from '@/lib/types';
import { convertAmount, formatMoney } from '@/lib/storage';
import { getNumberLocale } from '@/lib/format';
import { monthKey } from '@/lib/dates';
import {
  averageHistory, emptyPlan, findPlan, incomeForMonth, planLimit, plannableCategories, planTotals,
  roundPlan, shiftMonth, spendByCategory, PlanTotals,
} from '@/lib/plans';
import { useT } from '@/lib/i18n';
import { parseAmount } from './QuickAdd';
import ConfirmDialog from './ConfirmDialog';
import { format, parseISO } from 'date-fns';
import { Plus, Trash2, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface Props {
  categories: Category[];
  /** Обычные лимиты — из них план берёт всё, что не задано явно */
  budgets: Budget[];
  plans: BudgetPlan[];
  transactions: Transaction[];
  settings: Settings;
  onSavePlan: (plan: BudgetPlan) => void;
  onDeletePlan: (month: string) => void;
}

/** Сколько месяцев вперёд видно в ленте */
const HORIZON = 6;
/** Сколько месяцев показывает таблица рядом: выбранный и два следующих */
const COLUMNS = 3;
/** План ниже среднего больше чем на столько — подсвечиваем */
const BELOW_AVG_SHARE = 0.1;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function BudgetPlanner({
  categories, budgets, plans, transactions, settings, onSavePlan, onDeletePlan,
}: Props) {
  const { t, dateLocale } = useT();
  const now = new Date();
  const current = monthKey(now);
  const [selected, setSelected] = useState(() => shiftMonth(current, 1));
  const [clearing, setClearing] = useState(false);
  const [oneOffName, setOneOffName] = useState('');
  const [oneOffAmount, setOneOffAmount] = useState('');

  const base = settings.baseCurrency;
  const fmtNum = (n: number) =>
    new Intl.NumberFormat(getNumberLocale(), { maximumFractionDigits: 0 }).format(Math.round(n));
  const monthName = (m: string, withYear = false) =>
    capitalize(format(parseISO(m + '-01'), withYear ? 'LLLL yyyy' : 'LLLL', { locale: dateLocale }));

  const cats = useMemo(() => plannableCategories(categories), [categories]);
  const lastMonth = shiftMonth(current, -1);
  const lastSpend = useMemo(() => spendByCategory(transactions, lastMonth, settings), [transactions, lastMonth, settings]);
  const history = useMemo(() => averageHistory(transactions, current, 3, settings), [transactions, current, settings]);
  const lastIncome = useMemo(() => incomeForMonth(transactions, lastMonth, settings), [transactions, lastMonth, settings]);

  const months = useMemo(() => Array.from({ length: HORIZON }, (_, i) => shiftMonth(current, i)), [current]);
  const columns = useMemo(() => Array.from({ length: COLUMNS }, (_, i) => shiftMonth(selected, i)), [selected]);

  const totalsFor = (m: string): PlanTotals =>
    planTotals(findPlan(plans, m), budgets, categories, settings, history.income);

  const selectedPlan = findPlan(plans, selected);
  const sel = totalsFor(selected);

  // ── Запись в план ──────────────────────────────────────────────────────────

  /** Правит план месяца; суммы приходят в валюте отображения */
  const edit = (month: string, change: (p: BudgetPlan, toPlan: (n: number) => number) => void) => {
    const existing = findPlan(plans, month);
    const plan: BudgetPlan = existing
      ? { ...existing, limits: { ...existing.limits }, oneOffs: [...existing.oneOffs] }
      : emptyPlan(month, settings);
    const toPlan = (n: number) => convertAmount(n, base, plan.currency, settings.rates);
    change(plan, toPlan);
    onSavePlan(plan);
  };

  const parseCell = (raw: string): number | null | 'invalid' => {
    if (raw.trim() === '') return null;
    const n = parseAmount(raw);
    return Number.isFinite(n) && n >= 0 ? n : 'invalid';
  };

  const commitLimit = (month: string, categoryId: string, raw: string) => {
    const v = parseCell(raw);
    if (v === 'invalid') return;
    edit(month, (p, toPlan) => {
      if (v === null) delete p.limits[categoryId];
      else p.limits[categoryId] = toPlan(v);
    });
  };

  const commitField = (month: string, field: 'income' | 'savings', raw: string) => {
    const v = parseCell(raw);
    if (v === 'invalid') return;
    edit(month, (p, toPlan) => { p[field] = v === null ? undefined : toPlan(v); });
  };

  const fillFrom = (source: Map<string, number>) => {
    edit(selected, (p, toPlan) => {
      for (const c of cats) {
        const v = source.get(c.id);
        if (v && v > 0) p.limits[c.id] = toPlan(roundPlan(v));
      }
    });
  };

  const addOneOff = () => {
    const amount = parseAmount(oneOffAmount);
    if (!oneOffName.trim() || !Number.isFinite(amount) || amount <= 0) return;
    edit(selected, (p, toPlan) => {
      p.oneOffs.push({ id: uuidv4(), name: oneOffName.trim(), amount: toPlan(amount) });
    });
    setOneOffName('');
    setOneOffAmount('');
  };

  const removeOneOff = (id: string) =>
    edit(selected, p => { p.oneOffs = p.oneOffs.filter(o => o.id !== id); });

  // ── Подсказки ──────────────────────────────────────────────────────────────

  const belowAvg = (categoryId: string, value: number) => {
    const avg = history.spend.get(categoryId) ?? 0;
    if (avg <= 0 || value <= 0 || value >= avg * (1 - BELOW_AVG_SHARE)) return null;
    return Math.round((1 - value / avg) * 100);
  };

  const hints = useMemo(() => {
    const list: { tone: 'good' | 'warning' | 'info'; text: string }[] = [];
    const name = monthName(selected);
    if (sel.status === 'deficit') list.push({ tone: 'warning', text: t('plan.hint.deficit', { month: name, value: formatMoney(-sel.free, base) }) });
    else if (sel.status === 'tight') list.push({ tone: 'warning', text: t('plan.hint.tight', { month: name, value: formatMoney(sel.free, base) }) });
    else if (sel.status === 'ok') list.push({ tone: 'good', text: t('plan.hint.ok', { value: formatMoney(sel.free, base) }) });

    const below = cats
      .map(c => ({ c, pct: belowAvg(c.id, planLimit(selectedPlan, budgets, c.id, settings).value) }))
      .filter(x => x.pct !== null)
      .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
      .slice(0, 2);
    for (const { c, pct } of below) list.push({ tone: 'warning', text: t('plan.hint.below', { name: c.name, pct: pct ?? 0 }) });

    if (selectedPlan && sel.incomeEstimated) list.push({ tone: 'info', text: t('plan.hint.income') });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, selectedPlan, cats, budgets, settings, history, selected, t]);

  const statusText = (s: PlanTotals) =>
    s.status === 'empty' ? t('plan.status.empty')
    : s.status === 'deficit' ? t('plan.status.deficit', { value: fmtNum(-s.free) })
    : s.status === 'tight' ? t('plan.status.tight', { value: fmtNum(s.free) })
    : t('plan.status.ok', { value: fmtNum(s.free) });

  const statusColor = (s: PlanTotals) =>
    s.status === 'ok' ? 'var(--tone-good-fg)'
    : s.status === 'tight' ? 'var(--tone-warning-fg)'
    : s.status === 'deficit' ? 'var(--red)'
    : 'var(--text-muted)';

  const freeColor = (s: PlanTotals) =>
    s.free < 0 ? 'var(--red)' : s.status === 'tight' ? 'var(--expense)' : 'var(--sage)';

  // ── Разметка ───────────────────────────────────────────────────────────────

  const selBg = 'var(--sage-soft)';
  const colStyle = (m: string) => (m === selected ? { background: selBg } : undefined);
  /** Числа итогов встают ровно под числа в полях: отступ ячейки + отступ поля + рамка */
  const numPad = (i: number) => ({ paddingRight: i === COLUMNS - 1 ? 31 : 21 });

  /** Поле таблицы. key включает значение, чтобы поле обновилось после «Заполнить» */
  const cell = (month: string, value: number | undefined, placeholder: string, label: string,
    onCommit: (raw: string) => void, warn?: string | null) => (
    <input
      key={`${month}-${label}-${value ?? 'none'}`}
      className="plan-input"
      inputMode="decimal"
      defaultValue={value === undefined ? '' : fmtNum(value)}
      placeholder={placeholder}
      aria-label={label}
      title={warn ?? undefined}
      data-warn={warn ? 'true' : undefined}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          (e.target as HTMLInputElement).value = value === undefined ? '' : fmtNum(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );

  const toneStyle = (tone: 'good' | 'warning' | 'info') => ({
    background: `var(--tone-${tone}-bg)`,
    color: `var(--tone-${tone}-fg)`,
  });
  const ToneIcon = ({ tone }: { tone: 'good' | 'warning' | 'info' }) =>
    tone === 'good' ? <CheckCircle2 size={16} /> : tone === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />;

  const share = (n: number) => (sel.income > 0 ? Math.max(0, (n / sel.income) * 100) : 0);

  return (
    <div className="space-y-5">
      {clearing && (
        <ConfirmDialog
          title={t('plan.clearTitle', { month: monthName(selected) })}
          description={t('plan.clearHint')}
          onConfirm={() => onDeletePlan(selected)}
          onClose={() => setClearing(false)}
        />
      )}

      {/* Лента месяцев */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" role="tablist" aria-label={t('plan.monthsLabel')}>
        {months.map(m => {
          const s = totalsFor(m);
          const active = m === selected;
          return (
            <button
              key={m}
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(m)}
              className="text-left px-3.5 py-3 rounded-[14px] transition-colors"
              style={{
                background: active ? 'var(--sage-soft)' : 'var(--bg-card)',
                border: `1.5px solid ${active ? 'var(--sage)' : 'var(--border)'}`,
              }}
            >
              <span className="block text-sm font-bold">
                {monthName(m, m.slice(0, 4) !== current.slice(0, 4))}
                {m === current && <span className="font-medium" style={{ color: 'var(--text-muted)' }}> · {t('plan.now')}</span>}
              </span>
              <span className="block text-xs font-semibold mt-0.5 num" style={{ color: statusColor(s) }}>{statusText(s)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Таблица плана */}
        <section className="card pt-2 flex-[2_1_620px] min-w-0">
          <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
            <h2 className="text-[15px] font-bold flex-1 min-w-[160px]">{t('plan.byCategory')}</h2>
            <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('plan.fillFor', { month: format(parseISO(selected + '-01'), 'LLLL', { locale: dateLocale }) })}</span>
            <button className="btn-ghost h-8 py-0 px-3 text-[13px] rounded-full" onClick={() => fillFrom(lastSpend)}
              disabled={lastSpend.size === 0}>
              {t('plan.fillLast', { month: format(parseISO(lastMonth + '-01'), 'LLLL', { locale: dateLocale }) })}
            </button>
            <button className="btn-ghost h-8 py-0 px-3 text-[13px] rounded-full" onClick={() => fillFrom(history.spend)}
              disabled={history.months === 0}>
              {t('plan.fillAvg')}
            </button>
            {selectedPlan && (
              <button className="btn-ghost h-8 py-0 px-3 text-[13px] rounded-full" onClick={() => setClearing(true)}>
                {t('plan.clear')}
              </button>
            )}
          </div>

          {cats.length === 0 ? (
            <p className="px-5 pb-5 text-sm" style={{ color: 'var(--text-muted)' }}>{t('plan.noCategories')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="dtable min-w-[720px]">
                <thead>
                  <tr>
                    <th>{t('plan.colCategory')}</th>
                    <th style={{ textAlign: 'right' }}>{t('plan.colFact', { month: format(parseISO(lastMonth + '-01'), 'LLL', { locale: dateLocale }) })}</th>
                    <th style={{ textAlign: 'right' }}>{t('plan.colAvg')}</th>
                    {columns.map(m => (
                      <th key={m} style={{ textAlign: 'right', ...colStyle(m), color: m === selected ? 'var(--sage)' : undefined }}>
                        <button onClick={() => setSelected(m)} className="font-bold">{monthName(m)}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats.map(c => (
                    <tr key={c.id}>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-2.5 font-semibold">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                          {c.icon} {c.name}
                        </span>
                      </td>
                      <td className="text-right num" style={{ color: 'var(--text-muted)' }}>
                        {lastSpend.get(c.id) ? fmtNum(lastSpend.get(c.id)!) : '—'}
                      </td>
                      <td className="text-right num" style={{ color: 'var(--text-muted)' }}>
                        {history.spend.get(c.id) ? fmtNum(history.spend.get(c.id)!) : '—'}
                      </td>
                      {columns.map(m => {
                        const lim = planLimit(findPlan(plans, m), budgets, c.id, settings);
                        const pct = belowAvg(c.id, lim.value);
                        return (
                          <td key={m} className="py-1.5" style={colStyle(m)}>
                            {cell(
                              m,
                              lim.source === 'plan' ? lim.value : undefined,
                              lim.source === 'budget' ? fmtNum(lim.value) : '—',
                              t('plan.cellLabel', { category: c.name, month: monthName(m) }),
                              raw => commitLimit(m, c.id, raw),
                              pct !== null ? t('plan.belowAvg', { pct }) : null,
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Итоги */}
                  <tr style={{ background: 'var(--bg-inset)' }}>
                    <td className="font-bold" style={{ borderTop: '1px solid var(--border-strong)' }}>{t('plan.limitsTotal')}</td>
                    <td className="text-right num" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-strong)' }}>
                      {fmtNum(Array.from(lastSpend.entries()).filter(([k]) => cats.some(c => c.id === k)).reduce((s, [, v]) => s + v, 0))}
                    </td>
                    <td className="text-right num" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-strong)' }}>
                      {fmtNum(Array.from(history.spend.entries()).filter(([k]) => cats.some(c => c.id === k)).reduce((s, [, v]) => s + v, 0))}
                    </td>
                    {columns.map((m, i) => (
                      <td key={m} className="text-right num font-extrabold" style={{ ...colStyle(m), ...numPad(i), borderTop: '1px solid var(--border-strong)' }}>
                        {fmtNum(totalsFor(m).limits)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>{t('plan.oneOffsTotal')}</td>
                    <td /><td />
                    {columns.map((m, i) => (
                      <td key={m} className="text-right num font-semibold" style={{ ...colStyle(m), ...numPad(i) }}>
                        {totalsFor(m).oneOffs > 0 ? fmtNum(totalsFor(m).oneOffs) : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>{t('plan.income')}</td>
                    <td className="text-right num" style={{ color: 'var(--text-muted)' }}>
                      {lastIncome > 0 ? fmtNum(lastIncome) : '—'}
                    </td>
                    <td className="text-right num" style={{ color: 'var(--text-muted)' }}>{history.income > 0 ? fmtNum(history.income) : '—'}</td>
                    {columns.map(m => {
                      const p = findPlan(plans, m);
                      const s = totalsFor(m);
                      return (
                        <td key={m} className="py-1.5" style={colStyle(m)}>
                          {cell(m, p?.income !== undefined ? s.income : undefined,
                            history.income > 0 ? `≈ ${fmtNum(history.income)}` : '0',
                            `${t('plan.income')}, ${monthName(m)}`, raw => commitField(m, 'income', raw))}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td style={{ color: 'var(--text-muted)' }}>{t('plan.savings')}</td>
                    <td /><td />
                    {columns.map(m => {
                      const p = findPlan(plans, m);
                      const s = totalsFor(m);
                      return (
                        <td key={m} className="py-1.5" style={colStyle(m)}>
                          {cell(m, p?.savings !== undefined ? s.savings : undefined, '0',
                            `${t('plan.savings')}, ${monthName(m)}`, raw => commitField(m, 'savings', raw))}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="font-bold">{t('plan.free')}</td>
                    <td /><td />
                    {columns.map((m, i) => {
                      const s = totalsFor(m);
                      return (
                        <td key={m} className="text-right num font-extrabold" style={{ ...colStyle(m), ...numPad(i), color: freeColor(s) }}>
                          {s.free < 0 ? '−' : ''}{fmtNum(Math.abs(s.free))}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="px-5 py-3.5 text-[13px]" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            {t('plan.hint.howItWorks')}
          </p>
        </section>

        {/* Правая колонка */}
        <div className="flex-[1_1_300px] min-w-0 flex flex-col gap-4">
          <section className="card px-5 py-[18px]">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {t('plan.summary', { month: monthName(selected, true) })}
            </div>
            <div className="num-hero text-[30px] leading-tight mt-1" style={{ color: freeColor(sel) }}>
              {sel.free < 0 ? '−' : ''}{formatMoney(Math.abs(Math.round(sel.free)), base)}
            </div>
            <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {sel.free < 0 ? t('plan.deficitHint') : t('plan.freeHint')}
            </div>

            {sel.income > 0 && (
              <div className="flex h-3 rounded-md overflow-hidden gap-0.5 mt-4" role="img"
                aria-label={`${t('plan.expenses')} ${Math.round(share(sel.expenses))}%, ${t('plan.savings')} ${Math.round(share(sel.savings))}%`}>
                <div style={{ width: `${Math.min(share(sel.expenses), 100)}%`, background: 'var(--expense)' }} />
                <div style={{ width: `${Math.min(share(sel.savings), 100)}%`, background: 'var(--tone-info-fg)' }} />
                <div style={{ width: `${Math.max(0, share(sel.free))}%`, background: 'var(--sage)' }} />
              </div>
            )}

            <div className="flex flex-col gap-2 mt-3.5 text-sm">
              {[
                { label: t('plan.expenses'), value: sel.expenses, color: 'var(--expense)' },
                { label: t('plan.savings'), value: sel.savings, color: 'var(--tone-info-fg)' },
                { label: t('plan.free'), value: sel.free, color: 'var(--sage)' },
              ].map(r => (
                <div key={r.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: r.color }} />
                  <span className="flex-1">{r.label}</span>
                  <b className="num">{r.value < 0 ? '−' : ''}{formatMoney(Math.abs(Math.round(r.value)), base)}</b>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                <span className="flex-1">{t('plan.income')}{sel.incomeEstimated ? ` · ${t('plan.estimated')}` : ''}</span>
                <span className="num">{formatMoney(Math.round(sel.income), base)}</span>
              </div>
            </div>
          </section>

          <section className="card px-5 py-[18px]">
            <h2 className="text-[15px] font-bold">{t('plan.oneOffs')} · {monthName(selected)}</h2>
            {(selectedPlan?.oneOffs ?? []).length === 0 ? (
              <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>{t('plan.oneOffEmpty')}</p>
            ) : (
              <div className="mt-1">
                {selectedPlan!.oneOffs.map((o, i) => (
                  <div key={o.id} className="flex items-center gap-3 py-2.5 row-hover rounded-lg"
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <span className="flex-1 min-w-0 text-sm font-semibold truncate">{o.name}</span>
                    <b className="num text-sm">{formatMoney(convertAmount(o.amount, selectedPlan!.currency, base, settings.rates), base)}</b>
                    <button onClick={() => removeOneOff(o.id)} className="row-actions p-1.5 rounded-lg hover:bg-[var(--red-light)]"
                      aria-label={t('plan.oneOffDelete', { name: o.name })}>
                      <Trash2 size={14} style={{ color: 'var(--red)' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-3">
              <input className="field flex-[2_1_0] min-w-0 h-9 text-[13px]" placeholder={t('plan.oneOffNamePlaceholder')}
                aria-label={t('plan.oneOffName')} value={oneOffName} onChange={e => setOneOffName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOneOff()} />
              <input className="field flex-[1_1_0] min-w-0 h-9 text-[13px] text-right num" placeholder="0" inputMode="decimal"
                aria-label={t('plan.oneOffAmount')} value={oneOffAmount} onChange={e => setOneOffAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addOneOff()} />
              <button onClick={addOneOff} className="h-9 w-9 flex-shrink-0 rounded-[10px] flex items-center justify-center"
                style={{ background: 'var(--sage)', color: 'var(--sage-on)' }} aria-label={t('plan.oneOffAdd')}>
                <Plus size={16} />
              </button>
            </div>
          </section>

          {hints.map((h, i) => (
            <div key={i} className="rounded-2xl px-4 py-3.5 text-sm flex gap-2.5 items-start" style={toneStyle(h.tone)}>
              <span className="mt-0.5 flex-shrink-0"><ToneIcon tone={h.tone} /></span>
              <span style={{ lineHeight: 1.5 }}>{h.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
