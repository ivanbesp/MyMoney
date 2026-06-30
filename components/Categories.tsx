'use client';

import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Category, Subcategory, TransactionType } from '@/lib/types';
import { CATEGORY_COLORS, CATEGORY_ICONS } from '@/lib/defaults';
import { Plus, X, Pencil, Trash2, ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  categories: Category[];
  onAdd: (cat: Category) => void;
  onUpdate: (cat: Category) => void;
  onDelete: (id: string) => void;
}

function CategoryForm({ initial, onSave, onClose }: {
  initial?: Category;
  onSave: (cat: Category) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TransactionType>(initial?.type ?? 'expense');
  const [color, setColor] = useState(initial?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? CATEGORY_ICONS[0]);
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!name.trim()) { setError('Введите название'); return; }
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
          <h2 className="text-lg font-semibold">{initial ? 'Редактировать' : 'Новая категория'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>

        {!initial && (
          <div className="flex gap-2 mb-4 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
            {(['expense', 'income'] as TransactionType[]).map(t => (
              <button key={t} onClick={() => setType(t)}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: type === t ? 'var(--bg-card)' : 'transparent',
                  color: type === t ? (t === 'income' ? 'var(--sage)' : 'var(--red)') : 'var(--text-muted)',
                  boxShadow: type === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >{t === 'expense' ? '↓ Расход' : '↑ Доход'}</button>
            ))}
          </div>
        )}

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Название</label>
          <input className="input" value={name} onChange={e => { setName(e.target.value); setError(''); }} autoFocus placeholder="Название категории" />
        </div>

        <div className="mb-3">
          <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Иконка</label>
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

function SubcategoryManager({ cat, onUpdate }: { cat: Category; onUpdate: (cat: Category) => void }) {
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
          placeholder="Новая подкатегория..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addSub()}
        />
        <button onClick={addSub} className="btn-primary px-3 py-1.5 text-sm">+</button>
      </div>
      {cat.subcategories.map(sub => (
        <div key={sub.id} className="flex items-center justify-between py-1.5 group">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>• {sub.name}</span>
          <button onClick={() => deleteSub(sub.id)} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-[var(--red-light)] transition-all">
            <Trash2 size={12} style={{ color: 'var(--red)' }} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Categories({ categories, onAdd, onUpdate, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<TransactionType | 'all'>('all');

  const filtered = categories.filter(c => filter === 'all' || c.type === filter);

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
              {f === 'all' ? 'Все' : f === 'expense' ? 'Расходы' : 'Доходы'}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-1 px-3">
          <Plus size={15} /> Добавить
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
                    style={{ background: cat.type === 'income' ? '#6B8F7122' : '#C26B6B22', color: cat.type === 'income' ? 'var(--sage)' : 'var(--red)' }}>
                    {cat.type === 'income' ? 'доход' : 'расход'}
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {cat.subcategories.length} подкатегор{cat.subcategories.length === 1 ? 'ия' : cat.subcategories.length < 5 ? 'ии' : 'ий'}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => toggle(cat.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                  {expanded.has(cat.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <button onClick={() => setEditing(cat)} className="p-1.5 rounded-lg hover:bg-[var(--bg-card2)] transition-colors">
                  <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => onDelete(cat.id)} className="p-1.5 rounded-lg hover:bg-[var(--red-light)] transition-colors">
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
