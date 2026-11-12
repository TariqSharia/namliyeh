import { useQuery } from '@powersync/react';
import { useEffect, useMemo, useState } from 'react';
import { useHousehold } from '../app/household';
import { guessItems, openFoodFacts, rememberBarcode, type OffProduct } from '../data/barcodes';
import { nameOf, useLang, useT } from '../i18n';
import { ItemArt } from './ItemArt';
import { ItemPicker, PICKER_ITEMS, type PickerItem } from './ItemPicker';
import { Sheet } from './Sheet';

/**
 * A barcode nobody has taught the app yet. Shows the product's name from Open Food Facts when it
 * knows it, offers the likeliest catalog items as one-tap choices, and the full picker below.
 * The answer is remembered for every home, so each barcode is asked once, ever.
 */
export function UnknownBarcode({ code, onPicked, onClose }: { code: string; onPicked: (item: PickerItem) => void; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const { ctx } = useHousehold();
  const { data: items } = useQuery<PickerItem>(PICKER_ITEMS);
  const [off, setOff] = useState<OffProduct | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void openFoodFacts(code).then((p) => !cancelled && setOff(p));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const guesses = useMemo(() => (off ? guessItems(off, items) : []), [off, items]);

  async function pick(item: PickerItem) {
    await rememberBarcode(code, item.id, ctx.householdId, off ? [off.brand, off.name].filter(Boolean).join(' ') : undefined);
    onPicked(item);
  }

  return (
    <Sheet title={t('whatIsThis')} onClose={onClose}>
      <p className="barcode-number" dir="ltr">
        {code}
      </p>
      {off === undefined ? (
        <p className="hint">{t('lookingUp')}</p>
      ) : off ? (
        <p className="barcode-product">
          {off.brand && <span className="row-sub">{off.brand}</span>}
          <span className="row-title">{off.name}</span>
        </p>
      ) : (
        <p className="hint">{t('barcodeUnknownHint')}</p>
      )}

      {guesses.length > 0 && (
        <div className="chips barcode-guesses">
          {guesses.map((g) => (
            <button key={g.id} className="chip from-list" onClick={() => void pick(g)}>
              <ItemArt nameEn={g.name_en} icon={g.icon} name={nameOf(g, lang)} size={32} />
              {nameOf(g, lang)}
            </button>
          ))}
        </div>
      )}

      <p className="hint">{t('pickOnce')}</p>
      <ItemPicker onPick={(i) => void pick(i)} />
    </Sheet>
  );
}
