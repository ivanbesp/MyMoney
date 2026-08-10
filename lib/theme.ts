'use client';

import { useEffect, useState } from 'react';
import { ThemeMode } from './types';

export const THEME_STORAGE_KEY = 'finance_tracker_settings';

/**
 * Скрипт, который выполняется до первой отрисовки и ставит data-theme.
 * Без него страница успевает мигнуть светлой темой перед гидрацией.
 * Держится строкой, потому что должен попасть в <head> синхронно.
 */
export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var mode = 'system';
    var raw = localStorage.getItem('${THEME_STORAGE_KEY}');
    if (raw) { var s = JSON.parse(raw); if (s && s.theme) mode = s.theme; }
    var dark = mode === 'dark' ||
      (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

/** Держит data-theme в актуальном состоянии и отдаёт разрешённую тему */
export function useTheme(mode: ThemeMode): 'light' | 'dark' {
  const [resolved, setResolved] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const apply = () => {
      const next = resolveTheme(mode);
      document.documentElement.setAttribute('data-theme', next);
      setResolved(next);
    };
    apply();

    if (mode !== 'system') return;
    // Пользователь может переключить тему ОС при открытой вкладке
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  return resolved;
}

/**
 * Recharts принимает только конкретные цвета, поэтому CSS-переменные
 * приходится вычислять и пересчитывать при смене темы.
 */
export function useChartColors(resolvedTheme: 'light' | 'dark') {
  const [colors, setColors] = useState({
    income: '#2F6B4F',
    expense: '#C2703F',
    grid: '#E2E4E8',
    muted: '#7C828C',
  });

  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const read = (name: string, fallback: string) =>
      css.getPropertyValue(name).trim() || fallback;
    setColors({
      income: read('--sage', '#2F6B4F'),
      expense: read('--expense', '#C2703F'),
      grid: read('--grid', '#E2E4E8'),
      muted: read('--text-muted', '#7C828C'),
    });
  }, [resolvedTheme]);

  return colors;
}
