'use client';

import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Category, Subcategory, Transaction, TransactionType } from '@/lib/types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/defaults';
import ConfirmDialog from './ConfirmDialog';
import { useT } from '@/lib/i18n';
import { Plus, X, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  categories: Category[];
  transactions: Transaction[];
  onAdd: (cat: Category) => void;
  onUpdate: (cat: Category) => void;
  onDelete: (id: string) => void;
}

function CategoryForm({ initial, onSave, onClose }: {
  initial?: Category;
  onSave: (cat: Category) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? CATEGORY_ICONS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSave = () => {
    if (!name.trim()) { setError(t('accounts.errName')); return; }
    onSave({
      id: initial?.id ?? uuidv4(),
      name: name.trim(),
      type,
      color,
      icon,
      subcategories: initial?.subcategories ?? [],
    });
    onClose();
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">{initial ? t('common.edit') : t('cats.new')}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors"><X size={18} /></button>
        </div>

        {!initial && (
          <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
            {/* переменная цикла tt, чтобы не затенять функцию перевода */}
            {(['expense', 'income'] as TransactionType[]).map(tt => (
              <button key={tt} onClick={() => setType(tt)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: type === tt ? 'var(--bg-card)' : 'transparent',
                  color: type === tt ? (tt === 'income' ? 'var(--sage)' : 'var(--red)') : 'var(--text-muted)',
                  boxShadow: type === tt ? 'var(--shadow-seg)' : 'none',
                }}
              >{tt === 'expense' ? t('type.expense') : t('type.income')}</button>
            ))}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('cats.name')}</label>
          <input className="input" value={name} onChange={e => { setName(e.target.value); setError(''); }} autoFocus placeholder={t('cats.namePlaceholder')} />
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('cats.icon')}</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_ICONS.map(ic => (
              <button key={ic} onClick={() => setIcon(ic)}
                className="w-9 h-9 rounded-xl text-lg transition-all"
                style={{ background: icon === ic ? color + '33' : 'var(--bg)', border: `1.5px solid ${icon === ic ? color : 'var(--border)'}` }}
              >{ic}</button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{t('cats.color')}</label>
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
          <button className="btn-ghost flex-1" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary flex-1" onClick={handleSave}>{initial ? t('common.save') : t('common.create')}</button>
        </div>
      </div>
    </div>
  );
}

function SubcategoryManager({ cat, onUpdate }: { cat: Category; onUpdate: (cat: Category) => void }) {
  const { t } = useT();
  const [newName, setNewName] = useState('');

  const addSub = () => {
    if (!newName.trim()) return;
    const sub: Subcategory = { id: uuidv4(), name: newName.trim(), categoryId: cat.id };
    onUpdate({ ...cat, subcategories: [...cat.subcategories, sub] });
    setNewName('');
  };

  const deleteSub = (id: string) => {
    onUpdate({ ...cat, subcategories: cat.subcategories.filter(s => s.id !== id) });
  };

  return (
    <div className="mt-2 pl-4 border-l-2" style={{ borderColor: cat.color + '44' }}>
      <div className="flex gap-2 mb-2">
        <input
          className="input text-sm py-1.5"
          placeholder={t('cats.newSub')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSub()}
        />
        <button onClick={addSub} className="btn-primary px-3 py-1.5 text-sm">+</button>
      </div>
      {cat.subcategories.map(sub => (
        <div key={sub.id} className="flex items-center justify-between py-1.5 row-hover">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>• {sub.name}</span>
          <button
            onClick={() => deleteSub(sub.id)}
            aria-label={t('cats.deleteSub', { name: sub.name })}
            className="row-actions p-1.5 rounded-lg hover:bg-[var(--red-light)] transition-all"
          >
            <Trash2 size={12} style={{ color: 'var(--red)' }} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Categories({ categories, transactions, onAdd, onUpdate, onDelete }: Props) {
  const { t, plural } = useT();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');

  const filtered = categories.filter(c => filter === 'all' || c.type === filter);

  // Сколько записей осиротеет, если удалить категорию
  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + 1);
    return map;
  }, [transactions]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {showForm && <CategoryForm onSave={onAdd} onClose={() => setShowForm(false)} />}
      {editing && <CategoryForm initial={editing} onSave={onUpdate} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={t('cats.deleteTitle', { name: deleting.name })}
          description={
            (usage.get(deleting.id) ?? 0) > 0 ? (
              <>{t('cats.deleteUsed', { n: usage.get(deleting.id) ?? 0 })}</>
            ) : (
              t('cats.deleteEmpty')
            )
          }
          onConfirm={() => onDelete(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}

      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-1 rounded-xl flex-1" style={{ background: 'var(--bg-card2)' }}>
          {(['all', 'expense', 'income'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: filter === f ? 'var(--bg-card)' : 'transparent',
                color: filter === f ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {f === 'all' ? t('common.all') : f === 'expense' ? t('type.expensePlain') : t('type.incomePlain')}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1 px-3">
          <Plus size={15} /> {t('common.add')}
        </button>
      </div>

      <div className="space-y-2">
        {filtered.map(cat => (
          <div key={cat.id} className="card overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ background: cat.color + '22' }}>
                {cat.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium">{cat.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded-md"
                    style={{ background: cat.type === 'income' ? 'var(--sage-soft)' : 'var(--expense-soft)', color: cat.type === 'income' ? 'var(--sage)' : 'var(--expense)' }}>
                    {cat.type === 'income' ? t('cats.badgeIncome') : t('cats.badgeExpense')}
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {plural(cat.subcategories.length, 'cats.sub')}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => toggle(cat.id)} aria-label={t('cats.showSubs')} className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                  {expanded.has(cat.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button onClick={() => setEditing(cat)} aria-label={t('cats.editCat')} className="p-2 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                  <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => setDeleting(cat)} aria-label={t('cats.deleteCat')} className="p-2 rounded-lg hover:bg-[var(--red-light)] transition-colors">
                  <Trash2 size={14} style={{ color: 'var(--red)' }} />
                </button>
              </div>
            </div>

            {expanded.has(cat.id) && (
              <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="pt-3">
                  <SubcategoryManager cat={cat} onUpdate={onUpdate} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
