export type TransactionType = 'income' | 'expense';

export type Currency = 'RUB' | 'USD' | 'EUR';

export const CURRENCIES: Currency[] = ['RUB', 'USD', 'EUR'];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
};

export interface CurrencyRates {
  // How many RUB per 1 unit of each currency
  USD: number; // e.g. 90 means 1 USD = 90 RUB
  EUR: number; // e.g. 98 means 1 EUR = 98 RUB
}

/** 'system' следует за настройкой ОС, остальные фиксируют тему принудительно */
export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

export interface Settings {
  baseCurrency: Currency;   // the currency everything is displayed in
  rates: CurrencyRates;     // exchange rates: RUB per 1 unit
  theme: ThemeMode;
  /** Язык интерфейса. Названия категорий и счетов — данные пользователя, не переводятся. */
  lang: 'ru' | 'en';
  /** Тянуть курсы из сети. Выключено — курсы вводятся руками, как раньше. */
  autoRates: boolean;
  /** Когда курсы были получены из сети (ISO) */
  ratesUpdatedAt?: string;
  /** Название источника, показывается рядом с курсами */
  ratesSource?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'RUB',
  rates: {
    USD: 90,
    EUR: 98,
  },
  theme: 'system',
  lang: 'ru',
  autoRates: false,
};

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
  subcategories: Subcategory[];
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;       // original currency of the transaction
  /**
   * Курс на момент создания: сколько рублей стоила 1 единица `currency`.
   * Для RUB всегда 1. Зафиксирован намеренно — правка курсов в настройках
   * не должна задним числом менять суммы уже записанных операций.
   */
  rate: number;
  categoryId: string;
  subcategoryId?: string;
  note?: string;
  /** Календарная дата в локальном времени, строго 'YYYY-MM-DD'. Без времени и без UTC. */
  date: string;
  createdAt: string;        // ISO timestamp — момент создания записи
  /** Заполнено, если запись создана пополнением или снятием из копилки */
  piggyBankId?: string;
  /** Счёт, по которому прошла операция */
  accountId: string;
}

export interface PiggyBank {
  id: string;
  name: string;
  targetAmount: number;
  targetCurrency: Currency;
  currentAmount: number;
  currentCurrency: Currency;
  color: string;
  emoji: string;
  createdAt: string;
  /** 'YYYY-MM-DD' либо undefined */
  deadline?: string;
}

export type AccountKind = 'card' | 'cash' | 'savings' | 'other';

export const ACCOUNT_KINDS: AccountKind[] = ['card', 'cash', 'savings', 'other'];
export const ACCOUNT_KIND_ICONS: Record<AccountKind, string> = {
  card: '💳',
  cash: '💵',
  savings: '🏦',
  other: '📁',
};

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  /** Валюта счёта: остаток всегда считается в ней */
  currency: Currency;
  /** Остаток на момент заведения счёта, в валюте счёта */
  openingBalance: number;
  color: string;
  createdAt: string;
}

/**
 * Перевод между счетами — отдельная сущность, а НЕ пара операций.
 * Если оформить его доходом и расходом, он раздует и то и другое
 * в статистике, хотя денег у пользователя не прибавилось и не убавилось.
 */
export interface Transfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  /** Списано с исходного счёта, в его валюте */
  amountFrom: number;
  /** Зачислено на счёт-получатель, в его валюте */
  amountTo: number;
  /** 'YYYY-MM-DD' */
  date: string;
  note?: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Лимит на календарный месяц */
  amount: number;
  /**
   * Валюта лимита. В отличие от операции курс здесь НЕ фиксируется:
   * лимит — это намерение на будущее, его логично считать по текущему курсу.
   */
  currency: Currency;
  createdAt: string;
}

/** Порог, после которого лимит подсвечивается как «на исходе» */
export const BUDGET_WARN_THRESHOLD = 0.8;

export interface AppData {
  /** Версия схемы хранилища. Отсутствует у данных, записанных до миграций. */
  version?: number;
  transactions: Transaction[];
  categories: Category[];
  piggyBanks: PiggyBank[];
  budgets: Budget[];
  accounts: Account[];
  transfers: Transfer[];
}

/** Формат файла резервной копии */
export interface BackupFile extends AppData {
  settings?: Settings;
  exportedAt?: string;
  app?: string;
}

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
