/* What the prototype already did before the agent arrived. These must keep passing:
   pages load clean, the demo film starts in view, phone tabs, step label, the events planner, pricing, the chat, and admin sync. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, bookingOf, noSideScroll, noArabic, takeOver, showScreen, enterNumber, sendRequests, pay, pickKey, reportProblem, arrive } from './helpers.mjs';

for (const lang of LANGS) {
  test.describe('pages · ' + lang, () => {
    for (const file of ['index.html', 'admin.html', 'landmarks.html', 'partner.html']) {
      test(file + ' loads clean', async ({ page }) => {
        const errors = watch(page);
        await open(page, file, lang);
        await page.waitForLoadState('load');
        await page.waitForTimeout(600);
        await noSideScroll(page);
        if (lang === 'en') await noArabic(page);
        expect(errors).toEqual([]);
      });
    }
    test('the site root answers at the sub-path', async ({ page }) => {
      const r = await page.goto('./?lang=' + lang);
      expect(r.status()).toBe(200);
      await expect(page.locator('#stage')).toBeAttached();
    });
  });

  test.describe('guest journey · ' + lang, () => {
    test('arrival, requests, payment, key, then a problem solved', async ({ page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await takeOver(page);
      await enterNumber(page, '1087654321');
      await sendRequests(page, T(lang, 'سرير إضافي، إفطار في الغرفة', 'extra bed, breakfast in the room'));
      await pay(page);
      await pickKey(page, 'sms');
      await expect(page.locator('#feed .m.keymsg')).toHaveCount(1);
      let b = await bookingOf(page, lang, '1087654321');
      expect(b.arrivedAt).toBeTruthy(); expect(b.paid).toBe(true); expect(b.key).toBe('code'); expect(b.requests.length).toBe(2);

      await reportProblem(page, T(lang, 'الرمز لا يفتح الباب', 'The code does not open the door'));
      await expect(page.locator('#feed .m.keymsg')).toHaveCount(2);
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'open');
      if (lang === 'en') await noArabic(page);
      await noSideScroll(page);
      expect(errors).toEqual([]);
    });

    test('arrival by mobile number, card from reception', async ({ page }) => {
      await open(page, 'index.html', lang);
      await arrive(page, '0500000412', { mode: 'phone', key: 'card' });
      const b = await bookingOf(page, lang, '1087654321');
      expect(b.key).toBe('card'); expect(b.paid).toBe(true);
    });

    test('an unknown number finds no booking', async ({ page }) => {
      await open(page, 'index.html', lang);
      await takeOver(page);
      await enterNumber(page, '1000000009');
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'none');
      await expect(page.locator('.keypad')).toBeVisible();
    });
  });

  test.describe('admin sync · ' + lang, () => {
    test('no key before the room is ready; the admin marks it ready and the guest moves on', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);
      await takeOver(page);
      await enterNumber(page, '2456701938');                          // room 207 is being prepared
      await sendRequests(page, '');
      await page.locator('#panel [data-v="wait"]').click();
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'wait');
      expect((await bookingOf(page, lang, '2456701938')).key).toBeFalsy();
      const room = admin.locator('#rooms .rm', { hasText: '207' });
      await room.click(); await room.click();                         // being prepared -> maintenance -> ready
      await pay(page);
      await pickKey(page, 'email');
      expect((await bookingOf(page, lang, '2456701938')).key).toBe('code');
    });

    test('a refund waits for staff, and the approval reaches the guest', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);
      await arrive(page, '1087654321');
      await reportProblem(page, T(lang, 'أريد استرجاع المبلغ', 'I want a refund'));
      await expect(admin.locator('#appr .item')).toHaveCount(1);
      expect((await bookingOf(page, lang, '1087654321')).refunded).toBeFalsy();
      await admin.locator('#appr .ghost-btn.yes').click();
      await expect.poll(async () => (await bookingOf(page, lang, '1087654321')).refunded).toBe(true);
      await expect(admin.locator('#appr .item')).toHaveCount(0);
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'open');
    });

    test('a permission switched off turns the action into a staff approval', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang, '#rules');
      await admin.locator('#pReissue').uncheck();
      await arrive(page, '1087654321');
      await reportProblem(page, T(lang, 'الرمز لا يفتح الباب', 'The code does not open the door'));
      await expect(admin.locator('[data-tab="now"] .count')).toHaveText('1');
      await admin.locator('[data-tab="now"]').click();
      await expect(page.locator('#feed .m.keymsg')).toHaveCount(1);       // nothing reissued while staff decide
      await admin.locator('#appr .ghost-btn.yes').click();
      await expect(page.locator('#feed .m.keymsg')).toHaveCount(2);
    });
  });

  test.describe('the rest of the prototype · ' + lang, () => {
    test('events planner fills the form from a sentence and issues the proposal', async ({ page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await page.locator('#sysEvents').click();
      await expect(page.locator('#eventsView')).toBeVisible();
      await page.locator('#evBrief').fill(T(lang, 'مؤتمر تقني لـ 200 شخص، ميزانية 90 ألف، شاشتان وبوفيه', 'Tech conference for 200 people, budget 90 thousand, two screens and a buffet'));
      await page.locator('#evParse').click();
      await expect(page.locator('#evN')).toHaveValue('200');
      await expect(page.locator('#evPacks > *')).toHaveCount(3);
      await page.locator('#evGo').click();
      await expect(page.locator('#evPages')).toBeVisible({ timeout: 30000 });
      await noSideScroll(page);
      expect(errors).toEqual([]);
    });

    test('demand pricing moves the nightly rate inside the hotel limits', async ({ page }) => {
      await open(page, 'admin.html', lang, '#rules');
      const togs = page.locator('#prPeriods .tog');
      await togs.nth(1).click();                                           // summer holiday
      await expect(page.locator('#prPct')).toHaveText(/^\+\d+%$/);
      await togs.nth(4).click();                                           // quiet period
      await expect(page.locator('#prPct')).toHaveText(/^-\d+%$/);
      await expect(page.locator('#prRates .pr-row')).toHaveCount(4);
      const s = await readStore(page, lang);
      expect(s.pricing.period).toBe('low');
    });

    test('the chat answers rates and signs a guest in', async ({ page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await page.locator('#helpFab').click();
      await expect(page.locator('#helpBox')).toBeVisible();
      await page.locator('#helpInput').fill(T(lang, 'كم أسعار الليلة؟', 'What are tonight’s rates?'));
      await page.locator('#helpForm button[type="submit"]').click();
      await expect(page.locator('#helpFeed .m.bot').last()).toContainText(/\d{3}/);
      await page.locator('#helpInput').fill('1087654321');
      await page.locator('#helpForm button[type="submit"]').click();
      await expect(page.locator('#helpFeed .m.bot').last()).toContainText('412');
      await page.locator('#helpInput').fill(T(lang, 'اطلب تنظيف الغرفة', 'Please clean the room'));
      await page.locator('#helpForm button[type="submit"]').click();
      await expect.poll(async () => (await readStore(page, lang)).tickets.length).toBe(1);
      expect(errors).toEqual([]);
    });

    test('rooms section, admin console sections and the admin booking form', async ({ page }) => {
      await open(page, 'admin.html', lang, '#guests');
      await expect(page.locator('#rows tr')).toHaveCount(4);
      await page.locator('#fName').fill('Test Guest');
      await page.locator('#fId').fill('1111111111');
      await page.locator('#fPhone').fill('0511111111');
      await page.locator('#addForm button[type="submit"]').click();
      await expect(page.locator('#rows tr')).toHaveCount(5);
      await open(page, 'index.html', lang);
      await expect(page.locator('#bento .bento')).toHaveCount(4);
    });
  });
}

/* the demo film: real timings, so motion is on */
test.describe('demo film', () => {
  test.use({ reducedMotion: 'no-preference' });
  for (const lang of LANGS) {
    test('starts when the stage comes into view and stops when the guest takes over · ' + lang, async ({ page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await expect(page.locator('#demoBtn')).toHaveAttribute('aria-pressed', 'false');
      await page.locator('#stage').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById('stage').scrollIntoView({ block: 'start' }));
      await expect(page.locator('#demoBtn')).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 });
      await expect(page.locator('.x-step-label')).toHaveText(/1.*6/);
      const tabs = page.locator('.x-stage-tabs');
      if (await tabs.isVisible()) {                                        // phones
        await tabs.locator('[data-tab="assist"]').click();
        await expect(page.locator('#stage')).toHaveAttribute('data-view', 'assist');
        await tabs.locator('[data-tab="screen"]').click();
      }
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', /link|req/, { timeout: 20000 });
      await showScreen(page);
      await page.locator('#resetStage').click();
      await expect(page.locator('#demoBtn')).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'idle');
      expect(errors).toEqual([]);
    });
  }
  test('the film plays a whole arrival through to the key and the follow-up', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'one full run is enough');
    test.setTimeout(120000);
    const errors = watch(page);
    await open(page, 'index.html', 'ar');
    await page.locator('#ctaDemo').click();
    await expect(page.locator('#demoBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'open', { timeout: 90000 });
    await expect(page.locator('#feed .m.keymsg')).toHaveCount(1);
    await expect(page.locator('#feed .m.keymsg')).toHaveCount(2, { timeout: 30000 });      // scene one ends with a reissued code
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('miftah.sim.v4')).log.length)).toBe(0);   // the film never writes to the real data
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sila.partner.v1')).inbox.length)).toBe(0);   // and never reaches the partner
    expect(errors).toEqual([]);
  });
});
