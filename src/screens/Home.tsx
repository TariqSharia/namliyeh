import { useQuery } from '@powersync/react';
import { useHousehold } from '../app/household';
import { go } from '../app/router';
import { takeFromStock, undoMovements, wasteBatch } from '../data/actions';
import { today } from '../data/dates';
import { EXPIRING_SOON, NEED_TO_BUY } from '../data/queries';
import { nameOf, numberFmt, useLang, useT } from '../i18n';
import { Icon } from '../ui/Icon';
import { InstallCard } from '../ui/InstallCard';
import { ItemArt } from '../ui/ItemArt';
import { Screen } from '../ui/Screen';
import { useToast } from '../ui/Toast';

type Expiring = {
  batch_id: string;
  item_id: string;
  name_en: string | null;
  name_ar: string | null;
  icon: string;
  days_left: number;
  remaining: number;
  expiry_is_estimated: number;
};

/** The three daily tasks as three big buttons, then what needs eating soon. */
export function Home() {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { household, ctx } = useHousehold();
  const { data: need } = useQuery(NEED_TO_BUY, [ctx.householdId]);
  const { data: expiring } = useQuery<Expiring>(EXPIRING_SOON, [ctx.householdId, 3, today()]);

  // The first few names say more than a count ("eggs, dish soap, rice").
  const needNames = need.map((n: { free_text: string | null; name_en: string | null; name_ar: string | null }) => n.free_text || nameOf(n, lang));
  const needPreview = needNames.slice(0, 3).join(lang === 'ar' ? '، ' : ', ') + (needNames.length > 3 ? '…' : '');

  const whenLabel = (days: number) =>
    days < 0 ? t('expiredAgo', { n: numberFmt(-days, lang) }) : days === 0 ? t('expiresToday') : days === 1 ? t('expiresTomorrow') : t('expiresInDays', { n: numberFmt(days, lang) });

  return (
    <Screen title={household.name} showBack={false}>
      <InstallCard where="home" />
      <nav className="big-tiles" aria-label={t('dailyTasks')}>
        <a className="big-tile bought" href="#/buy">
          <span className="big-icon">
            <Icon name="bagPlus" size={28} />
          </span>
          <span className="big-text">
            <span className="big-label">{t('iBought')}</span>
            <span className="big-hint">{t('iBoughtHint')}</span>
          </span>
        </a>
        <a className="big-tile used" href="#/use">
          <span className="big-icon">
            <Icon name="bagMinus" size={28} />
          </span>
          <span className="big-text">
            <span className="big-label">{t('iUsed')}</span>
            <span className="big-hint">{t('iUsedHint')}</span>
          </span>
        </a>
        <a className="big-tile need" href="#/need">
          <span className="big-icon">
            <Icon name="list" size={28} />
          </span>
          <span className="big-text">
            <span className="big-label">{t('needToBuy')}</span>
            <span className="big-hint">{need.length ? needPreview : t('needNone')}</span>
          </span>
          {need.length > 0 && (
            <span className="badge" aria-hidden="true">
              {numberFmt(need.length, lang)}
            </span>
          )}
        </a>
      </nav>

      {expiring.length > 0 && (
        <section className="section" aria-labelledby="exp-h">
          <h2 id="exp-h" className="section-title warn">
            {t('expiringSoon')}
          </h2>
          <ul className="rows">
            {expiring.map((b) => (
              <li key={b.batch_id} className="row">
                <button className="row-main" onClick={() => go({ name: 'item', id: b.item_id })}>
                  <ItemArt nameEn={b.name_en} icon={b.icon} name={nameOf(b, lang)} size={44} />
                  <span className="row-text">
                    <span className="row-title">{nameOf(b, lang)}</span>
                    <span className={`row-sub${b.days_left <= 0 ? ' danger' : ''}`}>
                      {whenLabel(b.days_left)}
                      {b.expiry_is_estimated ? `${lang === 'ar' ? '، ' : ', '}${t('estimated')}` : ''}
                    </span>
                  </span>
                </button>
                <div className="row-actions">
                  <button
                    className="btn small primary"
                    onClick={async () => {
                      const ids = await takeFromStock(ctx, b.item_id, b.remaining);
                      toast(t('markedUsed', { name: nameOf(b, lang) }), () => undoMovements(ctx, ids));
                    }}
                  >
                    {t('used')}
                  </button>
                  <button
                    className="btn small danger-ghost icon-only"
                    aria-label={`${t('thrownAway')}: ${nameOf(b, lang)}`}
                    onClick={async () => {
                      const id = await wasteBatch(ctx, b.batch_id, b.remaining);
                      toast(t('markedWasted', { name: nameOf(b, lang) }), () => undoMovements(ctx, [id]));
                    }}
                  >
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Screen>
  );
}
