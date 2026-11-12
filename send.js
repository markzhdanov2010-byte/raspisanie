// Отправка пуш-уведомлений. Запускается GitHub Actions каждый час,
// но шлёт только в часы из schedule.json (morningHour / eveningHour) по киевскому времени.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const Plan = require('../plan.js');

const s = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schedule.json'), 'utf8'));
const mode = (process.env.MODE || 'auto').trim();

function kyivNow() {
  let tz = s.timezone || 'Europe/Kyiv';
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { tz = 'Europe/Kiev'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { weekday: wd, hour: Number(parts.hour) };
}

async function main() {
  if (!process.env.PUSH_CONFIG) throw new Error('Нет секрета PUSH_CONFIG — скопируй его из приложения в Settings → Secrets → Actions');
  const cfg = JSON.parse(process.env.PUSH_CONFIG);
  webpush.setVapidDetails('https://github.com', cfg.publicKey, cfg.privateKey);

  const { weekday, hour } = kyivNow();
  const tomorrow = (weekday + 1) % 7;
  let msg = null;

  if (mode === 'morning' || (mode === 'auto' && hour === s.morningHour)) msg = Plan.morningMessage(s, weekday);
  else if (mode === 'evening' || (mode === 'auto' && hour === s.eveningHour)) msg = Plan.eveningMessage(s, tomorrow);
  else if (mode === 'test') msg = Plan.morningMessage(s, weekday) || { title: 'Тест ✅', body: 'Уведомления работают! Сегодня пар нет.' };

  if (!msg) { console.log(`Киев: день ${weekday}, ${hour}:xx — сейчас ничего отправлять не нужно.`); return; }
  console.log('Отправляю:\n' + msg.title + '\n' + msg.body);
  try {
    await webpush.sendNotification(cfg.subscription, JSON.stringify(msg), { TTL: 3600, urgency: 'high' });
    console.log('Готово ✅');
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) {
      throw new Error('Подписка устарела: открой приложение, нажми «Включить уведомления» и обнови секрет PUSH_CONFIG');
    }
    throw e;
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
