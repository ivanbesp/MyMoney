'use client';

import { useEffect, useRef } from 'react';
import { Settings } from './types';
import { fetchRates, ratesAreStale } from './rates';

/**
 * Тихо подтягивает курсы, если включено автообновление и они устарели.
 *
 * Молчит при любой ошибке: приложение обязано работать офлайн, и падение
 * стороннего API не должно ничем беспокоить пользователя. Явную загрузку
 * с сообщением об ошибке даёт кнопка «Обновить сейчас» в настройках.
 */
export function useAutoRates(
  settings: Settings,
  saveSettings: (s: Settings) => void,
  ready: boolean,
) {
  // Одна попытка на сессию — чтобы перерисовки не долбили API
  const attempted = useRef(false);
  // Свежий доступ к настройкам без перезапуска эффекта
  const latest = useRef({ settings, saveSettings });
  latest.current = { settings, saveSettings };

  useEffect(() => {
    if (!ready || attempted.current) return;
    if (!settings.autoRates || !ratesAreStale(settings.ratesUpdatedAt)) return;

    attempted.current = true;
    let cancelled = false;

    fetchRates().then(result => {
      if (cancelled || !result) return;
      const { settings: current, saveSettings: save } = latest.current;
      // Пока шёл запрос, пользователь мог выключить автообновление
      if (!current.autoRates) return;
      save({
        ...current,
        rates: result.rates,
        ratesSource: result.source,
        ratesUpdatedAt: result.fetchedAt,
      });
    });

    return () => { cancelled = true; };
  }, [ready, settings.autoRates, settings.ratesUpdatedAt]);
}
