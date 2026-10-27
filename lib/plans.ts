import { Budget, BudgetPlan, Category, Settings, Transaction } from './types';
import { convertAmount, txInBase } from './storage';
import { SAVINGS_OUT_CATEGORY_ID } from './defaults';
import { monthKey } from './dates';

/**
 * Планирование бюджета по месяцам.
 *
 * Модель простая: у каждой категории есть «обычный» лимит (Budget), а план
 * месяца может переопределить его для отдельных категорий. Всё, что не
 * переопределено, берётся из обычного лимита — так план не нужно заполнять
 * с нуля каждый месяц.
 *
 * Все суммы, которые отсюда выходят, — в валюте отображения по текущему курсу:
 * план, как и лимит, это намерение на будущее, курс в нём не фиксируется.
 */

/** Сдвиг месяца 'YYYY-MM' на delta месяцев */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

/** Категории, которые имеет смысл планировать: расходные, кроме «В копилку» */
export function plannableCategories(categories: Category[]): Category[] {
  return categories.filter(c => c.type === 'expense' && c.id !== SAVINGS_OUT_CATEGORY_ID);
}

export function findPlan(plans: BudgetPlan[], month: string): BudgetPlan | undefined {
  return plans.find(p => p.month === month);
}

export function emptyPlan(month: string, settings: Settings): BudgetPlan {
  return { month, currency: settings.baseCurrency, limits: {}, oneOffs: [], updatedAt: new Date().toISOString() };
}

/** Округление до сотни — суммы плана не должны выглядеть как «31 637,42» */
export const roundPlan = (n: number) => Math.round(n / 100) * 100;

// ─── Факт ─────────────────────────────────────────────────────────────────────

/** Расходы по категориям за месяц, в валюте отображения */
export function spendByCategory(txs: Transaction[], month: string, settings: Settings): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of txs) {
    if (t.type !== 'expense' || !t.date.startsWith(month)) continue;
    map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + txInBase(t, settings));
  }
  return map;
}

export function incomeForMonth(txs: Transaction[], month: string, settings: Settings): number {
  let sum = 0;
  for (const t of txs) {
    if (t.type === 'income' && t.date.startsWith(month)) sum += txInBase(t, settings);
  }
  return sum;
}

/**
 * Среднее за `count` полных месяцев ДО `beforeMonth` (сам он не входит).
 * Месяцы без единой записи в среднее не идут: если учёт начат два месяца
 * назад, делить на три — значит занизить картину на треть.
 */
export function averageHistory(txs: Transaction[], beforeMonth: string, count: number, settings: Settings) {
  const months: string[] = [];
  for (let i = 1; i <= count; i++) months.push(shiftMonth(beforeMonth, -i));
  const active = months.filter(m => txs.some(t => t.date.startsWith(m)));

  const spend = new Map<string, number>();
  let income = 0;
  for (const m of active) {
    spendByCategory(txs, m, settings).forEach((v, k) => spend.set(k, (spend.get(k) ?? 0) + v));
    income += incomeForMonth(txs, m, settings);
  }
  const n = active.length || 1;
  spend.forEach((v, k) => spend.set(k, v / n));
  return { spend, income: income / n, months: active.length };
}

// ─── План ─────────────────────────────────────────────────────────────────────

export interface PlanLimit {
  value: number;
  /** Откуда взялась сумма: задана в плане, унаследована от лимита или пусто */
  source: 'plan' | 'budget' | 'none';
}

export function planLimit(
  plan: BudgetPlan | undefined,
  budgets: Budget[],
  categoryId: string,
  settings: Settings,
): PlanLimit {
  if (plan && categoryId in plan.limits) {
    return { value: convertAmount(plan.limits[categoryId], plan.currency, settings.baseCurrency, settings.rates), source: 'plan' };
  }
  const b = budgets.find(x => x.categoryId === categoryId);
  if (b) return { value: convertAmount(b.amount, b.currency, settings.baseCurrency, settings.rates), source: 'budget' };
  return { value: 0, source: 'none' };
}

export type PlanStatus = 'empty' | 'ok' | 'tight' | 'deficit';

export interface PlanTotals {
  /** Сумма лимитов по категориям */
  limits: number;
  /** Сумма разовых трат */
  oneOffs: number;
  /** limits + oneOffs */
  expenses: number;
  income: number;
  /** Доход не задан в плане и взят из среднего */
  incomeEstimated: boolean;
  savings: number;
  /** Доход − расходы − копилки */
  free: number;
  status: PlanStatus;
}

/** Запас меньше этой доли дохода — месяц «впритык» */
export const PLAN_TIGHT_SHARE = 0.1;

export function planTotals(
  plan: BudgetPlan | undefined,
  budgets: Budget[],
  categories: Category[],
  settings: Settings,
  incomeFallback: number,
): PlanTotals {
  const conv = (n: number) => plan ? convertAmount(n, plan.currency, settings.baseCurrency, settings.rates) : n;
  const limits = plannableCategories(categories)
    .reduce((s, c) => s + planLimit(plan, budgets, c.id, settings).value, 0);
  const oneOffs = (plan?.oneOffs ?? []).reduce((s, o) => s + conv(o.amount), 0);
  const incomeEstimated = plan?.income === undefined;
  const income = incomeEstimated ? incomeFallback : conv(plan!.income!);
  const savings = plan?.savings !== undefined ? conv(plan.savings) : 0;
  const expenses = limits + oneOffs;
  const free = income - expenses - savings;

  const status: PlanStatus =
    !plan ? 'empty'
    : free < 0 ? 'deficit'
    : income > 0 && free < income * PLAN_TIGHT_SHARE ? 'tight'
    : 'ok';

  return { limits, oneOffs, expenses, income, incomeEstimated, savings, free, status };
}

/**
 * Лимиты, действующие в месяце: обычные бюджеты, поверх которых наложен план.
 *
 * Категория, которая есть только в плане, получает «виртуальный» бюджет с id
 * `plan:<categoryId>` — его нет в data.budgets, правится он через план.
 * Лимит 0 в плане означает «в этом месяце не трачу» и тоже показывается.
 */
export const PLAN_BUDGET_PREFIX = 'plan:';

export function effectiveBudgets(budgets: Budget[], plans: BudgetPlan[], month: string): Budget[] {
  const plan = findPlan(plans, month);
  if (!plan) return budgets;
  const result: Budget[] = budgets.map(b =>
    b.categoryId in plan.limits ? { ...b, amount: plan.limits[b.categoryId], currency: plan.currency } : b);
  for (const [categoryId, amount] of Object.entries(plan.limits)) {
    if (budgets.some(b => b.categoryId === categoryId)) continue;
    result.push({
      id: PLAN_BUDGET_PREFIX + categoryId,
      categoryId,
      amount,
      currency: plan.currency,
      createdAt: plan.updatedAt,
    });
  }
  return result;
}

/** Есть ли у категории переопределение в плане месяца */
export function hasPlanOverride(plans: BudgetPlan[], month: string, categoryId: string): boolean {
  const plan = findPlan(plans, month);
  return !!plan && categoryId in plan.limits;
}
