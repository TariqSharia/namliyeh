// Sends expiry reminders to phones (Web Push). Three ways in:
//   GET                         -> the public key phones need to subscribe (made on first use)
//   POST + x-cron-secret        -> the daily run from pg_cron: what expires tomorrow, per phone
//   POST + a signed-in user     -> {"test": true}: one test notification to that user's phones
// The private key and cron secret live in private.push_config and are read with the service role,
// which only this function has. No secret is ever typed by a person.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Config = { vapid_public: string; vapid_private: string; cron_secret: string };
type Phone = { endpoint: string; p256dh: string; auth: string; language: string };

async function config(): Promise<Config> {
  const { data, error } = await admin.rpc('push_config');
  if (error) throw error;
  let c = data[0] as Config;
  if (!c.vapid_public) {
    const keys = webpush.generateVAPIDKeys();
    await admin.rpc('push_set_vapid', { p_public: keys.publicKey, p_private: keys.privateKey });
    // Read back: if two runs raced, the first stored pair wins and both use it.
    c = ((await admin.rpc('push_config')).data as Config[])[0];
  }
  return c;
}

/** Tomorrow in Palestine/Jordan time, as YYYY-MM-DD. */
function tomorrowLocal(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Hebron' }));
  now.setDate(now.getDate() + 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function message(lang: string, names: string[]) {
  const ar = lang !== 'en';
  const shown = names.slice(0, 3).join(ar ? '، ' : ', ') + (names.length > 3 ? '…' : '');
  const body = ar
    ? names.length === 1
      ? `${names[0]}: تنتهي صلاحيته غداً. استهلكوه اليوم.`
      : `تنتهي صلاحية ${names.length} أغراض غداً: ${shown}`
    : names.length === 1
      ? `${names[0]} expires tomorrow. Use it today.`
      : `${names.length} things expire tomorrow: ${shown}`;
  return { title: ar ? 'النملية' : 'Namliyeh', body, lang: ar ? 'ar' : 'en', dir: ar ? 'rtl' : 'ltr', url: '/', tag: 'expiry' };
}

async function send(phone: Phone, payload: object) {
  try {
    await webpush.sendNotification({ endpoint: phone.endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
    return 'sent';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    // 404/410: the phone removed the app or turned notifications off. Forget it.
    if (status === 404 || status === 410) {
      await admin.rpc('push_forget', { p_endpoint: phone.endpoint });
      return 'forgotten';
    }
    console.error('push failed', status, (e as Error).message);
    return 'failed';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const c = await config();
    if (req.method === 'GET') return json({ publicKey: c.vapid_public });
    webpush.setVapidDetails('mailto:t.sharia2000@gmail.com', c.vapid_public, c.vapid_private);

    if (req.headers.get('x-cron-secret')) {
      if (req.headers.get('x-cron-secret') !== c.cron_secret) return json({ error: 'forbidden' }, 403);
      const day = tomorrowLocal();
      const { data, error } = await admin.rpc('push_due', { p_day: day });
      if (error) throw error;
      const results = await Promise.all(
        (data as (Phone & { names_ar: string[]; names_en: string[] })[]).map((p) => send(p, message(p.language, p.language === 'en' ? p.names_en : p.names_ar)))
      );
      return json({ day, phones: results.length, sent: results.filter((r) => r === 'sent').length });
    }

    // A signed-in person asking for a test notification on their own phones.
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: user } = await admin.auth.getUser(token);
    if (!user?.user) return json({ error: 'sign in first' }, 401);
    const { data: phones } = await admin.rpc('push_mine', { p_user: user.user.id });
    const results = await Promise.all(
      ((phones ?? []) as Phone[]).map((p) =>
        send(p, {
          ...message(p.language, []),
          body: p.language === 'en' ? 'Reminders work on this phone. You will hear from us the day before something expires.' : 'التنبيهات تعمل على هذا الهاتف. سيصلك تنبيه قبل يوم من انتهاء صلاحية أي شيء.',
          tag: 'test'
        })
      )
    );
    return json({ phones: results.length, sent: results.filter((r) => r === 'sent').length });
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});
