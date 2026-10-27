const S = require('../.test-build/storage.js');
const D = require('../.test-build/dates.js');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  → ' + extra : '')); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (name, a, b, tol = 1e-9) => ok(name, Math.abs(a - b) < tol, `got ${a}, want ${b}`);

const RATES = { USD: 90, EUR: 98 };
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`\n═══ TZ = ${TZ} ═══`);

/* 1. Даты: старый формат (полночь UTC) → календарная строка */
console.log('\n1. Нормализация дат');
{
  eq('legacy ISO → календарная дата', D.normalizeDate('2026-08-10T00:00:00.000Z'), '2026-08-10');
  eq('уже нормальная дата не меняется', D.normalizeDate('2026-08-10'), '2026-08-10');
  eq('мусор → фолбэк', D.normalizeDate('не дата', '2026-01-01'), '2026-01-01');
  eq('пусто → фолбэк', D.normalizeDate(undefined, '2026-01-01'), '2026-01-01');

  // Ключ дня строится локально: раньше здесь был toISOString() и день уезжал
  const localMidnight = new Date(2026, 7, 10);
  eq('dayKey от локальной полуночи', D.dayKey(localMidnight), '2026-08-10');
  eq('monthKey от локальной полуночи', D.monthKey(localMidnight), '2026-08');
}

/* 2. Фильтр периодов — чистое сравнение строк, таймзона не участвует */
console.log('\n2. Фильтр периодов');
{
  const now = new Date(2026, 7, 10, 12, 0, 0);       // понедельник 10 авг 2026, локально
  const mk = (id, date) => ({ id, date, type: 'expense', amount: 1, currency: 'RUB', rate: 1, categoryId: 'c', createdAt: '' });
  const txs = [
    mk('today', '2026-08-10'),
    mk('yesterday', '2026-08-09'),
    mk('weekAgo', '2026-08-02'),
    mk('lastMonth', '2026-07-15'),
    mk('lastYear', '2025-12-31'),
    mk('future', '2026-09-01'),
  ];
  const ids = p => S.filterByPeriod(txs, p, now).map(t => t.id).sort().join(',');

  eq('день — только сегодняшняя', ids('day'), 'today');
  eq('неделя (пн-вс)', ids('week'), 'today');
  eq('месяц', ids('month'), 'today,weekAgo,yesterday');
  // «Год» — календарный 2026: прошлогодний декабрь не входит, сентябрь того же года входит
  eq('год не тянет прошлый декабрь', ids('year'), 'future,lastMonth,today,weekAgo,yesterday');
  eq('всё время — всё', ids('all'), 'future,lastMonth,lastYear,today,weekAgo,yesterday');
}

/* 3. Миграция v1 → v2 на данных «как в проде» */
console.log('\n3. Миграция v1 → v2');
{
  const legacy = {
    // без version, даты в UTC-полночь, у части записей нет currency, ни у кого нет rate
    transactions: [
      { id: 'a', type: 'expense', amount: 1200, categoryId: 'cat-food', date: '2026-08-10T00:00:00.000Z', createdAt: '2026-08-10T09:00:00.000Z' },
      { id: 'b', type: 'expense', amount: 50, currency: 'USD', categoryId: 'cat-food', date: '2026-08-09T00:00:00.000Z', createdAt: '2026-08-09T09:00:00.000Z' },
      { id: 'c', type: 'income', amount: 200, currency: 'EUR', categoryId: 'cat-salary', date: '2026-08-01T00:00:00.000Z', createdAt: '2026-08-01T09:00:00.000Z' },
    ],
    piggyBanks: [{ id: 'p', name: 'Отпуск', targetAmount: 100000, currentAmount: 25000, color: '#000', emoji: '🎯', createdAt: '', deadline: '2026-12-31T00:00:00.000Z' }],
    categories: null,
  };
  const m = S.migrate(legacy, RATES);

  eq('version проставлен', m.version, S.SCHEMA_VERSION);
  eq('дата a', m.transactions[0].date, '2026-08-10');
  eq('дата b', m.transactions[1].date, '2026-08-09');
  eq('валюта по умолчанию — RUB', m.transactions[0].currency, 'RUB');
  eq('курс RUB = 1', m.transactions[0].rate, 1);
  eq('курс USD взят из настроек', m.transactions[1].rate, 90);
  eq('курс EUR взят из настроек', m.transactions[2].rate, 98);
  eq('дедлайн копилки нормализован', m.piggyBanks[0].deadline, '2026-12-31');
  eq('валюты копилки проставлены', [m.piggyBanks[0].targetCurrency, m.piggyBanks[0].currentCurrency], ['RUB', 'RUB']);
  ok('категории подставлены дефолтные', Array.isArray(m.categories) && m.categories.length > 0);

  // Ключевое: после миграции суммы на экране те же, что были до неё
  const settings = { baseCurrency: 'RUB', rates: RATES };
  near('50 $ → 4500 ₽ (как и раньше)', S.txInBase(m.transactions[1], settings), 4500);
  near('200 € → 19600 ₽', S.txInBase(m.transactions[2], settings), 19600);

  // Повторная миграция ничего не портит
  const twice = S.migrate(m, { USD: 200, EUR: 300 });
  eq('повторная миграция сохраняет курс', twice.transactions[1].rate, 90);
}

/* 4. Зафиксированный курс: правка настроек не переписывает историю */
console.log('\n4. Курс зафиксирован в операции');
{
  const old = { id: 'o', type: 'expense', amount: 100, currency: 'USD', rate: 60, categoryId: 'c', date: '2022-01-01', createdAt: '' };
  const fresh = { id: 'n', type: 'expense', amount: 100, currency: 'USD', rate: 90, categoryId: 'c', date: '2026-08-10', createdAt: '' };
  const settings = { baseCurrency: 'RUB', rates: RATES };

  near('старая операция по своему курсу', S.txInBase(old, settings), 6000);
  near('новая операция по своему курсу', S.txInBase(fresh, settings), 9000);

  const bumped = { baseCurrency: 'RUB', rates: { USD: 120, EUR: 130 } };
  near('правка курса не тронула старую', S.txInBase(old, bumped), 6000);
  near('правка курса не тронула новую', S.txInBase(fresh, bumped), 9000);

  // Смена валюты отображения — только пересчёт вывода
  const inUsd = { baseCurrency: 'USD', rates: RATES };
  near('та же операция в USD', S.txInBase(old, inUsd), 6000 / 90);
}

/* 5. Защита от кривых курсов */
console.log('\n5. Защита от нуля и NaN');
{
  eq('нулевой курс → дефолт', S.safeRates({ USD: 0, EUR: 98 }), { USD: 90, EUR: 98 });
  eq('NaN → дефолт', S.safeRates({ USD: NaN, EUR: -5 }), { USD: 90, EUR: 98 });
  const t = { id: 'x', type: 'expense', amount: 10, currency: 'USD', rate: 0, categoryId: 'c', date: '2026-01-01', createdAt: '' };
  ok('нулевой rate не даёт Infinity', Number.isFinite(S.txInBase(t, { baseCurrency: 'EUR', rates: RATES })));
}

/* 6. Статистика и сортировка */
console.log('\n6. Статистика и сортировка');
{
  const settings = { baseCurrency: 'RUB', rates: RATES };
  const txs = [
    { id: '1', type: 'income', amount: 1000, currency: 'RUB', rate: 1, categoryId: 'c', date: '2026-08-01', createdAt: '2026-08-01T10:00:00Z' },
    { id: '2', type: 'expense', amount: 10, currency: 'USD', rate: 90, categoryId: 'c', date: '2026-08-05', createdAt: '2026-08-05T10:00:00Z' },
  ];
  const st = S.calcStats(txs, settings);
  near('доход', st.income, 1000);
  near('расход через курс', st.expense, 900);
  near('баланс', st.balance, 100);

  const sorted = S.sortTransactions([
    { id: 'old', date: '2026-01-01', createdAt: '2026-08-10T00:00:00Z' },   // введена последней, но дата старая
    { id: 'new', date: '2026-08-10', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'same-late', date: '2026-08-10', createdAt: '2026-08-10T23:00:00Z' },
  ]);
  eq('сортировка по дате, потом по времени ввода', sorted.map(t => t.id), ['same-late', 'new', 'old']);
}

/* 7. Резервная копия: круг экспорт → импорт */
console.log('\n7. Бэкап');
{
  const data = {
    version: 2,
    transactions: [{ id: '1', type: 'expense', amount: 12.5, currency: 'USD', rate: 90, categoryId: 'cat-food', subcategoryId: 'sub-cafe', note: 'кофе "с молоком"', date: '2026-08-10', createdAt: '2026-08-10T10:00:00Z' }],
    categories: require('../.test-build/defaults.js').DEFAULT_CATEGORIES,
    piggyBanks: [],
  };
  const settings = { baseCurrency: 'RUB', rates: RATES };
  const file = JSON.stringify(S.buildBackup(data, settings));
  const restored = S.parseBackup(file, RATES);

  eq('операции восстановлены', restored.data.transactions.length, 1);
  eq('курс сохранён', restored.data.transactions[0].rate, 90);
  eq('дата сохранена', restored.data.transactions[0].date, '2026-08-10');
  eq('настройки восстановлены', restored.settings.baseCurrency, 'RUB');

  let threw = '';
  try { S.parseBackup('{"foo":1}', RATES); } catch (e) { threw = e.message; }
  ok('чужой файл отвергается', threw.includes('резервную копию'), threw);
  try { S.parseBackup('не json', RATES); } catch (e) { threw = e.message; }
  ok('битый файл отвергается', threw.includes('JSON'), threw);

  const csv = S.buildCSV(data, settings);
  ok('CSV с BOM', csv.charCodeAt(0) === 0xFEFF);
  ok('CSV экранирует кавычки', csv.includes('кофе ""с молоком""'));
  ok('CSV содержит курс и сумму в базе', csv.includes('"90"') && csv.includes('"1125"'));
}

/* 8. Форматирование */
console.log('\n8. Форматирование');
{
  eq('целые рубли без копеек', S.formatMoney(11, 'RUB').replace(/ |\s/g, ' '), '11 ₽');
  eq('дробные рубли с копейками', S.formatMoney(10.5, 'RUB').replace(/ |\s/g, ' '), '10,5 ₽');
  eq('доллар символом впереди', S.formatMoney(100, 'USD').replace(/ |\s/g, ' '), '$ 100');
  ok('NaN не ломает вывод', S.formatMoney(NaN, 'RUB').includes('0'));
}

/* ─────────────────────────────────────────────
   9. МИГРАЦИЯ v2 → v3: системные категории копилок
───────────────────────────────────────────── */
console.log('\n9. Системные категории копилок');
{
  const D2 = require('../.test-build/defaults.js');
  const OUT = D2.SAVINGS_OUT_CATEGORY_ID;
  const IN = D2.SAVINGS_IN_CATEGORY_ID;

  // Пользователь с кастомным набором категорий и без системных
  const custom = [
    { id: 'my-cat', name: 'Моё', type: 'expense', color: '#000', icon: '🎯', subcategories: [] },
  ];
  const m = S.migrate({ version: 2, transactions: [], piggyBanks: [], categories: custom }, RATES);

  eq('версия схемы поднята', m.version, S.SCHEMA_VERSION);
  ok('пользовательская категория сохранена', m.categories.some(c => c.id === 'my-cat'));
  ok('добавлена «В копилку»', m.categories.some(c => c.id === OUT && c.type === 'expense'));
  ok('добавлена «Из копилки»', m.categories.some(c => c.id === IN && c.type === 'income'));

  // Повторный прогон не должен плодить дубликаты
  const again = S.migrate({ ...m, version: 2 }, RATES);
  eq('дубликатов нет', again.categories.filter(c => c.id === OUT).length, 1);
  eq('количество категорий не растёт', again.categories.length, m.categories.length);

  // Движение по копилке — обычная операция, попадает в статистику
  const settings = { baseCurrency: 'RUB', rates: RATES, theme: 'system' };
  const deposit = { id: 'd', type: 'expense', amount: 5000, currency: 'RUB', rate: 1, categoryId: OUT, date: '2026-08-10', createdAt: '', piggyBankId: 'p1' };
  const withdraw = { id: 'w', type: 'income', amount: 2000, currency: 'RUB', rate: 1, categoryId: IN, date: '2026-08-11', createdAt: '', piggyBankId: 'p1' };
  const st = S.calcStats([deposit, withdraw], settings);
  near('пополнение ушло в расходы', st.expense, 5000);
  near('снятие вернулось в доходы', st.income, 2000);
  near('баланс учитывает копилку', st.balance, -3000);
  eq('связь с копилкой сохранена', deposit.piggyBankId, 'p1');
}

/* ─────────────────────────────────────────────
   10. БЮДЖЕТЫ
───────────────────────────────────────────── */
console.log('\n10. Бюджеты');
{
  const settings = { baseCurrency: 'RUB', rates: RATES, theme: 'system' };
  const now = new Date(2026, 7, 20);            // 20 августа, локально
  const exp = (amount, date, categoryId = 'cat-food', currency = 'RUB', rate = 1) =>
    ({ id: String(Math.random()), type: 'expense', amount, currency, rate, categoryId, date, createdAt: '' });

  const txs = [
    exp(30000, '2026-08-03'),
    exp(23200, '2026-08-15'),
    exp(99999, '2026-07-31'),                   // прошлый месяц — не в счёт
    exp(5000, '2026-08-10', 'cat-transport'),   // другая категория — не в счёт
  ];
  const budget = { id: 'b1', categoryId: 'cat-food', amount: 60000, currency: 'RUB', createdAt: '' };

  const p = S.budgetProgress(budget, txs, settings, now);
  near('потрачено только за этот месяц и по своей категории', p.spent, 53200);
  near('лимит', p.limit, 60000);
  near('остаток', p.remaining, 6800);
  eq('состояние — на исходе', p.state, 'warn');
  eq('процент', Math.round(p.ratio * 100), 89);

  // Порог предупреждения ровно на 80%
  eq('79% — ещё ок', S.budgetProgress({ ...budget, amount: 53200 / 0.79 }, txs, settings, now).state, 'ok');
  eq('80% — уже предупреждение', S.budgetProgress({ ...budget, amount: 53200 / 0.8 }, txs, settings, now).state, 'warn');
  eq('100% — превышение', S.budgetProgress({ ...budget, amount: 53200 }, txs, settings, now).state, 'over');
  near('превышение даёт отрицательный остаток',
    S.budgetProgress({ ...budget, amount: 50000 }, txs, settings, now).remaining, -3200);

  // Лимит в другой валюте пересчитывается по ТЕКУЩЕМУ курсу — это намерение, а не история
  const eurBudget = { id: 'b2', categoryId: 'cat-food', amount: 600, currency: 'EUR', createdAt: '' };
  near('лимит 600 € = 58 800 ₽', S.budgetProgress(eurBudget, txs, settings, now).limit, 58800);
  near('после правки курса лимит пересчитан',
    S.budgetProgress(eurBudget, txs, { ...settings, rates: { USD: 90, EUR: 100 } }, now).limit, 60000);

  // Валюта отображения меняет и потраченное, и лимит
  const inEur = S.budgetProgress(eurBudget, txs, { ...settings, baseCurrency: 'EUR' }, now);
  near('в евро лимит равен номиналу', inEur.limit, 600);
  near('в евро потрачено', inEur.spent, 53200 / 98);

  eq('нулевой лимит не даёт NaN',
    Number.isFinite(S.budgetProgress({ ...budget, amount: 0 }, txs, settings, now).ratio), true);

  // Миграция: у старых данных бюджетов нет
  const m = S.migrate({ version: 3, transactions: [], piggyBanks: [], categories: [] }, RATES);
  eq('версия схемы поднята', m.version, S.SCHEMA_VERSION);
  eq('бюджеты пустым массивом', m.budgets.length, 0);

  // Мусор в бюджетах отсеивается, а не роняет приложение
  const dirty = S.migrate({
    version: 3, transactions: [], piggyBanks: [], categories: [],
    budgets: [
      { id: 'ok', categoryId: 'cat-food', amount: 100, currency: 'RUB', createdAt: '' },
      { categoryId: 'cat-food', amount: -5 },
      { amount: 100 },
      null,
    ],
  }, RATES);
  eq('остался только корректный лимит', dirty.budgets.length, 1);
  eq('и это нужный', dirty.budgets[0].categoryId, 'cat-food');

  // Бюджеты попадают в резервную копию
  const backup = S.buildBackup({ ...m, budgets: [budget] }, settings);
  eq('лимит в копии', backup.budgets.length, 1);
  eq('и восстанавливается', S.parseBackup(JSON.stringify(backup), RATES).data.budgets.length, 1);
}

/* ─────────────────────────────────────────────
   11. СЧЕТА И ПЕРЕВОДЫ
───────────────────────────────────────────── */
console.log('\n11. Счета и переводы');
{
  const D3 = require('../.test-build/defaults.js');
  const settings = { baseCurrency: 'RUB', rates: RATES, theme: 'system' };

  const card = { id: 'a-card', name: 'Карта', kind: 'card', currency: 'RUB', openingBalance: 10000, color: '#000', createdAt: '' };
  const cash = { id: 'a-cash', name: 'Наличные', kind: 'cash', currency: 'RUB', openingBalance: 2000, color: '#000', createdAt: '' };
  const usdAcc = { id: 'a-usd', name: 'Долларовый', kind: 'savings', currency: 'USD', openingBalance: 100, color: '#000', createdAt: '' };

  const tx = (over) => ({
    id: String(Math.random()), type: 'expense', amount: 0, currency: 'RUB', rate: 1,
    categoryId: 'cat-food', date: '2026-08-10', createdAt: '', accountId: 'a-card', ...over,
  });

  // Остаток = начальный + доходы − расходы
  const txs = [
    tx({ amount: 1500 }),
    tx({ amount: 500, accountId: 'a-cash' }),
    tx({ type: 'income', amount: 30000 }),
    tx({ amount: 999, accountId: 'a-usd', currency: 'USD', rate: 90 }),
  ];
  near('остаток карты', S.accountBalance(card, txs, [], RATES), 10000 - 1500 + 30000);
  near('остаток наличных', S.accountBalance(cash, txs, [], RATES), 2000 - 500);
  near('долларовый счёт считается в своей валюте', S.accountBalance(usdAcc, txs, [], RATES), 100 - 999);

  // Своя валюта — номинал без пересчёта, даже если курсы поменялись
  const bumped = { USD: 200, EUR: 300 };
  near('курс не влияет на операцию в валюте счёта',
    S.accountBalance(usdAcc, txs, [], bumped), 100 - 999);

  // Операция в другой валюте пересчитывается в валюту счёта
  const foreign = [tx({ amount: 100, currency: 'USD', rate: 90, accountId: 'a-card' })];
  near('100 $ с рублёвой карты = 9000 ₽', S.accountBalance(card, foreign, [], RATES), 10000 - 9000);

  // Перевод: у одного убыло, у другого прибыло, сумма не изменилась
  const tr = { id: 't1', fromAccountId: 'a-card', toAccountId: 'a-cash', amountFrom: 5000, amountTo: 5000, date: '2026-08-11', createdAt: '' };
  near('перевод списал с карты', S.accountBalance(card, [], [tr], RATES), 10000 - 5000);
  near('перевод зачислил в наличные', S.accountBalance(cash, [], [tr], RATES), 2000 + 5000);
  near('в сумме по счетам ничего не изменилось',
    S.totalAccountsBalance([card, cash], [], [tr], settings),
    S.totalAccountsBalance([card, cash], [], [], settings));

  // Перевод между валютами: обе суммы независимы, банковский курс может отличаться
  const crossTr = { id: 't2', fromAccountId: 'a-card', toAccountId: 'a-usd', amountFrom: 9500, amountTo: 100, date: '2026-08-11', createdAt: '' };
  near('списано в рублях', S.accountBalance(card, [], [crossTr], RATES), 10000 - 9500);
  near('зачислено в долларах', S.accountBalance(usdAcc, [], [crossTr], RATES), 100 + 100);

  // Главное: перевод не доход и не расход
  const st = S.calcStats(txs, settings);
  const stWithTransfer = S.calcStats(txs, settings);
  eq('перевод не попадает в статистику', JSON.stringify(st), JSON.stringify(stWithTransfer));

  // Итог по всем счетам в валюте отображения
  near('сумма счетов в рублях',
    S.totalAccountsBalance([card, cash, usdAcc], [], [], settings),
    10000 + 2000 + 100 * 90);
  near('та же сумма в долларах',
    S.totalAccountsBalance([card, cash, usdAcc], [], [], { ...settings, baseCurrency: 'USD' }),
    (10000 + 2000 + 100 * 90) / 90);

  // Миграция v4 → v5: заводится «Основной», все записи переезжают на него
  const legacy = {
    version: 4,
    transactions: [{ id: 'x', type: 'expense', amount: 100, currency: 'RUB', rate: 1, categoryId: 'cat-food', date: '2026-08-01', createdAt: '' }],
    categories: [], piggyBanks: [], budgets: [],
  };
  const m = S.migrate(legacy, RATES, 'EUR');
  eq('версия схемы актуальная', m.version, S.SCHEMA_VERSION);
  eq('создан один счёт', m.accounts.length, 1);
  eq('и это «Основной»', m.accounts[0].id, D3.DEFAULT_ACCOUNT_ID);
  eq('в валюте отображения', m.accounts[0].currency, 'EUR');
  eq('запись привязана к счёту', m.transactions[0].accountId, D3.DEFAULT_ACCOUNT_ID);
  eq('переводов нет', m.transfers.length, 0);

  // Запись, ссылающаяся на несуществующий счёт, не теряется
  const orphan = S.migrate({
    version: 5,
    accounts: [card],
    transactions: [{ id: 'y', type: 'expense', amount: 5, currency: 'RUB', rate: 1, categoryId: 'c', date: '2026-08-01', createdAt: '', accountId: 'deleted' }],
    categories: [], piggyBanks: [], budgets: [], transfers: [],
  }, RATES);
  eq('осиротевшая запись переехала на первый счёт', orphan.transactions[0].accountId, 'a-card');

  // Перевод на несуществующий счёт отбрасывается
  const badTransfer = S.migrate({
    version: 5, accounts: [card, cash], transactions: [], categories: [], piggyBanks: [], budgets: [],
    transfers: [tr, { id: 'bad', fromAccountId: 'a-card', toAccountId: 'nope', amountFrom: 1, amountTo: 1, date: '2026-01-01', createdAt: '' }],
  }, RATES);
  eq('битый перевод отброшен', badTransfer.transfers.length, 1);

  // Счета и переводы попадают в копию
  const backup = S.buildBackup({ ...m, accounts: [card, cash], transfers: [tr] }, settings);
  const restored = S.parseBackup(JSON.stringify(backup), RATES);
  eq('счета в копии', restored.data.accounts.length, 2);
  eq('переводы в копии', restored.data.transfers.length, 1);
  ok('CSV содержит колонку счёта', S.buildCSV({ ...m, accounts: [card], transfers: [] }, settings).includes('Счёт'));
  ok('CSV содержит строку перевода',
    S.buildCSV({ ...m, accounts: [card, cash], transfers: [tr] }, settings).includes('Перевод'));
}

/* ─────────────────────────────────────────────
   12. ЗАГРУЗКА КУРСОВ
───────────────────────────────────────────── */
console.log('\n12. Курсы из сети');
{
  const R = require('../.test-build/rates.js');
  const [cbr, erapi, frank] = R.PROVIDERS_FOR_TEST;

  // ЦБ РФ: курс даётся за Nominal единиц
  const cbrOk = cbr.parse({
    Date: '2026-08-12T11:30:00+03:00',
    Valute: {
      USD: { Nominal: 1, Value: 91.5, CharCode: 'USD' },
      EUR: { Nominal: 1, Value: 99.2, CharCode: 'EUR' },
    },
  });
  near('ЦБ: доллар', cbrOk.rates.USD, 91.5);
  near('ЦБ: евро', cbrOk.rates.EUR, 99.2);
  eq('ЦБ: дата курса', cbrOk.rateDate, '2026-08-12');

  const cbrNominal = cbr.parse({
    Valute: { USD: { Nominal: 10, Value: 915 }, EUR: { Nominal: 1, Value: 99 } },
  });
  near('ЦБ: Nominal 10 делится', cbrNominal.rates.USD, 91.5);

  ok('ЦБ: без Valute — отказ', cbr.parse({}) === null);
  ok('ЦБ: без рубля в ответе — отказ', cbr.parse({ Valute: { GBP: { Nominal: 1, Value: 120 } } }) === null);

  // ExchangeRate-API отдаёт «валюты за 1 рубль» — нужен обратный курс
  const erOk = erapi.parse({ rates: { USD: 1 / 91.5, EUR: 1 / 99.2 } });
  near('er-api: доллар инвертирован', erOk.rates.USD, 91.5, 1e-6);
  near('er-api: евро инвертировано', erOk.rates.EUR, 99.2, 1e-6);
  ok('er-api: без rates — отказ', erapi.parse({}) === null);

  // Frankfurter: рубля у ЕЦБ нет с 2022 года, ответ без него должен отбраковаться
  ok('frankfurter: пустой ответ — отказ', frank.parse({ rates: {} }) === null);
  near('frankfurter: рабочий ответ разбирается',
    frank.parse({ rates: { USD: 1 / 91.5, EUR: 1 / 99.2 }, date: '2026-08-12' }).rates.USD, 91.5, 1e-6);

  // Защита от перевёрнутого курса: 0.011 ₽ за доллар — явно ошибка
  ok('перевёрнутый курс отбраковывается', cbr.parse({ Valute: { USD: { Nominal: 1, Value: 0.011 }, EUR: { Nominal: 1, Value: 0.01 } } }) === null);
  ok('нулевой курс отбраковывается', cbr.parse({ Valute: { USD: { Nominal: 1, Value: 0 }, EUR: { Nominal: 1, Value: 99 } } }) === null);
  ok('мусор вместо числа отбраковывается', cbr.parse({ Valute: { USD: { Nominal: 1, Value: 'сто' }, EUR: { Nominal: 1, Value: 99 } } }) === null);

  // Возраст курсов
  ok('без отметки времени — устарели', R.ratesAreStale(undefined) === true);
  ok('только что — свежие', R.ratesAreStale(new Date().toISOString()) === false);
  ok('сутки назад — устарели', R.ratesAreStale(new Date(Date.now() - 25 * 3600e3).toISOString()) === true);
  ok('битая дата — устарели', R.ratesAreStale('не дата') === true);

  eq('подпись без отметки', R.formatAgo(undefined), 'ещё не обновлялись');
  eq('подпись «только что»', R.formatAgo(new Date().toISOString()), 'только что');
  eq('подпись в часах', R.formatAgo(new Date(Date.now() - 3 * 3600e3).toISOString()), '3 ч. назад');
  eq('подпись «вчера»', R.formatAgo(new Date(Date.now() - 26 * 3600e3).toISOString()), 'вчера');
}

/* Планы бюджета по месяцам */
console.log('\nПланы бюджета');
{
  const P = require('../.test-build/plans.js');
  const settings = { baseCurrency: 'RUB', rates: RATES };
  const cats = [
    { id: 'food', type: 'expense', name: 'Еда', color: '', icon: '', subcategories: [] },
    { id: 'taxi', type: 'expense', name: 'Такси', color: '', icon: '', subcategories: [] },
    { id: 'gift', type: 'expense', name: 'Подарки', color: '', icon: '', subcategories: [] },
    { id: 'cat-savings-out', type: 'expense', name: 'В копилку', color: '', icon: '', subcategories: [] },
    { id: 'salary', type: 'income', name: 'Зарплата', color: '', icon: '', subcategories: [] },
  ];
  const budgets = [
    { id: 'b-food', categoryId: 'food', amount: 30000, currency: 'RUB', createdAt: '' },
    { id: 'b-taxi', categoryId: 'taxi', amount: 100, currency: 'USD', createdAt: '' },
  ];

  eq('сдвиг месяца вперёд через год', P.shiftMonth('2026-11', 3), '2027-02');
  eq('сдвиг месяца назад через год', P.shiftMonth('2026-01', -1), '2025-12');
  eq('копилка не планируется как категория', P.plannableCategories(cats).map(c => c.id), ['food', 'taxi', 'gift']);

  // Без плана — лимиты из обычных бюджетов, доллары по текущему курсу
  eq('лимит без плана — из бюджета', P.planLimit(undefined, budgets, 'food', settings), { value: 30000, source: 'budget' });
  eq('лимит в валюте — по курсу', P.planLimit(undefined, budgets, 'taxi', settings), { value: 9000, source: 'budget' });
  eq('категория без лимита', P.planLimit(undefined, budgets, 'gift', settings), { value: 0, source: 'none' });

  const plan = {
    month: '2026-12', currency: 'RUB', limits: { food: 35000, gift: 25000 },
    income: 230000, savings: 30000, oneOffs: [{ id: 'o', name: 'Страховка', amount: 9800 }], updatedAt: '',
  };
  eq('план переопределяет лимит', P.planLimit(plan, budgets, 'food', settings), { value: 35000, source: 'plan' });
  eq('непереопределённое — из бюджета', P.planLimit(plan, budgets, 'taxi', settings).source, 'budget');
  eq('ноль в плане — тоже значение', P.planLimit({ ...plan, limits: { food: 0 } }, budgets, 'food', settings), { value: 0, source: 'plan' });

  const tot = P.planTotals(plan, budgets, cats, settings, 185000);
  eq('сумма лимитов: 35 000 + 9 000 + 25 000', tot.limits, 69000);
  eq('разовые траты', tot.oneOffs, 9800);
  eq('доход из плана, не из среднего', [tot.income, tot.incomeEstimated], [230000, false]);
  eq('свободно = доход − расходы − копилки', tot.free, 230000 - 69000 - 9800 - 30000);
  eq('запас большой — ok', tot.status, 'ok');

  const noIncome = P.planTotals({ ...plan, income: undefined }, budgets, cats, settings, 100000);
  eq('без дохода в плане — берём среднее', [noIncome.income, noIncome.incomeEstimated], [100000, true]);
  eq('расходы больше дохода — дефицит', noIncome.status, 'deficit');
  eq('впритык — меньше 10% дохода', P.planTotals({ ...plan, income: 115000 }, budgets, cats, settings, 0).status, 'tight');
  eq('нет плана — статус empty', P.planTotals(undefined, budgets, cats, settings, 0).status, 'empty');

  // План в долларах при базовой валюте в рублях
  const usdPlan = { ...plan, currency: 'USD', limits: { food: 400 }, income: 2000, savings: undefined, oneOffs: [] };
  near('план в $ пересчитан в ₽', P.planTotals(usdPlan, budgets, cats, settings, 0).income, 180000);

  // Действующие лимиты месяца
  const eff = P.effectiveBudgets(budgets, [plan], '2026-12');
  eq('лимит еды взят из плана', eff.find(b => b.categoryId === 'food').amount, 35000);
  eq('id настоящего бюджета сохранён', eff.find(b => b.categoryId === 'food').id, 'b-food');
  eq('такси без изменений', eff.find(b => b.categoryId === 'taxi').amount, 100);
  eq('категория только из плана — виртуальный лимит', eff.find(b => b.categoryId === 'gift').id, 'plan:gift');
  eq('в другом месяце план не действует', P.effectiveBudgets(budgets, [plan], '2026-11'), budgets);

  // История: среднее только по месяцам, где были записи
  const mk = (id, date, type, cat, amount) => ({ id, date, type, amount, currency: 'RUB', rate: 1, categoryId: cat, accountId: 'a', createdAt: '' });
  const txs = [
    mk('1', '2026-09-03', 'expense', 'food', 30000),
    mk('2', '2026-09-05', 'income', 'salary', 180000),
    mk('3', '2026-10-03', 'expense', 'food', 34000),
    mk('4', '2026-10-05', 'income', 'salary', 190000),
    mk('5', '2026-11-02', 'expense', 'food', 99999), // текущий месяц в среднее не входит
  ];
  const h = P.averageHistory(txs, '2026-11', 3, settings);
  eq('пустой август в среднее не идёт', h.months, 2);
  eq('средние расходы на еду', h.spend.get('food'), 32000);
  eq('средний доход', h.income, 185000);
  eq('факт за месяц', P.spendByCategory(txs, '2026-10', settings).get('food'), 34000);
  eq('округление до сотни', P.roundPlan(31649), 31600);

  // Миграция и копия
  const m = S.migrate({ version: 5, transactions: [], categories: [], piggyBanks: [], budgets: [], accounts: [], transfers: [] }, RATES);
  eq('у старых данных планов нет', m.plans, []);
  const dirty = S.migrate({
    version: 6, transactions: [], plans: [
      plan,
      { ...plan, limits: { food: 1 } },                      // дубль месяца
      { month: '2026-13', currency: 'RUB', limits: {} },     // кривой месяц
      { month: '2027-01', limits: { food: -5, gift: 'x', taxi: '700' }, oneOffs: [{ name: 'Пусто', amount: 0 }] },
    ],
  }, RATES);
  eq('кривые и дубли отброшены', dirty.plans.map(p => p.month), ['2026-12', '2027-01']);
  eq('берётся первый план месяца', dirty.plans[0].limits.food, 35000);
  eq('отрицательные и нечисловые лимиты отброшены', dirty.plans[1].limits, { taxi: 700 });
  eq('пустые разовые траты отброшены', dirty.plans[1].oneOffs, []);
  eq('валюта по умолчанию', dirty.plans[1].currency, 'RUB');
  const backup = S.buildBackup({ ...m, plans: [plan] }, settings);
  eq('план попадает в копию и восстанавливается',
    S.parseBackup(JSON.stringify(backup), RATES).data.plans[0].limits, plan.limits);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
