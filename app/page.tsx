'use client';

import { useState } from 'react';
import { useFinanceData, useSettings, filterByPeriod, calcStats, formatMoney } from '@/lib/storage';
import { Period } from '@/lib/types';
import TransactionForm from '@/components/TransactionForm';
import TransactionList from '@/components/TransactionList';
import Statistics from '@/components/Statistics';
import PiggyBanks from '@/components/PiggyBanks';
import Categories from '@/components/Categories';
import FinancePulse from '@/components/FinancePulse';
import Insights from '@/components/Insights';
import SettingsPanel from '@/components/SettingsPanel';
import { Plus, LayoutDashboard, List, BarChart2, PiggyBank, Tag, Settings as SettingsIcon } from 'lucide-react';

type Tab = 'overview' | 'transactions' | 'stats' | 'piggy' | 'categories' | 'settings';

const PERIOD_LABELS: Record<Period, string> = {
  day: 'Сегодня',
  week: 'Неделя',
  month: 'Месяц',
  year: 'Год',
  all: 'Всё время',
};

export default function App() {
  const {
    data, loaded,
    addTransaction, deleteTransaction, updateTransaction,
    addCategory, updateCategory, deleteCategory,
    addPiggyBank, updatePiggyBank, deletePiggyBank,
  } = useFinanceData();

  const { settings, saveSettings, loaded: settingsLoaded } = useSettings();

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('month');
  const [showForm, setShowForm] = useState(false);

  if (!loaded || !settingsLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-2xl">🌱</div>
      </div>
    );
  }

  const periodTxs = filterByPeriod(data.transactions, period);
  const { income, expense, balance } = calcStats(periodTxs, settings);

  const tabs: { id: Tab; icon: React.ReactNode; label: string }[] = [
    { id: 'overview', icon: <LayoutDashboard size={20} />, label: 'Обзор' },
    { id: 'transactions', icon: <List size={20} />, label: 'Записи' },
    { id: 'stats', icon: <BarChart2 size={20} />, label: 'Статистика' },
    { id: 'piggy', icon: <PiggyBank size={20} />, label: 'Копилки' },
    { id: 'categories', icon: <Tag size={20} />, label: 'Категории' },
  ];

  return (
    <div className="min-h-screen pb-24" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-2xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="font-semibold text-base" style={{ letterSpacing: '-0.02em' }}>Финансы</h1>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {data.transactions.length} записей
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Period selector - only on relevant tabs */}
              {(tab === 'overview' || tab === 'transactions' || tab === 'stats') && (
                <div className="flex gap-0.5">
                  {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className="period-tab"
                      style={{
                        background: period === p ? 'var(--bg-card2)' : 'transparent',
                        color: period === p ? 'var(--text)' : 'var(--text-muted)',
                        fontSize: '11px',
                        padding: '5px 8px',
                      }}
                    >
                      {PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              )}
              {/* Settings gear */}
              <button
                onClick={() => setTab('settings')}
                className="p-2 rounded-lg transition-colors flex-shrink-0"
                style={{
                  background: tab === 'settings' ? 'var(--bg-card2)' : 'transparent',
                  color: tab === 'settings' ? 'var(--sage)' : 'var(--text-muted)',
                }}
                title="Настройки"
              >
                <SettingsIcon size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">

        {/* Overview tab */}
        {tab === 'overview' && (
          <div className="space-y-4 animate-fade-in">
            {/* Balance card */}
            <div className="card p-5 text-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-5" style={{
                background: `radial-gradient(circle at 70% 30%, var(--sage) 0%, transparent 60%)`,
              }} />
              <p className="text-xs mb-1 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Баланс · {PERIOD_LABELS[period].toLowerCase()}
              </p>
              <div className="num text-4xl font-light mb-1" style={{ color: balance >= 0 ? 'var(--text)' : 'var(--red)' }}>
                {balance >= 0 ? '' : '−'}{formatMoney(Math.abs(balance), settings.baseCurrency)}
              </div>
              <div className="flex justify-center gap-6 mt-3">
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Доходы</div>
                  <div className="num text-sm" style={{ color: 'var(--sage)' }}>+{formatMoney(income, settings.baseCurrency)}</div>
                </div>
                <div className="w-px" style={{ background: 'var(--border)' }} />
                <div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Расходы</div>
                  <div className="num text-sm">−{formatMoney(expense, settings.baseCurrency)}</div>
                </div>
              </div>
            </div>

            <FinancePulse transactions={data.transactions} settings={settings} />
            <Insights transactions={data.transactions} categories={data.categories} settings={settings} />

            {/* Recent transactions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium">Последние записи</h2>
                <button onClick={() => setTab('transactions')}
                  className="text-xs" style={{ color: 'var(--sage)' }}>
                  Все →
                </button>
              </div>
              <TransactionList
                transactions={data.transactions.slice(0, 10)}
                categories={data.categories}
                period="all"
                settings={settings}
                onDelete={deleteTransaction}
                onUpdate={updateTransaction}
              />
            </div>
          </div>
        )}

        {/* Transactions tab */}
        {tab === 'transactions' && (
          <div className="animate-fade-in">
            <TransactionList
              transactions={data.transactions}
              categories={data.categories}
              period={period}
              settings={settings}
              onDelete={deleteTransaction}
              onUpdate={updateTransaction}
            />
          </div>
        )}

        {/* Stats tab */}
        {tab === 'stats' && (
          <div className="animate-fade-in">
            <Statistics transactions={data.transactions} categories={data.categories} period={period} settings={settings} />
          </div>
        )}

        {/* Piggy banks tab */}
        {tab === 'piggy' && (
          <div className="animate-fade-in">
            <PiggyBanks
              piggyBanks={data.piggyBanks}
              settings={settings}
              onAdd={addPiggyBank}
              onUpdate={updatePiggyBank}
              onDelete={deletePiggyBank}
            />
          </div>
        )}

        {/* Categories tab */}
        {tab === 'categories' && (
          <div className="animate-fade-in">
            <Categories
              categories={data.categories}
              onAdd={addCategory}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
            />
          </div>
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="animate-fade-in">
            <SettingsPanel settings={settings} onSave={saveSettings} />
          </div>
        )}
      </main>

      {/* FAB - Add transaction */}
      {(tab === 'overview' || tab === 'transactions') && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed right-5 bottom-24 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center transition-transform active:scale-95 z-20"
          style={{ background: 'var(--sage)', color: 'white', boxShadow: '0 4px 20px rgba(107,143,113,0.4)' }}
        >
          <Plus size={24} strokeWidth={2} />
        </button>
      )}

      {/* Transaction form */}
      {showForm && (
        <TransactionForm
          categories={data.categories}
          settings={settings}
          onAdd={addTransaction}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30"
        style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-2xl mx-auto px-2">
          <div className="flex">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
                style={{ color: tab === t.id ? 'var(--sage)' : 'var(--text-muted)' }}
              >
                {t.icon}
                <span className="text-xs font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
