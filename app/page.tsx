'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useFinanceData, useSettings, rateFor, convertAmount } from '@/lib/storage';
import { SAVINGS_IN_CATEGORY_ID, SAVINGS_OUT_CATEGORY_ID } from '@/lib/defaults';
import { monthKey, todayKey } from '@/lib/dates';
import {
  AppData, Budget, Period, Settings, Transaction, PiggyBank as PiggyBankType,
} from '@/lib/types';
import {
  effectiveBudgets, emptyPlan, findPlan, hasPlanOverride, PLAN_BUDGET_PREFIX, shiftMonth,
} from '@/lib/plans';
import { ToastProvider, useToast } from '@/lib/toast';
import { useTheme } from '@/lib/theme';
import { I18nProvider, useT, LANG_LABELS } from '@/lib/i18n';
import { useAutoRates } from '@/lib/useAutoRates';
import TransactionForm from '@/components/TransactionForm';
import TransactionList, { RecentTransactions, SEARCH_INPUT_ID } from '@/components/TransactionList';
import Statistics from '@/components/Statistics';
import PiggyBanks from '@/components/PiggyBanks';
import Categories from '@/components/Categories';
import KpiRow, { SpendingChart, CategoryShare } from '@/components/BalanceCard';
import Insights from '@/components/Insights';
import SettingsPanel from '@/components/SettingsPanel';
import Budgets, { BudgetSummary } from '@/components/Budgets';
import BudgetPlanner from '@/components/BudgetPlanner';
import Accounts, { AccountsStrip } from '@/components/Accounts';
import QuickAdd, { QUICK_AMOUNT_ID } from '@/components/QuickAdd';
import Sidebar, { NavItem } from '@/components/Sidebar';
import { format, parseISO } from 'date-fns';
import {
  Plus, LayoutDashboard, List, BarChart2, PiggyBank, Target, Wallet,
  Settings as SettingsIcon, ArrowLeft,
} from 'lucide-react';

type Tab = 'overview' | 'transactions' | 'stats' | 'budgets' | 'piggy'
  | 'categories' | 'accounts' | 'settings';

type BudgetsMode = 'current' | 'plan';

const PERIOD_KEYS: Period[] = ['day', 'week', 'month', 'year', 'all'];

/** Экраны, которые на телефоне открываются из настроек: там у них стрелка назад */
const SUB_SCREENS: Tab[] = ['categories', 'accounts'];

/** Экраны-справочники не растягиваем на всю ширину — длинные строки хуже читаются */
const NARROW: Tab[] = ['piggy', 'categories', 'accounts', 'settings'];

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
  const { t, dateLocale } = useT();
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
    savePlan, deletePlan,
    replaceAll,
  } = useFinanceData(settingsLoaded ? settings.rates : null, onStorageError, settings.baseCurrency);

  const [tab, setTab] = useState<Tab>('overview');
  const [budgetsMode, setBudgetsMode] = useState<BudgetsMode>('current');
  const [period, setPeriod] = useState<Period>('month');
  const [showForm, setShowForm] = useState(false);

  // ── Операции ───────────────────────────────────────────────────────────────

  // Добавление с возможностью отменить: быстрая строка не задаёт вопросов,
  // поэтому ошибку надо уметь откатить одним нажатием
  const handleQuickAdd = useCallback((tx: Transaction) => {
    addTransaction(tx);
    toast.show(t('quick.added'), {
      action: { label: t('common.undo'), onClick: () => deleteTransaction(tx.id) },
    });
  }, [addTransaction, deleteTransaction, toast, t]);

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

  // Движение денег в копилку и обратно попадает в баланс и статистику
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

  // ── Бюджеты текущего месяца с учётом плана ─────────────────────────────────

  const currentMonth = monthKey(new Date());
  const nextMonth = shiftMonth(currentMonth, 1);
  const budgetsNow = useMemo(
    () => effectiveBudgets(data.budgets, data.plans, currentMonth),
    [data.budgets, data.plans, currentMonth],
  );
  const plannedNow = useMemo(
    () => new Set(Object.keys(findPlan(data.plans, currentMonth)?.limits ?? {})),
    [data.plans, currentMonth],
  );

  /**
   * Лимит, пришедший из плана, правится в плане: человек меняет «этот месяц»,
   * а обычный лимит остаётся шаблоном для следующих.
   */
  const handleBudgetUpdate = useCallback((b: Budget) => {
    const original = budgetsNow.find(x => x.id === b.id);
    const fromPlan = b.id.startsWith(PLAN_BUDGET_PREFIX)
      || (original && hasPlanOverride(data.plans, currentMonth, original.categoryId));
    if (!fromPlan) { updateBudget(b); return; }
    const plan = findPlan(data.plans, currentMonth) ?? emptyPlan(currentMonth, settings);
    const limits = { ...plan.limits };
    if (original) delete limits[original.categoryId];
    limits[b.categoryId] = convertAmount(b.amount, b.currency, plan.currency, settings.rates);
    savePlan({ ...plan, limits });
  }, [budgetsNow, data.plans, currentMonth, settings, updateBudget, savePlan]);

  const handleBudgetDelete = useCallback((id: string) => {
    const b = budgetsNow.find(x => x.id === id);
    if (!b) return;
    // «Удалить лимит» значит «без лимита в этом месяце»: снимаем и план, и обычный
    const plan = findPlan(data.plans, currentMonth);
    if (plan && b.categoryId in plan.limits) {
      const limits = { ...plan.limits };
      delete limits[b.categoryId];
      savePlan({ ...plan, limits });
    }
    if (!id.startsWith(PLAN_BUDGET_PREFIX)) deleteBudget(id);
  }, [budgetsNow, data.plans, currentMonth, savePlan, deleteBudget]);

  const openPlan = useCallback(() => { setBudgetsMode('plan'); setTab('budgets'); }, []);

  // ── Горячие клавиши: N — к сумме, / — к поиску ─────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || document.querySelector('[role="dialog"]')) return;
      // Сравниваем по физической клавише: в русской раскладке «N» — это «Т»
      if (e.code === 'KeyN') {
        e.preventDefault();
        if (tab !== 'overview' && tab !== 'transactions') setTab('overview');
        setTimeout(() => document.getElementById(QUICK_AMOUNT_ID)?.focus(), 0);
      } else if (e.key === '/' || e.code === 'Slash') {
        e.preventDefault();
        if (tab !== 'transactions') setTab('transactions');
        setTimeout(() => document.getElementById(SEARCH_INPUT_ID)?.focus(), 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  if (!loaded || !settingsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-2xl">🌱</div>
      </div>
    );
  }

  const showPeriod = tab === 'overview' || tab === 'transactions' || tab === 'stats';
  const showQuickAdd = tab === 'overview' || tab === 'transactions';
  const nextMonthName = format(parseISO(nextMonth + '-01'), 'LLLL', { locale: dateLocale });

  const navItems: NavItem<Tab>[] = [
    { id: 'overview', icon: <LayoutDashboard size={18} />, label: t('nav.overview') },
    { id: 'transactions', icon: <List size={18} />, label: t('nav.transactions'), badge: data.transactions.length },
    { id: 'stats', icon: <BarChart2 size={18} />, label: t('nav.stats') },
    { id: 'budgets', icon: <Target size={18} />, label: t('nav.budgets'), badge: budgetsNow.length },
    { id: 'piggy', icon: <PiggyBank size={18} />, label: t('nav.piggy'), badge: data.piggyBanks.length },
    { id: 'accounts', icon: <Wallet size={18} />, label: t('nav.accounts'), badge: data.accounts.length },
  ];

  // На телефоне остаётся нижняя панель на пять кнопок, счета — в настройках
  const mobileTabs = navItems.filter(n => n.id !== 'accounts');

  return (
    <div className="min-h-screen md:flex" style={{ background: 'var(--bg)' }}>
      <Sidebar
        items={navItems}
        active={tab}
        onSelect={setTab}
        settings={settings}
        resolvedTheme={resolvedTheme}
        onSaveSettings={saveSettings}
        categoriesId="categories"
        settingsId="settings"
      />

      <div className="flex-1 min-w-0 pb-24 md:pb-12">
        <header className="sticky top-0 z-30" style={{ background: 'var(--bg)' }}>
          <div className="max-w-[1180px] mx-auto px-4 md:px-8 pt-4 md:pt-6 pb-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-0 mr-2">
              {SUB_SCREENS.includes(tab) && (
                <button
                  onClick={() => setTab('settings')}
                  aria-label={t('common.back')}
                  className="md:hidden p-1.5 -ml-1.5 rounded-lg flex-shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h1 className="font-extrabold text-[22px] md:text-[26px] truncate" style={{ letterSpacing: '-0.02em' }}>
                {t(`nav.${tab}`)}
              </h1>
            </div>

            {showPeriod && (
              <div className="seg max-w-full overflow-x-auto" role="group" aria-label={t('period.label')}>
                {PERIOD_KEYS.map(p => (
                  <button key={p} onClick={() => setPeriod(p)} aria-pressed={period === p}>
                    {t(`period.${p}`)}
                  </button>
                ))}
              </div>
            )}

            {tab === 'budgets' && (
              <div className="seg" role="tablist" aria-label={t('nav.budgets')}>
                <button role="tab" aria-selected={budgetsMode === 'current'} onClick={() => setBudgetsMode('current')}>
                  {t('budgets.tabCurrent')}
                </button>
                <button role="tab" aria-selected={budgetsMode === 'plan'} onClick={() => setBudgetsMode('plan')}>
                  {t('budgets.tabPlan')}
                </button>
              </div>
            )}

            <div className="flex-1" />

            {showQuickAdd && (
              <span className="hidden lg:inline text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="kbd">N</span> {t('quick.hintN')} · <span className="kbd">/</span> {t('quick.hintSearch')}
              </span>
            )}

            {/* На телефоне бокового меню нет — язык и настройки остаются в шапке */}
            <div className="flex md:hidden items-center gap-1 flex-shrink-0">
              <button
                onClick={() => saveSettings({ ...settings, lang: settings.lang === 'ru' ? 'en' : 'ru' })}
                className="px-2.5 py-2 rounded-xl text-xs font-semibold"
                style={{ color: 'var(--text-muted)', minWidth: 40 }}
                aria-label={`${t('settings.language')}: ${LANG_LABELS[settings.lang === 'ru' ? 'en' : 'ru']}`}
              >
                {settings.lang.toUpperCase()}
              </button>
              <button
                onClick={() => setTab(tab === 'settings' ? 'overview' : 'settings')}
                className="p-2.5 rounded-xl"
                style={{
                  background: tab === 'settings' ? 'var(--bg-card2)' : 'transparent',
                  color: tab === 'settings' ? 'var(--sage)' : 'var(--text-muted)',
                }}
                aria-label={t('nav.settings')}
              >
                <SettingsIcon size={19} />
              </button>
            </div>
          </div>
        </header>

        <main className={`mx-auto px-4 md:px-8 pt-2 space-y-4 md:space-y-5 ${NARROW.includes(tab) ? 'max-w-3xl' : 'max-w-[1180px]'}`}>
          {showQuickAdd && (
            <div className="hidden md:block">
              <QuickAdd
                categories={data.categories}
                accounts={data.accounts}
                transactions={data.transactions}
                settings={settings}
                onAdd={handleQuickAdd}
                onOpenFull={() => setShowForm(true)}
              />
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-4 md:space-y-5 animate-fade-in">
              <KpiRow
                transactions={data.transactions}
                accounts={data.accounts}
                transfers={data.transfers}
                period={period}
                periodLabel={t(`period.${period}`).toLowerCase()}
                settings={settings}
              />

              <div className="grid gap-4 md:gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 min-w-0">
                  <SpendingChart transactions={data.transactions} period={period} settings={settings} theme={resolvedTheme} />
                </div>
                <CategoryShare transactions={data.transactions} categories={data.categories} period={period} settings={settings} />
              </div>

              <div className="grid gap-4 md:gap-5 lg:grid-cols-3 items-start">
                <div className="lg:col-span-2 min-w-0">
                  <RecentTransactions
                    transactions={data.transactions}
                    categories={data.categories}
                    accounts={data.accounts}
                    settings={settings}
                    onDelete={handleDeleteTransaction}
                    onUpdate={updateTransaction}
                    onRepeat={handleRepeat}
                    onOpenAll={() => setTab('transactions')}
                  />
                </div>
                <div className="space-y-4 md:space-y-5 min-w-0">
                  <BudgetSummary
                    budgets={budgetsNow}
                    categories={data.categories}
                    transactions={data.transactions}
                    settings={settings}
                    onOpen={() => { setBudgetsMode('current'); setTab('budgets'); }}
                    onOpenPlan={openPlan}
                    planLabel={t('budgets.planNext', { month: nextMonthName })}
                  />
                  <AccountsStrip
                    accounts={data.accounts}
                    transactions={data.transactions}
                    transfers={data.transfers}
                    settings={settings}
                    onOpen={() => setTab('accounts')}
                  />
                  <Insights transactions={data.transactions} categories={data.categories} settings={settings} />
                </div>
              </div>
            </div>
          )}

          {tab === 'transactions' && (
            <div className="space-y-3 animate-fade-in">
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

          {tab === 'budgets' && budgetsMode === 'current' && (
            <div className="animate-fade-in">
              <Budgets
                budgets={budgetsNow}
                categories={data.categories}
                transactions={data.transactions}
                settings={settings}
                onAdd={addBudget}
                onUpdate={handleBudgetUpdate}
                onDelete={handleBudgetDelete}
                plannedCategoryIds={plannedNow}
              />
            </div>
          )}

          {tab === 'budgets' && budgetsMode === 'plan' && (
            <div className="animate-fade-in">
              <BudgetPlanner
                categories={data.categories}
                budgets={data.budgets}
                plans={data.plans}
                transactions={data.transactions}
                settings={settings}
                onSavePlan={savePlan}
                onDeletePlan={deletePlan}
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
      </div>

      {(tab === 'overview' || tab === 'transactions') && (
        <button
          onClick={() => setShowForm(true)}
          aria-label={t('form.newRecord')}
          className="md:hidden fixed right-5 bottom-24 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center transition-transform active:scale-95 z-20"
          style={{ background: 'var(--sage)', color: 'var(--sage-on)' }}
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

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30"
        style={{
          background: 'var(--bg-card)',
          borderTop: '1px solid var(--border)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="flex px-2">
          {mobileTabs.map(n => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              aria-current={tab === n.id ? 'page' : undefined}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors relative"
              style={{ color: tab === n.id ? 'var(--sage)' : 'var(--text-muted)' }}
            >
              {n.icon}
              <span className="text-[11px] font-semibold">{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
