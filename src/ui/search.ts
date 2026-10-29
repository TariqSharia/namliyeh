// Search that forgives the usual Arabic spelling differences (أ/إ/آ/ا, ة/ه, ى/ي, diacritics)
// and case in English, so "ارز", "أرز" and "Rice" all find rice.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ً-ٰٟـ]/g, '') // diacritics and tatweel
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matches(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = normalize(query);
  if (!q) return true;
  return fields.some((f) => f && normalize(f).includes(q));
}
