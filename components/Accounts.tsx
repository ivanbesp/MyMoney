'use client';

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
  Account, AccountKind, ACCOUNT_KINDS, ACCOUNT_KIND_ICONS,
  Currency, CURRENCIES, CURRENCY_SYMBOLS, Settings, Transaction, Transfer,
} from '@/lib/types';
import {
  accountBalance, convertAmount, formatMoney, totalAccountsBalance,
} from '@/lib/storage';
import { todayKey } from '@/lib/dates';
import { CATEGORY_COLORS } from '@/lib/defaults';
import ConfirmDialog from './ConfirmDialog';
import { useT } from '@/lib/i18n';
import { Plus, X, Pencil, Trash2, ArrowLeftRight, ArrowRight } from 'lucide-react';

interface Props {
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  settings: Settings;
  onAdd: (a: Account) => void;
  onUpdate: (a: Account) => void;
  onDelete: (id: string, moveToId: string) => void;
  onTransfer: (t: Transfer) => void;
  onDeleteTransfer: (id: string) => void;
}

function AccountForm({ initial, settings, onSave, onClose }: {
  initial?: Account;
  settings: Settings;
  onSave: (a: Account) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(initial?.kind ?? 'card');
  const [currency, setCurrency] = useState<Currency>(initial?.currency ?? settings.baseCurrency);
  const [opening, setOpening] = useState(initial ? String(initial.openingBalance) : '0');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[1]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const open = Number(opening);
    if (!name.trim()) { setError(t('accounts.errName')); return; }
    if (!Number.isFinite(open)) { setError(t('accounts.errOpening')); return; }
    onSave({
      id: initial?.id ?? uuidv4(),
      name: name.trim(),
      kind,
      currency,
      openingBalance: open,
      color,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={initial ? t('accounts.edit') : t('accounts.new')}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? t('accounts.edit') : t('accounts.new')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.name')}</label>
          <input className="input" placeholder={t('accounts.namePlaceholder')} value={name}
            onChange={e => { setName(e.target.value); setError(''); }} autoFocus />
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.kind')}</label>
          <div className="grid grid-cols-4 gap-1.5">
            {ACCOUNT_KINDS.map(k => (
              <button key={k} onClick={() => setKind(k)}
                className="py-2 rounded-xl text-xs transition-all"
                style={{
                  background: kind === k ? color + '22' : 'var(--bg-inset)',
                  border: `1px solid ${kind === k ? color + '66' : 'var(--border)'}`,
                }}>
                <span className="block text-base leading-tight">{ACCOUNT_KIND_ICONS[k]}</span>
                {t(`accounts.kind.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.currency')}</label>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setCurrency(c)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: currency === c ? 'var(--bg-card)' : 'transparent',
                  color: currency === c ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: currency === c ? 'var(--shadow-seg)' : 'none',
                }}>
                {CURRENCY_SYMBOLS[c]} {c}
              </button>
            ))}
          </div>
          {initial && initial.currency !== currency && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--expense)' }}>
              {t('accounts.currencyWarn')}
            </p>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {t('accounts.opening', { sym: CURRENCY_SYMBOLS[currency] })}
          </label>
          <input className="input num" type="number" inputMode="decimal" step="0.01"
            value={opening} onChange={e => { setOpening(e.target.value); setError(''); }} />
          <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
            {t('accounts.openingHint')}
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.color')}</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} aria-label={c}
                className="w-7 h-7 rounded-full transition-all"
                style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }} />
            ))}
          </div>
        </div>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" onClick={handleSave}>{initial ? t('common.save') : t('common.create')}</button>
        </div>
      </div>
    </div>
  );
}

function TransferForm({ accounts, settings, onSave, onClose }: {
  accounts: Account[];
  settings: Settings;
  onSave: (t: Transfer) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? '');
  const [amountFrom, setAmountFrom] = useState('');
  const [amountTo, setAmountTo] = useState('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const from = accounts.find(a => a.id === fromId);
  const to = accounts.find(a => a.id === toId);
  const crossCurrency = !!from && !!to && from.currency !== to.currency;

  // Для разных валют подставляем расчёт по текущему курсу, но даём поправить:
  // банк почти всегда конвертирует по своему
  useEffect(() => {
    if (!crossCurrency || !from || !to) { setAmountTo(''); return; }
    const n = Number(amountFrom);
    if (!Number.isFinite(n) || n <= 0) { setAmountTo(''); return; }
    setAmountTo(String(Math.round(convertAmount(n, from.currency, to.currency, settings.rates) * 100) / 100));
  }, [amountFrom, crossCurrency, from, to, settings.rates]);

  const handleSave = () => {
    const nFrom = Number(amountFrom);
    const nTo = crossCurrency ? Number(amountTo) : nFrom;
    if (!from || !to) { setError(t('accounts.errSame')); return; }
    if (from.id === to.id) { setError(t('accounts.errSame')); return; }
    if (!Number.isFinite(nFrom) || nFrom <= 0) { setError(t('accounts.errAmount')); return; }
    if (!Number.isFinite(nTo) || nTo <= 0) { setError(t('accounts.errCredit')); return; }
    onSave({
      id: uuidv4(),
      fromAccountId: from.id,
      toAccountId: to.id,
      amountFrom: nFrom,
      amountTo: nTo,
      date,
      note: note.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  const selectCls = 'input';

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('accounts.transfer')}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{t('accounts.transfer')}</h2>
          <button onClick={onClose} aria-label={t('common.close')} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs mb-4 p-3 rounded-xl" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          {t('accounts.transferNote')}
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.from')}</label>
            <select className={selectCls} value={fromId} onChange={e => { setFromId(e.target.value); setError(''); }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_KIND_ICONS[a.kind]} {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('accounts.to')}</label>
            <select className={selectCls} value={toId} onChange={e => { setToId(e.target.value); setError(''); }}>
              {accounts.map(a => <option key={a.id} value={a.id}>{ACCOUNT_KIND_ICONS[a.kind]} {a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {t('accounts.debit', { sym: from ? `(${CURRENCY_SYMBOLS[from.currency]})` : '' })}
          </label>
          <input className="input num text-lg" type="number" inputMode="decimal" min="0" step="0.01"
            placeholder="0" value={amountFrom}
            onChange={e => { setAmountFrom(e.target.value); setError(''); }} autoFocus />
        </div>

        {crossCurrency && (
          <div className="mb-3">
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('accounts.credit', { sym: to ? `(${CURRENCY_SYMBOLS[to.currency]})` : '' })}
            </label>
            <input className="input num" type="number" inputMode="decimal" min="0" step="0.01"
              value={amountTo} onChange={e => { setAmountTo(e.target.value); setError(''); }} />
            <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
              {t('accounts.creditHint')}
            </p>
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.date')}</label>
          <input className="input" type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('form.note', { optional: t('common.optional') })}</label>
          <input className="input" placeholder={t('form.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} />
        </div>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" onClick={handleSave}>{t('accounts.doTransfer')}</button>
        </div>
      </div>
    </div>
  );
}

/** Горизонтальная полоса счетов для обзора */
export function AccountsStrip({ accounts, transactions, transfers, settings, onOpen }: {
  accounts: Account[];
  transactions: Transaction[];
  transfers: Transfer[];
  settings: Settings;
  onOpen: () => void;
}) {
  const { t } = useT();
  if (accounts.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium">{t('nav.accounts')}</h2>
        <button onClick={onOpen} className="text-xs" style={{ color: 'var(--sage)' }}>{t('common.seeAll')}</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {accounts.map(a => {
          const balance = accountBalance(a, transactions, transfers, settings.rates);
          return (
            <button
              key={a.id}
              onClick={onOpen}
              className="card p-3 flex-shrink-0 text-left"
              style={{ minWidth: 150, borderLeft: `3px solid ${a.color}` }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">{ACCOUNT_KIND_ICONS[a.kind]}</span>
                <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{a.name}</span>
              </div>
              <div className="num font-medium" style={{ color: balance < 0 ? 'var(--red)' : 'var(--text)' }}>
                {formatMoney(balance, a.currency)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Accounts({
  accounts, transactions, transfers, settings,
  onAdd, onUpdate, onDelete, onTransfer, onDeleteTransfer,
}: Props) {
  const { t, plural } = useT();
  const [showForm, setShowForm] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<Transfer | null>(null);
  const [moveTo, setMoveTo] = useState('');

  const total = useMemo(
    () => totalAccountsBalance(accounts, transactions, transfers, settings),
    [accounts, transactions, transfers, settings],
  );

  const accById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);
  const recentTransfers = useMemo(
    () => [...transfers].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8),
    [transfers],
  );

  const startDelete = (a: Account) => {
    setMoveTo(accounts.find(x => x.id !== a.id)?.id ?? '');
    setDeleting(a);
  };

  const affected = deleting ? transactions.filter(t => t.accountId === deleting.id).length : 0;

  return (
    <div className="space-y-4">
      {showForm && <AccountForm settings={settings} onSave={onAdd} onClose={() => setShowForm(false)} />}
      {editing && <AccountForm initial={editing} settings={settings} onSave={onUpdate} onClose={() => setEditing(null)} />}
      {showTransfer && (
        <TransferForm accounts={accounts} settings={settings} onSave={onTransfer} onClose={() => setShowTransfer(false)} />
      )}
      {deletingTransfer && (
        <ConfirmDialog
          title={t('accounts.deleteTransfer')}
          description={t('accounts.deleteTransferHint')}
          onConfirm={() => onDeleteTransfer(deletingTransfer.id)}
          onClose={() => setDeletingTransfer(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={t('accounts.deleteTitle', { name: deleting.name })}
          confirmLabel={t('accounts.deleteConfirm')}
          description={
            <>
              {affected > 0 ? plural(affected, 'accounts.deleteUsed') : t('accounts.deleteEmpty')}
              <div className="mt-3">
                <label className="block text-xs mb-1.5">{t('accounts.moveTo')}</label>
                <select className="input" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                  {accounts.filter(a => a.id !== deleting.id).map(a => (
                    <option key={a.id} value={a.id}>{ACCOUNT_KIND_ICONS[a.kind]} {a.name}</option>
                  ))}
                </select>
              </div>
            </>
          }
          onConfirm={() => moveTo && onDelete(deleting.id, moveTo)}
          onClose={() => setDeleting(null)}
        />
      )}

      <div className="card p-4">
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{t('accounts.total')}</div>
        <div className="num-hero text-3xl" style={{ color: total < 0 ? 'var(--red)' : 'var(--text)' }}>
          {formatMoney(total, settings.baseCurrency)}
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          {plural(accounts.length, 'accounts.count')} · {t('accounts.totalHint')}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowForm(true)} className="btn-ghost flex-1 flex items-center justify-center gap-2">
          <Plus size={16} /> {t('nav.accounts')}
        </button>
        <button
          onClick={() => setShowTransfer(true)}
          disabled={accounts.length < 2}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          style={{ opacity: accounts.length < 2 ? 0.5 : 1 }}
          title={accounts.length < 2 ? t('accounts.needTwo') : undefined}
        >
          <ArrowLeftRight size={16} /> {t('accounts.transfer')}
        </button>
      </div>

      <div className="space-y-2">
        {accounts.map(a => {
          const balance = accountBalance(a, transactions, transfers, settings.rates);
          const inBase = convertAmount(balance, a.currency, settings.baseCurrency, settings.rates);
          return (
            <div key={a.id} className="card p-4 row-hover" style={{ borderLeft: `3px solid ${a.color}` }}>
              <div className="flex items-center gap-3">
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                  style={{ background: a.color + '22' }}
                >
                  {ACCOUNT_KIND_ICONS[a.kind]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {t(`accounts.kind.${a.kind}`)} · {a.currency}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="num font-medium" style={{ color: balance < 0 ? 'var(--red)' : 'var(--text)' }}>
                    {formatMoney(balance, a.currency)}
                  </div>
                  {a.currency !== settings.baseCurrency && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      ≈ {formatMoney(inBase, settings.baseCurrency)}
                    </div>
                  )}
                </div>
                <div className="row-actions flex gap-0.5 flex-shrink-0">
                  <button onClick={() => setEditing(a)} aria-label={t('accounts.edit')}
                    className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                    <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button
                    onClick={() => startDelete(a)}
                    aria-label={t('common.delete')}
                    disabled={accounts.length < 2}
                    className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors"
                    style={{ opacity: accounts.length < 2 ? 0.35 : 1 }}
                    title={accounts.length < 2 ? t('accounts.lastOne') : undefined}
                  >
                    <Trash2 size={14} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {recentTransfers.length > 0 && (
        <div>
          <h2 className="text-sm font-medium mb-2">{t('accounts.recent')}</h2>
          <div className="card">
            {recentTransfers.map((tr, i) => {
              const from = accById.get(tr.fromAccountId);
              const to = accById.get(tr.toAccountId);
              return (
                <div key={tr.id} className="flex items-center gap-3 px-4 py-3 row-hover"
                  style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'var(--bg-card2)' }}>
                    <ArrowLeftRight size={15} style={{ color: 'var(--text-muted)' }} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate flex items-center gap-1">
                      {from?.name ?? '—'}
                      <ArrowRight size={12} style={{ color: 'var(--text-muted)' }} />
                      {to?.name ?? '—'}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                      {tr.date}{tr.note ? ` · ${tr.note}` : ''}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 num text-sm">
                    {formatMoney(tr.amountFrom, from?.currency ?? settings.baseCurrency)}
                    {from && to && from.currency !== to.currency && (
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        → {formatMoney(tr.amountTo, to.currency)}
                      </div>
                    )}
                  </div>
                  <div className="row-actions flex-shrink-0">
                    <button onClick={() => setDeletingTransfer(tr)} aria-label={t('common.delete')}
                      className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors">
                      <Trash2 size={14} style={{ color: 'var(--red)' }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
