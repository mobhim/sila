/* صلة — retakes the screenshots in media/ (the ones the home page shows) from the running prototype, in Arabic and English.
   Run it whenever the guest screen, the admin console or the partner page changes:   npm run shots */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 4174, BASE = 'http://127.0.0.1:' + PORT + '/sila/';
const server = spawn(process.execPath, ['tests/serve.mjs', String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch();
const T = (lang, ar, en) => (lang === 'en' ? en : ar);

/* Chromium writes PNG; the page itself re-encodes it as WebP, so no image library is needed */
async function webp(page, png, file) {
  const data = await page.evaluate(async b64 => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, png.toString('base64'));
  writeFileSync('media/' + file, Buffer.from(data, 'base64'));
  console.log('media/' + file);
}
async function ctx(lang, viewport, scale) {
  const c = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: 'reduce' });
  await c.addInitScript(() => { try { localStorage.setItem('sila.chatHint', '1'); } catch (e) {} });       // the one-time chat tip stays out of the frame
  return c;
}
const ready = page => page.evaluate(() => document.fonts.ready);
const keys = async (page, n) => { for (const d of n) await page.locator('.keypad [data-k="' + d + '"]').click(); };
const idle = page => page.locator('#askInput:not([disabled])').waitFor();
async function guest(c, lang) { const p = await c.newPage(); await p.goto(BASE + 'index.html?lang=' + lang); await ready(p); await p.locator('#ctaTry').click(); return p; }
const stageShot = async (p, file) => { await p.waitForTimeout(700); await webp(p, await p.locator('#stage').screenshot(), file); };

for (const lang of ['ar', 'en']) {
  const STAGE = [{ width: 1366, height: 900 }, 1400 / 1216];            // the stage is 1216 CSS px wide here: 1400 px in the file
  let c, p;

  c = await ctx(lang, ...STAGE); p = await guest(c, lang);                // arrival: booking found, guest checked in
  await keys(p, '1087654321'); await p.locator('#reqText').waitFor(); await idle(p);
  await stageShot(p, 'arrive-' + lang + '.webp'); await c.close();

  c = await ctx(lang, ...STAGE); p = await guest(c, lang);                // no key before the room is ready
  await keys(p, '2456701938'); await p.locator('#reqText').waitFor(); await p.locator('#panel .row .btn.line').click();
  await p.locator('#panel [data-v="alt"]').waitFor(); await idle(p);
  await stageShot(p, 'ready-' + lang + '.webp'); await c.close();

  c = await ctx(lang, ...STAGE); p = await guest(c, lang);                // requests in the guest's own words
  await keys(p, '1087654321'); await p.locator('#reqText').fill(T(lang, 'سرير إضافي للطفل، إفطار في الغرفة، سيارة للمطار', 'extra bed for the child, breakfast in the room, a car to the airport'));
  await p.locator('#panel .row .btn:not(.line)').click(); await p.locator('#panel dl.bill').waitFor(); await idle(p);
  await p.evaluate(() => { const f = document.getElementById('feed'), m = f.querySelector('.m.bot ul'); if (m) f.scrollTop = m.closest('.m').offsetTop - 120; });
  await stageShot(p, 'requests-' + lang + '.webp');

  await p.locator('#panel .row .btn').first().click();                    // a problem after payment, solved inside the permissions
  await p.locator('#panel [data-v="sms"]').click(); await p.locator('#probText').waitFor();
  await p.locator('#probText').fill(T(lang, 'الرمز لا يفتح الباب', 'The code does not open the door')); await p.locator('#panel .row .btn:not(.line)').click();
  await p.locator('#feed .m.keymsg').nth(1).waitFor(); await idle(p);
  await stageShot(p, 'problem-' + lang + '.webp');

  const FLAT = [{ width: 1400, height: 875 }, 1];
  const c2 = await ctx(lang, ...FLAT); await c2.addCookies([]);          // admin console: a refund waiting for staff (same browser data as the guest above)
  await c2.addInitScript(([k, v, pk, pv, sk, sv]) => { try { if (!localStorage.getItem(k)) { localStorage.setItem(k, v); localStorage.setItem(pk, pv); localStorage.setItem(sk, sv); } } catch (e) {} },
    await p.evaluate(l => { const s = l === 'en' ? '.en' : ''; return ['miftah.sim.v4' + s, localStorage.getItem('miftah.sim.v4' + s), 'sila.partner.v1' + s, localStorage.getItem('sila.partner.v1' + s), 'sila.sync.v1' + s, localStorage.getItem('sila.sync.v1' + s)]; }, lang));
  const g2 = await c2.newPage(); await g2.goto(BASE + 'index.html?lang=' + lang); await ready(g2); await g2.locator('#ctaTry').click();
  await keys(g2, '1087654321'); await g2.locator('#probText').waitFor();
  await g2.locator('#probText').fill(T(lang, 'أريد استرجاع المبلغ', 'I want a refund')); await g2.locator('#panel .row .btn:not(.line)').click();
  const admin = await c2.newPage(); await admin.goto(BASE + 'admin.html?lang=' + lang); await ready(admin);
  await admin.locator('#appr .item').waitFor(); await admin.waitForTimeout(500);
  await webp(admin, await admin.screenshot(), 'admin-' + lang + '.webp');
  await admin.goto(BASE + 'admin.html?lang=' + lang + '#rules'); await admin.reload(); await ready(admin); await admin.waitForTimeout(500);      // demand pricing and the permission switches
  await webp(admin, await admin.screenshot({ fullPage: true }), 'pricing-' + lang + '.webp');
  const partner = await c2.newPage(); await partner.goto(BASE + 'partner.html?lang=' + lang); await ready(partner); await partner.waitForTimeout(600);   // the partner system, with what Sila sent it
  await webp(partner, await partner.screenshot(), 'partner-' + lang + '.webp');
  await c2.close(); await c.close();

  c = await ctx(lang, ...STAGE); p = await c.newPage();                   // the events planner
  await p.goto(BASE + 'index.html?lang=' + lang); await ready(p); await p.locator('#sysEvents').click();
  await p.locator('#evBrief').fill(T(lang, 'مؤتمر تقني لـ 200 شخص، ميزانية 90 ألف، شاشتان وبوفيه مع خيارات نباتية', 'Tech conference for 200 people, budget 90 thousand, two screens and a buffet with vegetarian options'));
  await p.locator('#evParse').click(); await p.waitForTimeout(900);
  await webp(p, await p.locator('#evStage').screenshot(), 'events-' + lang + '.webp'); await c.close();
}
await browser.close(); server.kill();
