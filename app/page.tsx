'use client';

import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useFinanceData, useSettings, rateFor } from '@/lib/storage';
import { SAVINGS_IN_CATEGORY_ID, SAVINGS_OUT_CATEGORY_ID } from '@/lib/defaults';
import { todayKey } from '@/lib/dates';
import { AppData, Period, Settings, Transaction, PiggyBank as PiggyBankType } from '@/lib/types';
import { ToastProvider, useToast } from '@/lib/toast';
import { useTheme } from '@/lib/theme';
import { I18nProvider, useT, LANG_LABELS } from '@/lib/i18n';
import { useAutoRates } from '@/lib/useAutoRates';
import TransactionForm from '@/components/TransactionForm';
import TransactionList from '@/components/TransactionList';
import Statistics from '@/components/Statistics';
import PiggyBanks from '@/components/PiggyBanks';
import Categories from '@/components/Categories';
import BalanceCard from '@/components/BalanceCard';
import Insights from '@/components/Insights';
import SettingsPanel from '@/components/SettingsPanel';
import Budgets, { BudgetSummary } from '@/components/Budgets';
import Accounts, { AccountsStrip } from '@/components/Accounts';
import {
  Plus, LayoutDashboard, List, BarChart2, PiggyBank, Target,
  Settings as SettingsIcon, ArrowLeft,
} from 'lucide-react';

type Tab = 'overview' | 'transactions' | 'stats' | 'budgets' | 'piggy'
  | 'categories' | 'accounts' | 'settings';

const PERIOD_KEYS: Period[] = ['day', 'week', 'month', 'year', 'all'];

/** Экраны, открытые из настроек: у них в шапке стрелка назад */
const SUB_SCREENS: Tab[] = ['categories', 'accounts'];

export default function Page() {
  return (
    <ToastProvider>
      <LangGate />
    </ToastProvider>
  );
}

/** Язык нужен выше App, поэтому настройки читаются здесь и прокидываются в провайдер */
function LangGate() {
  const settingsApi = useSettings();
  return (
    <I18nProvider lang={settingsApi.settings.lang}>
      <App settingsApi={settingsApi} />
    </I18nProvider>
  );
}

function App({ settingsApi }: { settingsApi: ReturnType<typeof useSettings> }) {
  const toast = useToast();
  const { t, plural } = useT();
  const { settings, saveSettings, loaded: settingsLoaded } = settingsApi;
  const resolvedTheme = useTheme(settings.theme);
  useAutoRates(settings, saveSettings, settingsLoaded);

  const onStorageError = useCallback(
    (key: string) => toast.show(t(key), { tone: 'error', duration: 8000 }),
    [toast, t],
  );

  // Данные грузим только после настроек: миграция проставляет в старые
  // операции курс, который был актуален на момент их создания.
  const {
    data, loaded,
    addTransaction, deleteTransaction, updateTransaction,
    addCategory, updateCategory, deleteCategory,
    addPiggyBank, updatePiggyBank, deletePiggyBank,
    addBudget, updateBudget, deleteBudget,
    addAccount, updateAccount, deleteAccount,
    addTransfer, deleteTransfer,
    replaceAll,
  } = useFinanceData(settingsLoaded ? settings.rates : null, onStorageError, settings.baseCurrency);

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('month');
  const [showForm, setShowForm] = useState(false);

  // Удаление без модалки, но с возможностью вернуть: для частого действия
  // это спокойнее, чем подтверждение на каждый чих.
  const handleDeleteTransaction = useCallback((tx: Transaction) => {
    deleteTransaction(tx.id);
    toast.show(t('list.deleted'), {
      action: { label: t('common.undo'), onClick: () => addTransaction(tx) },
    });
  }, [deleteTransaction, addTransaction, toast, t]);

  // Повтор: та же категория и сумма, но сегодняшняя дата и сегодняшний курс —
  // это новая трата, а не копия старой
  const handleRepeat = useCallback((tx: Transaction) => {
    const copy: Transaction = {
      ...tx,
      id: uuidv4(),
      date: todayKey(),
      rate: rateFor(tx.currency, settings.rates),
      createdAt: new Date().toISOString(),
      piggyBankId: undefined,
    };
    addTransaction(copy);
    toast.show(t('list.repeated'), {
      action: { label: t('common.undo'), onClick: () => deleteTransaction(copy.id) },
    });
  }, [addTransaction, deleteTransaction, settings.rates, toast, t]);

  // Движение денег в копилку и обратно теперь попадает в баланс и статистику
  const handlePiggyMovement = useCallback((pb: PiggyBankType, amount: number, mode: 'add' | 'withdraw') => {
    const isDeposit = mode === 'add';
    const tx: Transaction = {
      id: uuidv4(),
      type: isDeposit ? 'expense' : 'income',
      amount,
      currency: pb.currentCurrency,
      rate: rateFor(pb.currentCurrency, settings.rates),
      categoryId: isDeposit ? SAVINGS_OUT_CATEGORY_ID : SAVINGS_IN_CATEGORY_ID,
      // Копилка не привязана к счёту, поэтому пишем на счёт в той же валюте,
      // а если такого нет — на первый
      accountId: (data.accounts.find(a => a.currency === pb.currentCurrency) ?? data.accounts[0])?.id ?? '',
      note: `${pb.emoji} ${pb.name}`,
      date: todayKey(),
      createdAt: new Date().toISOString(),
      piggyBankId: pb.id,
    };
    addTransaction(tx);
    toast.show(isDeposit ? t('piggy.recordedExpense') : t('piggy.recordedIncome'), {
      action: { label: t('common.undo'), onClick: () => deleteTransaction(tx.id) },
    });
  }, [addTransaction, deleteTransaction, settings.rates, toast, t, data.accounts]);

  const handleRestore = useCallback((restored: AppData, restoredSettings?: Settings) => {
    if (restoredSettings) saveSettings(restoredSettings);
    replaceAll(restored);
  }, [replaceAll, saveSettings]);

  if (!loaded || !settingsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-2xl">🌱</div>
      </div>
    );
  }

  const showPeriod = tab === 'overview' || tab === 'transactions' || tab === 'stats';

  // «Категории» переехали в настройки: это настроечный экран, а не ежедневный,
  // и слот в навигации нужнее бюджетам
  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <LayoutDashboard size={20} />, label: t('nav.overview') },
    { id: 'transactions', icon: <List size={20} />, label: t('nav.transactions') },
    { id: 'stats', icon: <BarChart2 size={20} />, label: t('nav.stats') },
    { id: 'budgets', icon: <Target size={20} />, label: t('nav.budgets') },
    { id: 'piggy', icon: <PiggyBank size={20} />, label: t('nav.piggy') },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg)' }}>
      {/* Пять кнопок периода не помещались в шапку рядом с заголовком:
          11px шрифт и зона нажатия меньше 44px. Теперь это отдельная строка. */}
      <header className="sticky top-0 z-30" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between pt-4 pb-3">
            <div className="flex items-center gap-2 min-w-0">
              {SUB_SCREENS.includes(tab) && (
                <button
                  onClick={() => setTab('settings')}
                  aria-label={t('common.back')}
                  className="p-1.5 -ml-1.5 rounded-lg flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <div className="min-w-0">
                <h1 className="font-medium text-lg truncate" style={{ letterSpacing: '-0.02em' }}>{t(`nav.${tab}`)}</h1>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {plural(data.transactions.length, 'records')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
            {/* Переключатель языка мини-кнопкой: целая карточка в настройках
                съедала экран ради двух вариантов */}
            <button
              onClick={() => saveSettings({ ...settings, lang: settings.lang === 'ru' ? 'en' : 'ru' })}
              className="px-2.5 py-2 rounded-xl text-xs font-medium transition-colors"
              style={{ color: 'var(--text-muted)', minWidth: 40 }}
              aria-label={`${t('settings.language')}: ${LANG_LABELS[settings.lang === 'ru' ? 'en' : 'ru']}`}
              title={t('settings.languageHint')}
            >
              {settings.lang.toUpperCase()}
            </button>
            <button
              onClick={() => setTab(tab === 'settings' ? 'overview' : 'settings')}
              className="p-2.5 rounded-xl transition-colors flex-shrink-0"
              style={{
                background: tab === 'settings' ? 'var(--bg-card2)' : 'transparent',
                color: tab === 'settings' ? 'var(--sage)' : 'var(--text-muted)',
              }}
              aria-label={t('nav.settings')}
              title={t('nav.settings')}
            >
              <SettingsIcon size={19} />
            </button>
            </div>
          </div>
          {showPeriod && (
            <div className="flex gap-1.5 pb-3">
              {PERIOD_KEYS.map(p => (
                <button key={p} onClick={() => setPeriod(p)} className="chip" aria-pressed={period === p}>
                  {t(`period.${p}`)}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {tab === 'overview' && (
          <div className="space-y-4 animate-fade-in">
            <BalanceCard
              transactions={data.transactions}
              categories={data.categories}
              period={period}
              periodLabel={t(`period.${period}`).toLowerCase()}
              settings={settings}
            />

            <AccountsStrip
              accounts={data.accounts}
              transactions={data.transactions}
              transfers={data.transfers}
              settings={settings}
              onOpen={() => setTab('accounts')}
            />

            <BudgetSummary
              budgets={data.budgets}
              categories={data.categories}
              transactions={data.transactions}
              settings={settings}
              onOpen={() => setTab('budgets')}
            />

            <Insights transactions={data.transactions} categories={data.categories} settings={settings} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">{t('list.recent')}</h2>
                <button onClick={() => setTab('transactions')} className="text-xs" style={{ color: 'var(--sage)' }}>
                  {t('common.seeAll')}
                </button>
              </div>
              <TransactionList
                transactions={data.transactions.slice(0, 10)}
                categories={data.categories}
                accounts={data.accounts}
                period="all"
                settings={settings}
                onDelete={handleDeleteTransaction}
                onUpdate={updateTransaction}
                onRepeat={handleRepeat}
              />
            </div>
          </div>
        )}

        {tab === 'transactions' && (
          <div className="animate-fade-in">
            <TransactionList
              transactions={data.transactions}
              categories={data.categories}
              accounts={data.accounts}
              transfers={data.transfers}
              period={period}
              settings={settings}
              onDelete={handleDeleteTransaction}
              onUpdate={updateTransaction}
              onRepeat={handleRepeat}
              searchable
            />
          </div>
        )}

        {tab === 'stats' && (
          <div className="animate-fade-in">
            <Statistics
              transactions={data.transactions}
              categories={data.categories}
              period={period}
              settings={settings}
              theme={resolvedTheme}
            />
          </div>
        )}

        {tab === 'accounts' && (
          <div className="animate-fade-in">
            <Accounts
              accounts={data.accounts}
              transactions={data.transactions}
              transfers={data.transfers}
              settings={settings}
              onAdd={addAccount}
              onUpdate={updateAccount}
              onDelete={deleteAccount}
              onTransfer={addTransfer}
              onDeleteTransfer={deleteTransfer}
            />
          </div>
        )}

        {tab === 'budgets' && (
          <div className="animate-fade-in">
            <Budgets
              budgets={data.budgets}
              categories={data.categories}
              transactions={data.transactions}
              settings={settings}
              onAdd={addBudget}
              onUpdate={updateBudget}
              onDelete={deleteBudget}
            />
          </div>
        )}

        {tab === 'piggy' && (
          <div className="animate-fade-in">
            <PiggyBanks
              piggyBanks={data.piggyBanks}
              settings={settings}
              onAdd={addPiggyBank}
              onUpdate={updatePiggyBank}
              onDelete={deletePiggyBank}
              onRecordMovement={handlePiggyMovement}
            />
          </div>
        )}

        {tab === 'categories' && (
          <div className="animate-fade-in">
            <Categories
              categories={data.categories}
              transactions={data.transactions}
              onAdd={addCategory}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
            />
          </div>
        )}

        {tab === 'settings' && (
          <div className="animate-fade-in">
            <SettingsPanel
              settings={settings}
              onSave={saveSettings}
              data={data}
              onRestore={handleRestore}
              onOpenCategories={() => setTab('categories')}
              onOpenAccounts={() => setTab('accounts')}
            />
          </div>
        )}
      </main>

      {(tab === 'overview' || tab === 'transactions') && (
        <button
          onClick={() => setShowForm(true)}
          aria-label={t('form.newRecord')}
          className="fixed right-5 bottom-24 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center transition-transform active:scale-95 z-20"
          style={{ background: 'var(--sage)', color: 'white', boxShadow: '0 4px 20px rgba(107,143,113,0.4)' }}
        >
          <Plus size={24} strokeWidth={2} />
        </button>
      )}

      {showForm && (
        <TransactionForm
          categories={data.categories}
          accounts={data.accounts}
          settings={settings}
          onAdd={addTransaction}
          onClose={() => setShowForm(false)}
        />
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-30"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}>
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative"
                style={{ color: tab === t.id ? 'var(--sage)' : 'var(--text-muted)' }}
              >
                {t.icon}
                <span className="text-[11px] font-medium">{t.label}</span>
                {tab === t.id && (
                  <span
                    className="absolute top-0 rounded-full"
                    style={{ width: 20, height: 2, background: 'var(--sage)' }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
