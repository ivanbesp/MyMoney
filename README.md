# 🌱 Финансовый трекер

Личный трекер финансов — минималистичный, приятный, функциональный.

## Возможности

- ✅ Доходы и расходы с категориями и подкатегориями
- ✅ Управление категориями (добавить, изменить, удалить)
- ✅ Статистика за день / неделю / месяц / год / всё время
- ✅ Диаграммы: динамика и расходы по категориям
- ✅ Копилки с прогресс-баром и дедлайнами
- ✅ **Финансовый пульс** — индикатор здоровья бюджета
- ✅ **Инсайты** — умные советы на основе ваших данных
- ✅ Все данные хранятся в localStorage (приватно, офлайн)

## Запуск локально

```bash
npm install
npm run dev
```

Открой http://localhost:3000

## Деплой на Vercel

1. Залей проект на GitHub
2. Зайди на [vercel.com](https://vercel.com) → New Project
3. Выбери репозиторий → Deploy
4. Готово! Vercel сам определит Next.js

Или через CLI:
```bash
npm i -g vercel
vercel
```

## Структура

```
app/
  page.tsx          # Главная страница (навигация, шелл)
  layout.tsx        # Root layout
  globals.css       # Стили, CSS-переменные
components/
  FinancePulse.tsx  # Индикатор здоровья бюджета
  TransactionForm.tsx
  TransactionList.tsx
  Statistics.tsx
  PiggyBanks.tsx
  Categories.tsx
  Insights.tsx
lib/
  types.ts          # TypeScript типы
  storage.ts        # localStorage хук и утилиты
  defaults.ts       # Категории по умолчанию
```
