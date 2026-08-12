/**
 * Локаль форматирования чисел живёт здесь, а не в i18n.tsx, чтобы storage.ts
 * мог её читать без импорта React-модуля (иначе получается цикл зависимостей).
 *
 * Значение выставляет I18nProvider при отрисовке. Модульная переменная тут
 * оправдана: это чисто отображение, и протаскивать локаль параметром через
 * несколько десятков вызовов formatMoney — больше шума, чем пользы.
 */
let numberLocale = 'ru-RU';

export function setNumberLocale(locale: string) {
  numberLocale = locale;
}

export function getNumberLocale(): string {
  return numberLocale;
}
