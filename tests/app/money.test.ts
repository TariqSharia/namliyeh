import { describe, expect, it } from 'vitest';
import { formatMoney, parseAmount, toMain, toPlain } from '../../src/data/money';
import { addDays, daysBetween, expiryFor, nextMonthStart } from '../../src/data/dates';

describe('money', () => {
  it('reads what people type, in Latin or Arabic digits', () => {
    expect(parseAmount('12.5', 'ILS')).toBe(1250);
    expect(parseAmount('12,50', 'ILS')).toBe(1250);
    expect(parseAmount('١٢٫٥', 'ILS')).toBe(1250);
    expect(parseAmount('3.25', 'JOD')).toBe(3250);
    expect(parseAmount('7', 'USD')).toBe(700);
    expect(parseAmount('1.234', 'ILS')).toBeNull(); // too many decimals for shekels
    expect(parseAmount('abc', 'ILS')).toBeNull();
    expect(parseAmount('', 'ILS')).toBeNull();
  });

  it('shows amounts with the right number of decimals', () => {
    expect(toPlain(1250, 'ILS')).toBe('12.50');
    expect(toPlain(3250, 'JOD')).toBe('3.250');
    expect(formatMoney(1250, 'ILS', 'en')).toBe('12.50 ₪');
    expect(formatMoney(1200, 'ILS', 'en')).toBe('12 ₪');
  });

  it('converts between currencies with different decimals', () => {
    expect(toMain(3250, 'JOD', 'ILS', 5.2)).toBe(1690); // 3.250 JD = 16.90 ₪
    expect(toMain(1000, 'ILS', 'JOD', 0.19)).toBe(1900); // 10 ₪ = 1.900 JD
    expect(toMain(1000, 'ILS', 'ILS', 1)).toBe(1000);
  });
});

describe('dates and expiry', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(daysBetween('2026-10-29', '2026-11-01')).toBe(3);
    expect(nextMonthStart('2026-12-15')).toBe('2027-01-01');
  });

  it('never estimates a printed date', () => {
    expect(expiryFor('printed', '2026-10-29', 30, null)).toEqual({ expiry_date: null, expiry_is_estimated: 0 });
    expect(expiryFor('printed', '2026-10-29', 30, '2027-01-01')).toEqual({ expiry_date: '2027-01-01', expiry_is_estimated: 0 });
  });

  it('estimates fresh items from the shelf life, and nothing for non-perishables', () => {
    expect(expiryFor('estimated', '2026-10-29', 7, null)).toEqual({ expiry_date: '2026-11-05', expiry_is_estimated: 1 });
    expect(expiryFor('none', '2026-10-29', 7, null)).toEqual({ expiry_date: null, expiry_is_estimated: 0 });
  });
});
