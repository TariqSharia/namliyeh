import { describe, expect, it } from 'vitest';
import { guessItems, isProductBarcode } from '../../src/data/barcodes';

describe('barcodes', () => {
  it('accepts product barcodes only', () => {
    expect(isProductBarcode('6281007031233')).toBe(true); // EAN-13
    expect(isProductBarcode('96385074')).toBe(true); // EAN-8
    expect(isProductBarcode('012345678905')).toBe(true); // UPC-A
    expect(isProductBarcode('https://example.com')).toBe(false); // a QR code
    expect(isProductBarcode('12345')).toBe(false);
    expect(isProductBarcode('628100703123399')).toBe(false);
  });

  it('suggests the catalog items named in the product', () => {
    const items = [
      { id: 'milk', name_en: 'Milk', name_ar: 'حليب' },
      { id: 'rice', name_en: 'Long-grain rice', name_ar: 'أرز طويل الحبة' },
      { id: 'soap', name_en: 'Dish soap', name_ar: 'سائل جلي' }
    ];
    const almarai = { name: 'Almarai Fresh Milk', brand: 'Almarai', words: 'almarai fresh milk full fat en:milks en:dairies' };
    expect(guessItems(almarai, items).map((i) => i.id)).toEqual(['milk']);
    const arabic = { name: 'حليب طازج', brand: null, words: 'حليب طازج كامل الدسم' };
    expect(guessItems(arabic, items).map((i) => i.id)).toEqual(['milk']);
    expect(guessItems({ name: 'Chocolate', brand: null, words: 'chocolate bar' }, items)).toEqual([]);
  });
});
