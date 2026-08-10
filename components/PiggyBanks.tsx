'use client';

import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { PiggyBank, Currency, CURRENCIES, CURRENCY_SYMBOLS, Settings } from '@/lib/types';
import { formatMoney, convertAmount } from '@/lib/storage';
import { normalizeDate, parseDay, todayKey } from '@/lib/dates';
import { PIGGY_EMOJIS, CATEGORY_COLORS } from '@/lib/defaults';
import ConfirmDialog from './ConfirmDialog';
import { Plus, X, Pencil, Trash2, PlusCircle } from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';

interface Props {
  piggyBanks: PiggyBank[];
  settings: Settings;
  onAdd: (pb: PiggyBank) => void;
  onUpdate: (pb: PiggyBank) => void;
  onDelete: (id: string) => void;
  /** Записать движение денег в историю: пополнение — расход, снятие — доход */
  onRecordMovement: (pb: PiggyBank, amount: number, mode: 'add' | 'withdraw') => void;
}

function PiggyForm({ initial, settings, onSave, onClose }: {
  initial?: PiggyBank;
  settings: Settings;
  onSave: (pb: PiggyBank) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial ? String(initial.targetAmount) : '');
  const [targetCurrency, setTargetCurrency] = useState<Currency>(initial?.targetCurrency ?? settings.baseCurrency);
  const [current, setCurrent] = useState(initial ? String(initial.currentAmount) : '0');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [emoji, setEmoji] = useState(initial?.emoji ?? PIGGY_EMOJIS[0]);
  const [deadline, setDeadline] = useState(initial?.deadline ? normalizeDate(initial.deadline) : '');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    const targetNum = Number(target);
    const currentNum = Number(current);
    if (!name.trim()) { setError('Введите название'); return; }
    if (!Number.isFinite(targetNum) || targetNum <= 0) { setError('Введите цель больше нуля'); return; }
    if (!Number.isFinite(currentNum) || currentNum < 0) { setError('Накоплено не может быть отрицательным'); return; }
    onSave({
      id: initial?.id ?? uuidv4(),
      name: name.trim(),
      targetAmount: targetNum,
      targetCurrency,
      currentAmount: currentNum,
      currentCurrency: targetCurrency, // накопления ведём в той же валюте, что и цель
      color,
      emoji,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      // дата хранится календарной строкой, без прогона через UTC
      deadline: deadline || undefined,
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? 'Редактировать копилку' : 'Новая копилка'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors"><X size={18} /></button>
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Название</label>
          <input className="input" placeholder="На отпуск..." value={name} onChange={e => { setName(e.target.value); setError(''); }} autoFocus />
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Валюта копилки</label>
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
            {CURRENCIES.map(c => (
              <button key={c} onClick={() => setTargetCurrency(c)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: targetCurrency === c ? 'var(--bg-card)' : 'transparent',
                  color: targetCurrency === c ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: targetCurrency === c ? 'var(--shadow-seg)' : 'none',
                }}
              >{CURRENCY_SYMBOLS[c]}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Цель ({CURRENCY_SYMBOLS[targetCurrency]})
            </label>
            <input className="input num" type="number" placeholder="100 000" value={target} onChange={e => setTarget(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Уже накоплено ({CURRENCY_SYMBOLS[targetCurrency]})
            </label>
            <input className="input num" type="number" placeholder="0" value={current} onChange={e => setCurrent(e.target.value)} />
          </div>
        </div>

        {targetCurrency !== settings.baseCurrency && Number(target) > 0 && (
          <p className="text-xs mb-3 -mt-1.5" style={{ color: 'var(--text-muted)' }}>
            ≈ {formatMoney(convertAmount(Number(target), targetCurrency, settings.baseCurrency, settings.rates), settings.baseCurrency)} по текущему курсу
          </p>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Срок (необязательно)</label>
          <input className="input" type="date" min={todayKey()} value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Иконка</label>
          <div className="flex flex-wrap gap-1.5">
            {PIGGY_EMOJIS.map(e => (
              <button key={e} onClick={() => setEmoji(e)}
                className="w-9 h-9 rounded-xl text-lg transition-all"
                style={{ background: emoji === e ? color + '33' : 'var(--bg)', border: `1.5px solid ${emoji === e ? color : 'var(--border)'}` }}
              >{e}</button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Цвет</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className="w-7 h-7 rounded-full transition-all"
                style={{ background: c, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: '2px' }}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Отмена</button>
          <button className="btn-primary flex-1" onClick={handleSave}>{initial ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

function DepositModal({ pb, onSave, onRecord, onClose }: {
  pb: PiggyBank;
  onSave: (pb: PiggyBank) => void;
  onRecord: (pb: PiggyBank, amount: number, mode: 'add' | 'withdraw') => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'add' | 'withdraw'>('add');
  // Раньше копилки жили отдельно от баланса: деньги «уходили» в цель,
  // но в истории и в итогах этого не было видно.
  const [record, setRecord] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handle = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setError('Введите сумму больше нуля'); return; }
    // При снятии больше, чем накоплено, в историю пишем ровно снятое
    const applied = mode === 'add' ? n : Math.min(n, pb.currentAmount);
    const newAmt = mode === 'add' ? pb.currentAmount + n : Math.max(0, pb.currentAmount - n);
    onSave({ ...pb, currentAmount: Math.round(newAmt * 100) / 100 });
    if (record && applied > 0) onRecord(pb, Math.round(applied * 100) / 100, mode);
    onClose();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 340 }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{pb.emoji} {pb.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors"><X size={16} /></button>
        </div>
        <div className="flex gap-2 mb-4">
          {(['add', 'withdraw'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: mode === m ? 'var(--bg-card2)' : 'transparent',
                color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                border: `1px solid ${mode === m ? 'var(--border)' : 'transparent'}`,
              }}
            >
              {m === 'add' ? '+ Пополнить' : '− Снять'}
            </button>
          ))}
        </div>
        <div className="relative mb-4">
          <input
            className="input num text-lg pr-10"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="Сумма"
            value={amount}
            onChange={e => { setAmount(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handle()}
            autoFocus
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>
            {CURRENCY_SYMBOLS[pb.currentCurrency]}
          </span>
        </div>
        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={record}
            onChange={e => setRecord(e.target.checked)}
            className="mt-0.5 flex-shrink-0"
            style={{ accentColor: 'var(--sage)', width: 16, height: 16 }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
            {mode === 'add'
              ? 'Записать как расход «В копилку» — деньги учтутся в балансе и статистике'
              : 'Записать как доход «Из копилки» — деньги вернутся в баланс'}
          </span>
        </label>

        {error && <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>{error}</p>}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={onClose}>Отмена</button>
          <button className="btn-primary flex-1" onClick={handle}>Применить</button>
        </div>
      </div>
    </div>
  );
}

export default function PiggyBanks({ piggyBanks, settings, onAdd, onUpdate, onDelete, onRecordMovement }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PiggyBank | null>(null);
  const [depositing, setDepositing] = useState<PiggyBank | null>(null);
  const [deleting, setDeleting] = useState<PiggyBank | null>(null);

  return (
    <div className="space-y-4">
      {showForm && (
        <PiggyForm settings={settings} onSave={onAdd} onClose={() => setShowForm(false)} />
      )}
      {editing && (
        <PiggyForm initial={editing} settings={settings} onSave={onUpdate} onClose={() => setEditing(null)} />
      )}
      {depositing && (
        <DepositModal
          pb={depositing}
          onSave={onUpdate}
          onRecord={onRecordMovement}
          onClose={() => setDepositing(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Удалить копилку «${deleting.name}»?`}
          description={<>Накоплено {formatMoney(deleting.currentAmount, deleting.currentCurrency)}. Это действие нельзя отменить.</>}
          onConfirm={() => onDelete(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}

      <button onClick={() => setShowForm(true)} className="btn-primary w-full flex items-center justify-center gap-2">
        <Plus size={16} /> Новая копилка
      </button>

      {piggyBanks.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-3xl mb-2">🐷</div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Создайте первую копилку для вашей цели</p>
        </div>
      )}

      <div className="grid gap-3">
        {piggyBanks.map(pb => {
          const pct = pb.targetAmount > 0 ? Math.min((pb.currentAmount / pb.targetAmount) * 100, 100) : 0;
          // Календарные дни: differenceInDays округлял вниз и на границе суток врал на день
          const daysLeft = pb.deadline
            ? differenceInCalendarDays(parseDay(normalizeDate(pb.deadline)), parseDay(todayKey()))
            : null;
          const done = pct >= 100;
          const isForeign = pb.targetCurrency !== settings.baseCurrency;

          return (
            <div key={pb.id} className="card p-4 animate-slide-up">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: pb.color + '22' }}>
                    {pb.emoji}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{pb.name}</div>
                    {pb.deadline && (
                      <div className="text-xs" style={{ color: daysLeft !== null && daysLeft < 30 ? 'var(--red)' : 'var(--text-muted)' }}>
                        {daysLeft !== null && daysLeft >= 0 ? `${daysLeft} дн. осталось` : daysLeft !== null ? 'Срок прошёл' : ''}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setDepositing(pb)} aria-label="Пополнить копилку" className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors" title="Пополнить">
                    <PlusCircle size={14} style={{ color: 'var(--sage)' }} />
                  </button>
                  <button onClick={() => setEditing(pb)} aria-label="Редактировать копилку" className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                    <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                  </button>
                  <button onClick={() => setDeleting(pb)} aria-label="Удалить копилку" className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors">
                    <Trash2 size={14} style={{ color: 'var(--red)' }} />
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: done ? 'var(--sage)' : pb.color }} />
              </div>

              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {formatMoney(pb.currentAmount, pb.currentCurrency)} из {formatMoney(pb.targetAmount, pb.targetCurrency)}
                  {isForeign && (
                    <span className="block mt-0.5">
                      ≈ {formatMoney(convertAmount(pb.currentAmount, pb.currentCurrency, settings.baseCurrency, settings.rates), settings.baseCurrency)}
                      {' / '}
                      {formatMoney(convertAmount(pb.targetAmount, pb.targetCurrency, settings.baseCurrency, settings.rates), settings.baseCurrency)}
                    </span>
                  )}
                </span>
                <span className="text-xs font-medium num flex-shrink-0 ml-2" style={{ color: done ? 'var(--sage)' : pb.color }}>
                  {done ? '✓ Готово!' : `${Math.round(pct)}%`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
