// Общая логика расписания: используется и сайтом (браузер), и скриптом пушей (GitHub Actions).
(function (root) {
  const DAY_NAMES = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fmt = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const pairWord = (k) => (k === 1 ? 'пара' : k < 5 ? 'пары' : 'пар');

  // Какая неделя (1–4) для даты y-m-d (по Киеву). Неделя начинается с понедельника.
  function weekOf(s, y, m, d) {
    const [ry, rm, rd] = s.cycle.refMonday.split('-').map(Number);
    const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ry, rm - 1, rd)) / 864e5);
    const n = s.cycle.length;
    return ((((s.cycle.refWeek - 1 + Math.floor(days / 7)) % n) + n) % n) + 1;
  }

  // Дата по Киеву (+ сдвиг в днях): {y, m, d, weekday, hour, min}
  function kyivDate(offsetDays = 0, now = new Date()) {
    let tz = 'Europe/Kyiv';
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch (e) { tz = 'Europe/Kiev'; }
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
    const base = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + offsetDays));
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate(), weekday: base.getUTCDay(),
             hour: offsetDays ? 0 : +p.hour, min: offsetDays ? 0 : +p.minute };
  }

  function dayPlan(s, weekday, week) {
    const day = (s.weeks[String(week)] || {})[String(weekday)];
    if (!day || !day.lessons.length) return null;
    const skip = new Set(s.skip || []);
    const items = day.lessons.map((l) => {
      const p = s.pairs.find((x) => x.n === l.n);
      return { ...l, room: l.room || (s.rooms || {})[l.subject], start: toMin(p.start), end: toMin(p.end), skippable: skip.has(l.subject) };
    }).sort((a, b) => a.start - b.start);
    const needed = items.filter((i) => !i.skippable);
    const windows = [];
    for (let i = 1; i < needed.length; i++) {
      const from = needed[i - 1].end, to = needed[i].start;
      if (to - from >= (s.minWindowMin || 30)) windows.push({ from, to });
    }
    const first = needed[0] || null;
    const last = needed[needed.length - 1] || null;
    const sleepThrough = first ? items.filter((i) => i.start < first.start) : items;
    return { weekday, week, name: DAY_NAMES[weekday], mode: day.mode, remote: /дист/i.test(day.mode),
             items, needed, windows, first, last, sleepThrough };
  }

  const where = (l) => (l.room ? `, ауд. ${l.room}` : '');
  const range = (arr) => `уроки ${arr[0].n * 2 - 1}–${arr[arr.length - 1].n * 2}`;
  const lessons = (n) => `уроки ${n * 2 - 1}–${n * 2}`;
  const extrasOf = (s, wd) => ((s.extras || {})[String(wd)] || []).map((e) => ({ ...e, at: toMin(e.time) }));

  function morningMessage(s, weekday, week) {
    const d = dayPlan(s, weekday, week);
    if (!d) return null;
    const title = `${cap(d.name)} · ${d.week} тиждень · ${d.mode}`;
    const lines = [];
    if (!d.first) {
      lines.push('Сегодня все пары можно пропустить — отдыхай 😴');
    } else {
      if (d.sleepThrough.length) lines.push(`😴 Можешь поспать — ${range(d.sleepThrough)} можно проспать`);
      lines.push(`▶️ Первая нужная: ${fmt(d.first.start)} — ${d.first.subject}${where(d.first)}`);
      d.windows.forEach((w) => lines.push(`☕ Окно ${fmt(w.from)}–${fmt(w.to)} — можно отдохнуть`));
      lines.push(`🏁 Свободен с ${fmt(d.last.end)}`);
    }
    extrasOf(s, weekday).forEach((e) => lines.push(`📚 ${e.title} в ${e.time}`));
    return { title, body: lines.join('\n') };
  }

  function eveningMessage(s, tomorrowWeekday, week) {
    const d = dayPlan(s, tomorrowWeekday, week);
    if (!d) return null;
    const title = `Завтра ${d.name} · ${d.week} тиждень · ${d.mode}`;
    if (!d.first) return { title, body: 'Завтра всё можно пропустить — высыпайся 😴' };
    const wake = d.first.start - (d.remote ? s.wakeBeforeRemoteMin : s.wakeBeforeMin);
    const lines = [`⏰ Будильник на ${fmt(wake)} — первая нужная в ${fmt(d.first.start)} (${d.first.subject})`];
    if (d.sleepThrough.length) lines.push(`😴 ${cap(range(d.sleepThrough))} можно проспать`);
    lines.push(`🏁 Свободен с ${fmt(d.last.end)}`);
    extrasOf(s, tomorrowWeekday).forEach((e) => lines.push(`📚 ${e.title} в ${e.time}`));
    return { title, body: lines.join('\n') };
  }

  const cap = (x) => x[0].toUpperCase() + x.slice(1);

  const api = { weekOf, kyivDate, lessons, extrasOf, toMin, fmt, dayPlan, morningMessage, eveningMessage, DAY_NAMES, pairWord };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Plan = api;
})(typeof self !== 'undefined' ? self : this);
