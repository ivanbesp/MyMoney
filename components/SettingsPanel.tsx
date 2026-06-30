'use client';

import { useState } from 'react';
import { Settings, Currency, CURRENCY_SYMBOLS, CURRENCY_LABELS } from '@/lib/types';
import { RefreshCw, Info } from 'lucide-react';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
}

const CURRENCIES: Currency[] = ['RUB', 'USD', 'EUR'];

export default function SettingsPanel({ settings, onSave }: Props) {
  const [usdRate, setUsdRate] = useState(String(settings.rates.USD));
  const [eurRate, setEurRate] = useState(String(settings.rates.EUR));
  const [saved, setSaved] = useState(false);

  const handleBaseCurrency = (c: Currency) => {
    onSave({ ...settings, baseCurrency: c });
  };

  const handleSaveRates = () => {
    const usd = Number(usdRate);
    const eur = Number(eurRate);
    if (!usd || usd <= 0 || !eur || eur <= 0) return;
    onSave({ ...settings, rates: { USD: usd, EUR: eur } });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const ratesChanged = Number(usdRate) !== settings.rates.USD || Number(eurRate) !== settings.rates.EUR;

  return (
    <div className="space-y-4">
      {/* Base currency */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">Основная валюта</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          В этой валюте будет показываться баланс, статистика и итоги
        </p>
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => handleBaseCurrency(c)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: settings.baseCurrency === c ? 'var(--bg-card)' : 'transparent',
                color: settings.baseCurrency === c ? 'var(--sage)' : 'var(--text-muted)',
                boxShadow: settings.baseCurrency === c ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {CURRENCY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Exchange rates */}
      <div className="card p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <RefreshCw size={14} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-sm font-medium">Курсы валют</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Указывайте курс вручную — сколько рублей стоит 1 доллар или 1 евро
        </p>

        <div className="space-y-3">
          <div>
            <label className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <span>1 USD ($) равен</span>
            </label>
            <div className="relative">
              <input
                className="input num pr-10"
                type="number"
                value={usdRate}
                onChange={e => setUsdRate(e.target.value)}
                placeholder="90"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₽</span>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              <span>1 EUR (€) равен</span>
            </label>
            <div className="relative">
              <input
                className="input num pr-10"
                type="number"
                value={eurRate}
                onChange={e => setEurRate(e.target.value)}
                placeholder="98"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₽</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveRates}
          disabled={!ratesChanged}
          className="btn-primary w-full mt-4"
          style={{ opacity: ratesChanged ? 1 : 0.5, cursor: ratesChanged ? 'pointer' : 'default' }}
        >
          {saved ? '✓ Сохранено' : 'Сохранить курсы'}
        </button>

        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Курсы не обновляются автоматически — вводите их сами, например, по текущему курсу ЦБ
            или вашего банка. Все суммы в других валютах пересчитываются по этим курсам.
          </span>
        </div>
      </div>

      {/* Examples */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-3">Пример пересчёта</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>100 $</span>
            <span className="num">≈ {(100 * Number(usdRate || settings.rates.USD)).toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--text-muted)' }}>100 €</span>
            <span className="num">≈ {(100 * Number(eurRate || settings.rates.EUR)).toLocaleString('ru-RU')} ₽</span>
          </div>
        </div>
      </div>
    </div>
  );
}
