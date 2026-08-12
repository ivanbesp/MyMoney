'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AppData, Settings, Currency, CURRENCIES, CURRENCY_SYMBOLS,
  THEME_MODES,
} from '@/lib/types';
import {
  buildBackup, buildCSV, downloadFile, parseBackup, formatMoney, convertAmount, safeRates,
} from '@/lib/storage';
import { todayKey } from '@/lib/dates';
import { fetchRates, formatAgo, ratesAreStale } from '@/lib/rates';
import { useToast } from '@/lib/toast';
import { useT } from '@/lib/i18n';
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
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<{ data: AppData; settings?: Settings } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { t, plural } = useT();

  useEffect(() => {
    setUsdRate(String(settings.rates.USD));
    setEurRate(String(settings.rates.EUR));
  }, [settings.rates.USD, settings.rates.EUR]);

  const usdNum = Number(usdRate);
  const eurNum = Number(eurRate);
  const ratesValid = Number.isFinite(usdNum) && usdNum > 0 && Number.isFinite(eurNum) && eurNum > 0;
  const ratesChanged = usdNum !== settings.rates.USD || eurNum !== settings.rates.EUR;

  const handleSaveRates = () => {
    if (!ratesValid) { toast.show(t('settings.ratesPositive'), { tone: 'error' }); return; }
    // Ручная правка снимает отметку об источнике: курс больше не «из сети»
    onSave({
      ...settings,
      rates: safeRates({ USD: usdNum, EUR: eurNum }),
      ratesSource: undefined,
      ratesUpdatedAt: undefined,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await fetchRates();
    setRefreshing(false);
    if (!result) {
      toast.show(t('settings.ratesError'), { tone: 'error', duration: 6000 });
      return;
    }
    onSave({
      ...settings,
      rates: result.rates,
      ratesSource: result.source,
      ratesUpdatedAt: result.fetchedAt,
    });
    toast.show(t('settings.ratesUpdated', { source: result.source }));
  };

  const handleToggleAuto = async (enabled: boolean) => {
    onSave({ ...settings, autoRates: enabled });
    if (enabled && ratesAreStale(settings.ratesUpdatedAt)) await handleRefresh();
  };

  const handleExportJSON = () => {
    downloadFile(
      `fintrack-backup-${todayKey()}.json`,
      JSON.stringify(buildBackup(data, settings), null, 2),
      'application/json',
    );
    toast.show(t('settings.backupDone'));
  };

  const handleExportCSV = () => {
    downloadFile(`fintrack-${todayKey()}.csv`, buildCSV(data, settings), 'text/csv;charset=utf-8;');
    toast.show(t('settings.csvDone'));
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPending(parseBackup(String(reader.result), settings.rates));
      } catch (e) {
        toast.show(e instanceof Error ? e.message : t('settings.fileError'), { tone: 'error' });
      }
    };
    reader.onerror = () => toast.show(t('settings.fileError'), { tone: 'error' });
    reader.readAsText(file);
  };

  const previewRate = (c: Currency) => convertAmount(100, c, settings.baseCurrency, settings.rates);

  return (
    <div className="space-y-4">
      {pending && (
        <ConfirmDialog
          title={t('settings.restoreTitle')}
          confirmLabel={t('settings.restoreConfirm')}
          description={
            <>
              {t('settings.restoreCounts', {
                tx: pending.data.transactions.length,
                cat: pending.data.categories.length,
                pb: pending.data.piggyBanks.length,
              })}
              <br />
              <span style={{ color: 'var(--red)' }}>{t('settings.restoreWarn')}</span>
            </>
          }
          onConfirm={() => {
            onRestore(pending.data, pending.settings);
            toast.show(t('settings.restoreDone'));
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
          <span className="block text-sm font-medium">{t('settings.accounts')}</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {plural(data.accounts.length, 'accounts.count')}
            {data.transfers.length > 0 ? `, ${plural(data.transfers.length, 'transfers.count')}` : ''}
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
          <span className="block text-sm font-medium">{t('settings.categories')}</span>
          <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
            {plural(data.categories.length, 'categories.count')}
          </span>
        </span>
        <ChevronRight size={17} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* Тема */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">{t('settings.appearance')}</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          {t('settings.appearanceHint')}
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
              {t(`settings.theme.${m}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Базовая валюта */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-1">{t('settings.baseCurrency')}</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          {t('settings.baseCurrencyHint')}
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
              {t(`currency.${c}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Курсы */}
      <div className="card p-5">
        <div className="flex items-center gap-1.5 mb-1">
          <RefreshCw size={14} style={{ color: 'var(--text-muted)' }} />
          <h3 className="text-sm font-medium">{t('settings.rates')}</h3>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('settings.ratesHint')}
        </p>

        <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.autoRates}
            onChange={e => handleToggleAuto(e.target.checked)}
            className="mt-0.5 flex-shrink-0"
            style={{ accentColor: 'var(--sage)', width: 16, height: 16 }}
          />
          <span className="text-sm" style={{ lineHeight: 1.45 }}>
            {t('settings.ratesAuto')}
            <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
              {t('settings.ratesAutoHint')}
            </span>
          </span>
        </label>

        <div className="space-y-3">
          {([['USD', usdRate, setUsdRate, '90'], ['EUR', eurRate, setEurRate, '98']] as const).map(
            ([code, value, setter, placeholder]) => (
              <div key={code}>
                <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                  {t('settings.ratesEquals', { code, sym: CURRENCY_SYMBOLS[code as Currency] })}
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
                    readOnly={settings.autoRates}
                    aria-readonly={settings.autoRates}
                    style={settings.autoRates ? { opacity: 0.6, cursor: 'default' } : undefined}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₽</span>
                </div>
              </div>
            ),
          )}
        </div>

        {settings.autoRates ? (
          <>
            <button onClick={handleRefresh} disabled={refreshing} className="btn-ghost w-full mt-4 flex items-center justify-center gap-2">
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : undefined} />
              {refreshing ? t('settings.ratesRefreshing') : t('settings.ratesRefresh')}
            </button>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>
              {settings.ratesSource
                ? `${settings.ratesSource} · ${formatAgo(settings.ratesUpdatedAt)}`
                : t('settings.ratesNever')}
            </p>
          </>
        ) : (
          <button
            onClick={handleSaveRates}
            disabled={!ratesChanged || !ratesValid}
            className="btn-primary w-full mt-4"
            style={{
              opacity: ratesChanged && ratesValid ? 1 : 0.5,
              cursor: ratesChanged && ratesValid ? 'pointer' : 'default',
            }}
          >
            {saved ? t('common.saved') : t('settings.ratesSave')}
          </button>
        )}

        <div className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            {t('settings.ratesFrozenNote')}
          </span>
        </div>
      </div>

      {/* Пример пересчёта — теперь в основной валюте, а не всегда в рублях */}
      <div className="card p-5">
        <h3 className="text-sm font-medium mb-3">{t('settings.example')}</h3>
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
        <h3 className="text-sm font-medium mb-1">{t('settings.data')}</h3>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          {t('settings.dataHint')}
        </p>

        <div className="space-y-2">
          <button onClick={handleExportJSON} className="btn-ghost w-full flex items-center justify-center gap-2">
            <Download size={15} /> {t('settings.backup')}
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost w-full flex items-center justify-center gap-2">
            <Upload size={15} /> {t('settings.restore')}
          </button>
          <button onClick={handleExportCSV} className="btn-ghost w-full flex items-center justify-center gap-2">
            <FileSpreadsheet size={15} /> {t('settings.exportCsv')}
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
          {t('settings.recordsNow', { n: data.transactions.length })}
        </p>
      </div>
    </div>
  );
}
