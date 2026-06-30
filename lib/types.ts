export type TransactionType = 'income' | 'expense';

export type Currency = 'RUB' | 'USD' | 'EUR';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  RUB: '₽',
  USD: '$',
  EUR: '€',
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  RUB: 'Рубль ₽',
  USD: 'Доллар $',
  EUR: 'Евро €',
};

export interface CurrencyRates {
  // How many RUB per 1 unit of each currency
  USD: number; // e.g. 90 means 1 USD = 90 RUB
  EUR: number; // e.g. 98 means 1 EUR = 98 RUB
}

export interface Settings {
  baseCurrency: Currency;   // the currency everything is displayed in
  rates: CurrencyRates;     // manual exchange rates set by user
}

export const DEFAULT_SETTINGS: Settings = {
  baseCurrency: 'RUB',
  rates: {
    USD: 90,
    EUR: 98,
  },
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
  categoryId: string;
  subcategoryId?: string;
  note?: string;
  date: string; // ISO string
  createdAt: string;
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
  deadline?: string;
}

export interface AppData {
  transactions: Transaction[];
  categories: Category[];
  piggyBanks: PiggyBank[];
}

export type Period = 'day' | 'week' | 'month' | 'year' | 'all';
