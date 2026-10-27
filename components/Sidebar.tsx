'use client';

import { ReactNode } from 'react';
import { useT, LANG_LABELS } from '@/lib/i18n';
import { Settings } from '@/lib/types';
import { Moon, Sun, Tags, Settings as SettingsIcon } from 'lucide-react';

export interface NavItem<T extends string> {
  id: T;
  icon: ReactNode;
  label: string;
  /** Число справа: сколько записей, лимитов, копилок */
  badge?: number;
}

interface Props<T extends string> {
  items: NavItem<T>[];
  active: T;
  onSelect: (id: T) => void;
  settings: Settings;
  resolvedTheme: 'light' | 'dark';
  onSaveSettings: (s: Settings) => void;
  /** Нижние пункты: категории и настройки */
  categoriesId: T;
  settingsId: T;
}

/**
 * Боковое меню для широкого экрана. Все разделы видны сразу — раньше счета
 * и категории прятались в настройках, потому что в нижнюю панель телефона
 * помещалось только пять кнопок.
 */
export default function Sidebar<T extends string>({
  items, active, onSelect, settings, resolvedTheme, onSaveSettings, categoriesId, settingsId,
}: Props<T>) {
  const { t } = useT();

  const link = (id: T, icon: ReactNode, label: string, badge?: number) => {
    const current = active === id;
    return (
      <button
        key={id}
        onClick={() => onSelect(id)}
        aria-current={current ? 'page' : undefined}
        className="flex items-center gap-3 h-[42px] px-3 rounded-[10px] text-sm text-left transition-colors hover:bg-[var(--bg-card2)]"
        style={{
          color: current ? 'var(--sage)' : 'var(--text)',
          background: current ? 'var(--sage-soft)' : undefined,
          fontWeight: current ? 700 : 600,
        }}
      >
        <span className="flex-shrink-0" style={{ color: current ? 'var(--sage)' : 'var(--text-muted)' }}>{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {badge ? <span className="text-xs font-medium num" style={{ color: 'var(--text-muted)' }}>{badge}</span> : null}
      </button>
    );
  };

  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';

  return (
    <aside
      className="hidden md:flex flex-col gap-1 w-[232px] flex-shrink-0 sticky top-0 h-screen px-3.5 py-5"
      style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5 px-2.5 pb-5 pt-1">
        <div
          className="w-8 h-8 rounded-[10px] flex items-center justify-center font-extrabold text-[15px]"
          style={{ background: 'var(--sage)', color: 'var(--sage-on)' }}
          aria-hidden="true"
        >
          M
        </div>
        <div className="text-[17px] font-extrabold" style={{ letterSpacing: '-0.02em' }}>MyMoney</div>
      </div>

      <nav aria-label={t('nav.menu')} className="flex flex-col gap-0.5">
        {items.map(it => link(it.id, it.icon, it.label, it.badge))}
      </nav>

      <div className="mt-auto pt-6 flex flex-col gap-0.5">
        {link(categoriesId, <Tags size={18} />, t('nav.categories'))}
        {link(settingsId, <SettingsIcon size={18} />, t('nav.settings'))}

        <div className="flex items-center gap-1 px-3 pt-3">
          {(['ru', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => onSaveSettings({ ...settings, lang: l })}
              aria-pressed={settings.lang === l}
              aria-label={LANG_LABELS[l]}
              className="h-[30px] px-2.5 rounded-lg text-xs font-bold transition-colors"
              style={settings.lang === l
                ? { background: 'var(--text)', color: 'var(--bg-card)' }
                : { border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              {l.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => onSaveSettings({ ...settings, theme: nextTheme })}
            className="ml-auto h-[30px] w-[34px] rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--bg-card2)]"
            style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            aria-label={nextTheme === 'dark' ? t('theme.toDark') : t('theme.toLight')}
            title={nextTheme === 'dark' ? t('theme.toDark') : t('theme.toLight')}
          >
            {resolvedTheme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>
    </aside>
  );
}
