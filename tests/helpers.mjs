/* shared by every spec */
import { expect } from '@playwright/test';

export const LANGS = ['ar', 'en'];
export const T = (lang, ar, en) => (lang === 'en' ? en : ar);
export const storeKey = lang => 'miftah.sim.v4' + (lang === 'en' ? '.en' : '');
export const partnerKey = lang => 'sila.partner.v1' + (lang === 'en' ? '.en' : '');

/* every console error and uncaught exception on the page; a spec ends with expect(errors).toEqual([]) */
export function watch(page) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text() + ' @ ' + (m.location().url || '')); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + ' ' + String(e.stack || '').split(/\n/).slice(1, 4).join(' | ')));
  return errors;
}
export async function open(page, file, lang, hash) {
  await page.goto(file + '?lang=' + lang + (hash || ''));
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}
export const readStore = (page, lang) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), storeKey(lang));
export const readPartner = (page, lang) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), partnerKey(lang));
export const bookingOf = async (page, lang, id) => (await readStore(page, lang)).bookings.find(b => b.id === id);

export async function noSideScroll(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, 'horizontal overflow in px').toBeLessThanOrEqual(1);
}
/* the English edition shows no Arabic: visible text, placeholders and labels (the language switch itself says «عربي») */
export async function noArabic(page) {
  const found = await page.evaluate(() => {
    const AR = /[؀-ۿ]/, out = [];
    const skip = n => !!(n.closest && n.closest('#langBtn'));
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      const p = n.parentElement; if (!p || skip(p) || /^(SCRIPT|STYLE)$/.test(p.tagName)) continue;
      if (AR.test(n.nodeValue)) out.push(n.nodeValue.trim().slice(0, 60));
    }
    document.querySelectorAll('[placeholder],[aria-label],[title],[alt]').forEach(n => {
      if (skip(n)) return;
      ['placeholder', 'aria-label', 'title', 'alt'].forEach(a => { const v = n.getAttribute(a); if (v && AR.test(v)) out.push(a + ': ' + v.slice(0, 60)); });
    });
    if (AR.test(document.title)) out.push('title: ' + document.title);
    return out;
  });
  expect(found, 'Arabic text in the English edition').toEqual([]);
}

/* the guest screen */
export async function takeOver(page) {
  await page.locator('#ctaTry').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'idle');
}
export async function showScreen(page) {          // phones split the stage into two tabs
  const tab = page.locator('.x-stage-tabs [data-tab="screen"]');
  if (await tab.isVisible()) await tab.click();
}
export async function enterNumber(page, number, mode) {
  await showScreen(page);
  if (mode === 'phone') await page.locator('#modePhone').click();
  for (const d of number) await page.locator('.keypad [data-k="' + d + '"]').click();
}
export async function sendRequests(page, text) {
  await showScreen(page);
  await expect(page.locator('#reqText')).toBeVisible();
  if (text) { await page.locator('#reqText').fill(text); await page.locator('#panel .row .btn:not(.line)').click(); }
  else await page.locator('#panel .row .btn.line').click();
}
export async function pay(page) {
  await showScreen(page);
  await expect(page.locator('#panel dl.bill')).toBeVisible();
  await page.locator('#panel .row .btn').first().click();
}
export async function pickKey(page, via) {
  await showScreen(page);
  const b = page.locator('#panel [data-v="' + via + '"]');
  await expect(b).toBeVisible();
  await b.click();
  await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'open');
}
export async function reportProblem(page, text) {
  await showScreen(page);
  await expect(page.locator('#probText')).toBeVisible();
  await page.locator('#probText').fill(text);
  await page.locator('#panel .row .btn:not(.line)').click();
}
/* a whole arrival for a guest whose room is ready */
export async function arrive(page, id, o) {
  o = o || {};
  await takeOver(page);
  await enterNumber(page, id, o.mode);
  await sendRequests(page, o.requests || '');
  await pay(page);
  await pickKey(page, o.key || 'sms');
}

/* the ask box: the guest writes to the agent at any moment. Resolves when the agent's turn is over. */
export async function ask(page, text, o) {
  const tab = page.locator('.x-stage-tabs [data-tab="assist"]');
  if (await tab.isVisible()) await tab.click();
  await expect(page.locator('#askInput')).toBeEnabled();
  const turns = await page.locator('#feed .m.trail').count();
  await page.locator('#askInput').fill(text);
  await page.locator('#askInput').press('Enter');
  await expect(page.locator('#feed .m.trail')).toHaveCount(turns + 1);
  if (!(o && o.pending)) await expect(page.locator('#askInput')).toBeEnabled();      // pending: the turn is waiting on a staff member
}
export const idle = page => expect(page.locator('#askInput')).toBeEnabled();      // the agent has finished its turn
export const lastTrail = page => page.locator('#feed .m.trail').last();

/* the optional model brain, without a model: the page is given an API address and the test plays the server.
   answer(body, n) returns the output for that request, a status number, or 'abort'. Every POST is kept in the returned list. */
export const MODEL_API = 'https://model.test/api/ask';
export async function playModel(page, answer) {
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  const calls = [];
  await page.route(/\/sila\/(index|admin)\.html/, async route => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: (await r.text()).replace('<meta name="sila-api" content="">', '<meta name="sila-api" content="' + MODEL_API + '">') });
  });
  await page.route(MODEL_API, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.method() === 'GET') return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ ok: true, ai: true }) });
    const body = JSON.parse(req.postData());
    calls.push(body);
    const out = await answer(body, calls.length);
    if (out === 'abort') return route.abort();
    if (typeof out === 'number') return route.fulfill({ status: out, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ output: out }) });
  });
  return calls;
}
export const modelReady = page => expect(page.locator('#aiTag')).toHaveJSProperty('hidden', false);      // the label may sit in the phone's other tab
