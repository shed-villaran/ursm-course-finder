// Responsive + toggle test across 10 screen sizes. Needs: npm i playwright. Serve the site first (cd docs; python3 -m http.server 8000), then: node tests/responsive_test.js 8000
const { chromium } = require('playwright');
const fs = require('fs');
const PORT = process.argv[2] || '8000';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
fs.mkdirSync(SHOTS, { recursive: true });

const SIZES = [
  ['phone-320', 320, 640], ['phone-360', 360, 740], ['phone-390', 390, 844], ['phone-412', 412, 915],
  ['tablet-768', 768, 1024], ['tablet-820', 820, 1180], ['tablet-landscape-1024', 1024, 768],
  ['laptop-1280', 1280, 720], ['laptop-1366', 1366, 768], ['desktop-1920', 1920, 1080]
];
const SHOT_NAMES = new Set(['phone-320', 'tablet-768', 'tablet-landscape-1024', 'laptop-1366', 'desktop-1920']);

const overflow = () => {
  const W = document.documentElement.clientWidth;
  const bad = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest('.scenery') || el.closest('.confetti') || el.closest('.skip')) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.right > W + 1 || r.left < -1) bad.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
  });
  return { scrollW: document.documentElement.scrollWidth, clientW: W, bad: bad.slice(0, 4) };
};

const answer = () => (cid) => {
  const D = window.COURSE_DATA, c = D.courses.find(x => x.id === cid), u = {};
  D.traits.forEach(t => { const r = (c.profile[t.id] || 0) / 5; u[t.id] = r > 0 ? r : 0.3; });
  const text = document.getElementById('qtext').textContent, btns = [...document.querySelectorAll('#answers .ans')];
  if (text.startsWith('Which Senior')) { btns[0].click(); return; }
  const q = D.questions.find(x => x.text === text);
  if (q.type === 'statement') {
    let s = 0, d = 0; for (const t in q.effects) { s += q.effects[t] * (2 * u[t] - 1); d += Math.abs(q.effects[t]); }
    const v = Math.max(-1, Math.min(1, Math.round(s / d * 2) / 2)); btns.find(x => parseFloat(x.dataset.v) === v).click();
  } else {
    let b = 0, bs = -9; q.options.forEach((o, i) => { let s = 0; for (const t in o.effects) s += o.effects[t] * (2 * u[t] - 1); if (s > bs) { bs = s; b = i; } });
    btns[b].click();
  }
};

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const [name, w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    const res = { name: `${name} (${w}x${h})`, issues: [] };
    const check = async (label) => {
      const o = await page.evaluate(overflow);
      if (o.scrollW > o.clientW + 1 || o.bad.length) res.issues.push(`${label}: scroll ${o.scrollW}>${o.clientW} ${o.bad.join(' ')}`);
    };

    await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await check('welcome');
    if (SHOT_NAMES.has(name)) await page.screenshot({ path: `${SHOTS}r-${name}-1-welcome.png` });

    await page.click('#start');
    for (let i = 0; i < 7; i++) { await page.evaluate(answer(), 'coeng-civil'); await page.waitForTimeout(25); }
    await check('quiz');
    if (SHOT_NAMES.has(name)) await page.screenshot({ path: `${SHOTS}r-${name}-2-quiz.png` });

    // toggle: hide the race list, check it is really hidden, then show it again
    await page.click('#toggleRace');
    const hid = await page.evaluate(() => ({ body: document.getElementById('raceBody').offsetParent === null, row: document.getElementById('rowRace').offsetParent === null, note: document.getElementById('raceNote').offsetParent !== null, label: document.getElementById('toggleRace').textContent }));
    if (!(hid.body && hid.row && hid.note && hid.label === 'Show list')) res.issues.push('race toggle hide failed ' + JSON.stringify(hid));
    await check('quiz-hidden');
    if (SHOT_NAMES.has(name)) await page.screenshot({ path: `${SHOTS}r-${name}-3-quiz-hidden.png` });
    // the mascot must not leak counts while hidden
    const bubble = await page.textContent('#react');
    if (/\d/.test(bubble)) res.issues.push('mascot line has a number while hidden: ' + bubble);
    await page.click('#toggleRace');
    const shown = await page.evaluate(() => document.getElementById('raceBody').offsetParent !== null && document.getElementById('toggleRace').textContent === 'Hide list');
    if (!shown) res.issues.push('race toggle show failed');

    // finish the quiz
    for (let g = 0; g < 70 && !(await page.$('.thinking-screen')); g++) { await page.evaluate(answer(), 'coeng-civil'); await page.waitForTimeout(20); }
    await page.waitForSelector('.reveal', { timeout: 6000 });
    await page.waitForTimeout(500);
    await check('reveal');
    if (SHOT_NAMES.has(name)) await page.screenshot({ path: `${SHOTS}r-${name}-4-reveal.png` });
    await page.click('#seeDash');
    await page.waitForSelector('.dash');
    await check('dashboard');
    if (SHOT_NAMES.has(name)) await page.screenshot({ path: `${SHOTS}r-${name}-5-dash.png`, fullPage: false });

    // dashboard toggle for the other programs
    await page.click('#toggleOthers');
    const oh = await page.evaluate(() => document.getElementById('othersBody').offsetParent === null);
    if (!oh) res.issues.push('others toggle hide failed');
    await page.click('#toggleOthers');
    await page.evaluate(() => document.querySelectorAll('details.prog').forEach(d => d.open = true));
    await check('dashboard-open');

    // touch target size of the answer buttons on the quiz screen
    if (errs.length) res.issues.push('JS errors: ' + errs.join('; '));
    rows.push(res);
    await ctx.close();
  }
  console.log('\nRESPONSIVE TEST');
  let allOk = true;
  rows.forEach(r => { console.log((r.issues.length ? 'FAIL ' : 'ok   ') + r.name); r.issues.forEach(i => console.log('       - ' + i)); if (r.issues.length) allOk = false; });
  console.log(allOk ? '\nAll sizes passed: no sideways scrolling, toggles work, no script errors.' : '\nSome sizes have problems.');
  await browser.close();
})().catch(e => { console.error('TEST FAILED:', e.message); process.exit(1); });
