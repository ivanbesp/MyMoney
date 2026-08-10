import { Account, Category, Currency } from './types';

/** Счёт, на который переезжают все записи, заведённые до появления счетов */
export const DEFAULT_ACCOUNT_ID = 'acc-main';

export function makeDefaultAccount(currency: Currency): Account {
  return {
    id: DEFAULT_ACCOUNT_ID,
    name: 'Основной',
    kind: 'card',
    currency,
    openingBalance: 0,
    color: '#7EB8D4',
    createdAt: new Date().toISOString(),
  };
}

/** Пополнение копилки — расход по этой категории */
export const SAVINGS_OUT_CATEGORY_ID = 'cat-savings-out';
/** Снятие из копилки — доход по этой категории */
export const SAVINGS_IN_CATEGORY_ID = 'cat-savings-in';

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'cat-food',
    name: 'Еда',
    type: 'expense',
    color: '#E8A87C',
    icon: '🍽️',
    subcategories: [
      { id: 'sub-groceries', name: 'Продукты', categoryId: 'cat-food' },
      { id: 'sub-restaurant', name: 'Рестораны', categoryId: 'cat-food' },
      { id: 'sub-cafe', name: 'Кафе и кофе', categoryId: 'cat-food' },
      { id: 'sub-delivery', name: 'Доставка', categoryId: 'cat-food' },
    ],
  },
  {
    id: 'cat-transport',
    name: 'Транспорт',
    type: 'expense',
    color: '#7EB8D4',
    icon: '🚇',
    subcategories: [
      { id: 'sub-metro', name: 'Метро и автобус', categoryId: 'cat-transport' },
      { id: 'sub-taxi', name: 'Такси', categoryId: 'cat-transport' },
      { id: 'sub-car', name: 'Авто', categoryId: 'cat-transport' },
    ],
  },
  {
    id: 'cat-home',
    name: 'Дом',
    type: 'expense',
    color: '#A8C5A0',
    icon: '🏠',
    subcategories: [
      { id: 'sub-rent', name: 'Аренда', categoryId: 'cat-home' },
      { id: 'sub-utilities', name: 'Коммуналка', categoryId: 'cat-home' },
      { id: 'sub-internet', name: 'Интернет и связь', categoryId: 'cat-home' },
      { id: 'sub-repairs', name: 'Ремонт', categoryId: 'cat-home' },
    ],
  },
  {
    id: 'cat-health',
    name: 'Здоровье',
    type: 'expense',
    color: '#C9A8C5',
    icon: '💊',
    subcategories: [
      { id: 'sub-pharmacy', name: 'Аптека', categoryId: 'cat-health' },
      { id: 'sub-doctor', name: 'Врачи', categoryId: 'cat-health' },
      { id: 'sub-sport', name: 'Спорт', categoryId: 'cat-health' },
    ],
  },
  {
    id: 'cat-entertainment',
    name: 'Развлечения',
    type: 'expense',
    color: '#F0C27F',
    icon: '🎬',
    subcategories: [
      { id: 'sub-cinema', name: 'Кино и театр', categoryId: 'cat-entertainment' },
      { id: 'sub-subscriptions', name: 'Подписки', categoryId: 'cat-entertainment' },
      { id: 'sub-games', name: 'Игры', categoryId: 'cat-entertainment' },
      { id: 'sub-travel', name: 'Путешествия', categoryId: 'cat-entertainment' },
    ],
  },
  {
    id: 'cat-shopping',
    name: 'Покупки',
    type: 'expense',
    color: '#D4A8A8',
    icon: '🛍️',
    subcategories: [
      { id: 'sub-clothes', name: 'Одежда', categoryId: 'cat-shopping' },
      { id: 'sub-electronics', name: 'Электроника', categoryId: 'cat-shopping' },
      { id: 'sub-gifts', name: 'Подарки', categoryId: 'cat-shopping' },
    ],
  },
  {
    id: 'cat-other-expense',
    name: 'Другое',
    type: 'expense',
    color: '#B8B8B8',
    icon: '📦',
    subcategories: [
      { id: 'sub-other-exp', name: 'Прочее', categoryId: 'cat-other-expense' },
    ],
  },
  // Income categories
  {
    id: 'cat-salary',
    name: 'Зарплата',
    type: 'income',
    color: '#6B8F71',
    icon: '💼',
    subcategories: [
      { id: 'sub-main-salary', name: 'Основная', categoryId: 'cat-salary' },
      { id: 'sub-bonus', name: 'Бонус', categoryId: 'cat-salary' },
      { id: 'sub-freelance', name: 'Фриланс', categoryId: 'cat-salary' },
    ],
  },
  {
    id: 'cat-investment',
    name: 'Инвестиции',
    type: 'income',
    color: '#8DB4C7',
    icon: '📈',
    subcategories: [
      { id: 'sub-dividends', name: 'Дивиденды', categoryId: 'cat-investment' },
      { id: 'sub-interest', name: 'Проценты', categoryId: 'cat-investment' },
    ],
  },
  {
    id: 'cat-other-income',
    name: 'Другое',
    type: 'income',
    color: '#C5B5A8',
    icon: '💰',
    subcategories: [
      { id: 'sub-gift-money', name: 'Подарок', categoryId: 'cat-other-income' },
      { id: 'sub-sale', name: 'Продажа', categoryId: 'cat-other-income' },
      { id: 'sub-other-inc', name: 'Прочее', categoryId: 'cat-other-income' },
    ],
  },
  // Системные категории: через них движение денег в копилки попадает в баланс
  {
    id: SAVINGS_OUT_CATEGORY_ID,
    name: 'В копилку',
    type: 'expense',
    color: '#A8C5A0',
    icon: '🐷',
    subcategories: [],
  },
  {
    id: SAVINGS_IN_CATEGORY_ID,
    name: 'Из копилки',
    type: 'income',
    color: '#A8C5A0',
    icon: '🐷',
    subcategories: [],
  },
];

export const CATEGORY_COLORS = [
  '#E8A87C', '#7EB8D4', '#A8C5A0', '#C9A8C5', '#F0C27F',
  '#D4A8A8', '#B8B8B8', '#6B8F71', '#8DB4C7', '#C5B5A8',
  '#E8C4A0', '#A0C4E8', '#C4E8A0', '#E8A0C4', '#A0E8C4',
];

export const CATEGORY_ICONS = [
  '🍽️', '🚇', '🏠', '💊', '🎬', '🛍️', '📦', '💼', '📈', '💰',
  '✈️', '🎓', '🐾', '🌱', '🎸', '💻', '🎁', '⚽', '📚', '🎨',
];

export const PIGGY_EMOJIS = [
  '🐷', '🏖️', '🚗', '✈️', '🏠', '💍', '🎓', '💻', '📱', '🎸',
  '⌚', '📚', '🌍', '🎯', '💎', '🌟', '🎪', '🏋️', '🎭', '🌸',
];
