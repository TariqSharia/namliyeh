import { numberFmt, useLang, useT } from '../i18n';

/** Big minus / number / plus. The number is read aloud by screen readers. */
export function Stepper({
  value,
  onChange,
  min = 0,
  step = 1,
  label
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  label: string;
}) {
  const lang = useLang();
  const t = useT();
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="step-btn"
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}
        disabled={value <= min}
        aria-label={t('less')}
      >
        −
      </button>
      <output className="step-value" aria-live="polite">
        {numberFmt(value, lang)}
      </output>
      <button type="button" className="step-btn" onClick={() => onChange(+(value + step).toFixed(3))} aria-label={t('more')}>
        +
      </button>
    </div>
  );
}
