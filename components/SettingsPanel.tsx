'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AppData, Settings, Currency, CURRENCIES, CURRENCY_SYMBOLS, CURRENCY_LABELS,
  ThemeMode, THEME_MODES, THEME_LABELS,
} from '@/lib/types';
import {
  buildBackup, buildCSV, downloadFile, parseBackup, formatMoney, convertAmount, safeRates,
} from '@/lib/storage';
import { todayKey } from '@/lib/dates';
import { useToast } from '@/lib/toast';
import ConfirmDialog from './ConfirmDialog';
import { RefreshCw, Info, Download, Upload, FileSpreadsheet, Tag, Wallet, ChevronRight } from 'lucide-react';

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  data: AppData;
  onRestore: (data: AppData, settings?: Settings) => void;
  onOpenCategories: () => void;
  onOpenAccounts: () => void;
}

export default function SettingsPanel({
  settings, onSave, data, onRestore, onOpenCategories, onOpenAccounts,
}: Props) {
  const [usdRate, setUsdRate] = useState(String(settings.rates.USD));
  const [eurRate, setEurRate] = useState(String(settings.rates.EUR));
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState<{ data: AppData; settings?: Settings } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  useEffect(() => {
    setUsdRate(String(settings.rates.USD));
    setEurRate(String(settings.rates.EUR));
  }, [settings.rates.USD, settings.rates.EUR]);

  const usdNum = Number(usdRate);
  const eurNum = Number(eurRate);
  const ratesValid = Number.isFinite(usdNum) && usdNum > 0 && Number.isFinite(eurNum) && eurNum > 0;
  const ratesChanged = usdNum !== settings.rates.USD || eurNum !== settings.rates.EUR;

  const handleSaveRates = () => {
    if (!ratesValid) { toast.show('Курс должен быть больше нуля', { tone: 'error' }); return; }
    onSave({ ...settings, rates: safeRates({ USD: usdNum, EUR: eurNum }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleExportJSON = () => {
    downloadFile(
      `fintrack-backup-${todayKey()}.json`,
      JSON.stringify(buildBackup(data, settings), null, 2),
      'application/json',
    );
    toast.show('Резервная копия скачана');
  };

  const handleExportCSV = () => {
    downloadFile(`fintrack-${todayKey()}.csv`, buildCSV(data, settings), 'text/csv;charset=utf-8;');
    toast.show('CSV скачан');
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPending(parseBackup(String(reader.result), settings.rates));
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Не удалось прочитать файл', { tone: 'error' });
      }
    };
    reader.onerror = () => toast.show('Не удалось прочитать файл', { tone: 'error' });
    reader.readAsText(file);
  };

  const previewRate = (c: Currency) => convertAmount(100, c, settings.baseCurrency, settings.rates);

  return (
    <div className="space-y-4">
      {pending && (
        <ConfirmDialog
          title="Восстановить из копии?"
          confirmLabel="Восстановить"
          description={
            <>
              В файле: {pending.data.transactions.length} операций,{' '}
              {pending.data.categories.length} категорий, {pending.data.piggyBanks.length} копилок.
              <br />
              <span style={{ color: 'var(--red)' }}>Текущие данные будут заменены.</span>
            </>
          }
          onConfirm={() => {
            onRestore(pending.data, pending.settings);
            toast.show('Данные восстановлены');
          }}
          onClose={() => setPending(null)}
        />
      )}

      {/* Счета и категории — настроечные экраны, поэтому живут здесь */}
      <button
        onClick={onOpenAccounts}
        className="card p-4 w-full flex items-center gap-3 text-left transition-colors hover:bg-[var(--bg-card2)]"
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-card2)' }}
        >
          <Wallet size={17} style={{ color: 'var(--text-muted)' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">Счета и переводы</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {data.accounts.length} {data.accounts.length === 1 ? 'счёт' : data.accounts.length < 5 ? 'счёта' : 'счетов'}
            {data.transfers.length > 0 ? `, ${data.transfers.length} переводов` : ''}
          </span>
        </span>
        <ChevronRight size={17} style={{ color: 'var(--text-muted)' }} />
      </button>

      <button
        onClick={onOpenCategories}
        className="card p-4 w-full flex items-center gap-3 text-left transition-colors hover:bg-[var(--bg-card2)]"
      >
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-card2)' }}
        >
          <Tag size={17} style={{ color: 'var(--text-muted)' }} />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium">Категории</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {data.categories.length} категорий и подкатегории
          </span>
        </span>
        <ChevronRight size={17} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Тема */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">Оформление</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          «Как в системе» следует за настройкой телефона или компьютера.
        </p>
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
          {THEME_MODES.map(m => (
            <button
              key={m}
              onClick={() => onSave({ ...settings, theme: m })}
              aria-pressed={settings.theme === m}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: settings.theme === m ? 'var(--bg-card)' : 'transparent',
                color: settings.theme === m ? 'var(--sage)' : 'var(--text-muted)',
                border: `1px solid ${settings.theme === m ? 'var(--border)' : 'transparent'}`,
              }}
            >
              {THEME_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Базовая валюта */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">Основная валюта</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          В этой валюте показываются баланс, статистика и итоги. Сами записи хранятся в своей валюте.
        </p>
        <div className="flex gap-2 p-1 rounded-xl" style={{ background: 'var(--bg-card2)' }}>
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => onSave({ ...settings, baseCurrency: c })}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: settings.baseCurrency === c ? 'var(--bg-card)' : 'transparent',
                color: settings.baseCurrency === c ? 'var(--sage)' : 'var(--text-muted)',
                boxShadow: settings.baseCurrency === c ? 'var(--shadow-seg)' : 'none',
              }}
            >
              {CURRENCY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>

      {/* Курсы */}
      <div className="card p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <RefreshCw size={14} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-sm font-medium">Курсы валют</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Сколько рублей стоит 1 доллар или 1 евро. Применяется к новым записям.
        </p>

        <div className="space-y-3">
          {([['USD', usdRate, setUsdRate, '90'], ['EUR', eurRate, setEurRate, '98']] as const).map(
            ([code, value, setter, placeholder]) => (
              <div key={code}>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  1 {code} ({CURRENCY_SYMBOLS[code as Currency]}) равен
                </label>
                <div className="relative">
                  <input
                    className="input num pr-10"
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₽</span>
                </div>
              </div>
            ),
          )}
        </div>

        <button
          onClick={handleSaveRates}
          disabled={!ratesChanged || !ratesValid}
          className="btn-primary w-full mt-4"
          style={{
            opacity: ratesChanged && ratesValid ? 1 : 0.5,
            cursor: ratesChanged && ratesValid ? 'pointer' : 'default',
          }}
        >
          {saved ? '✓ Сохранено' : 'Сохранить курсы'}
        </button>

        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Курс каждой записи сохраняется в момент её создания, поэтому правка курсов здесь
            не меняет суммы уже внесённых операций — только новые.
          </span>
        </div>
      </div>

      {/* Пример пересчёта — теперь в основной валюте, а не всегда в рублях */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-3">Пример пересчёта</h3>
        <div className="space-y-2 text-sm">
          {CURRENCIES.filter(c => c !== settings.baseCurrency).map(c => (
            <div key={c} className="flex justify-between">
              <span style={{ color: 'var(--text-muted)' }}>{formatMoney(100, c)}</span>
              <span className="num">≈ {formatMoney(previewRate(c), settings.baseCurrency)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Данные */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">Данные</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Всё хранится только в этом браузере. Очистка данных сайта сотрёт историю —
          выгружайте копию время от времени.
        </p>

        <div className="space-y-2">
          <button onClick={handleExportJSON} className="btn-ghost w-full flex items-center justify-center gap-2">
            <Download size={15} /> Скачать резервную копию
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full flex items-center justify-center gap-2">
            <Upload size={15} /> Восстановить из копии
          </button>
          <button onClick={handleExportCSV} className="btn-ghost w-full flex items-center justify-center gap-2">
            <FileSpreadsheet size={15} /> Экспорт в CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';   // чтобы повторный выбор того же файла сработал
            }}
          />
        </div>

        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          Сейчас записей: {data.transactions.length}
        </p>
      </div>
    </div>
  );
}
