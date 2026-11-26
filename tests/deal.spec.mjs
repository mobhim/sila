/* صلة — direct booking: haggling inside the owner's limits, and the figures the owner reads.
   The first test is the engine alone (no browser): whatever is asked, a price never goes under the limit. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, noArabic } from './helpers.mjs';
import { loadAgent } from './eval/agent-vm.mjs';

test('engine: an offer never passes the owner\'s limit, whatever the round and whatever figure is named', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'no browser involved: once is enough');
  const SILA = loadAgent(), decide = (quote, args, deal) => SILA.permissions.decide({ tool: 'offer_price', args: args || {} }, { quote, deal });
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 3000; i++) {
    const rate = 200 + rnd(3000), max = rnd(51), minNights = 1 + rnd(5), nights = 1 + rnd(10), given = rnd(60), ask = rnd(3) ? 1 + rnd(rate + 500) : 0;
    const d = decide({ rate, nights, round: 1 + rnd(9), given, perk: !!rnd(2) }, ask ? { ask } : {}, { on: true, max, minNights, perk: !!rnd(2) });
    if (!max || nights < minNights) { expect(d.verdict).toBe('deny'); continue; }
    expect(d.verdict).toBe('allow');
    expect(d.pct).toBeLessThanOrEqual(max);
    expect(d.pct).toBeGreaterThanOrEqual(0);
    expect(d.amount).toBeGreaterThanOrEqual(Math.round(rate * (1 - max / 100)));      // the floor
    expect(d.amount).toBe(Math.round(rate * (1 - d.pct / 100)));
    if (ask && ask >= Math.round(rate * (1 - max / 100)) && ask < rate && given === 0) expect(d.amount).toBeLessThanOrEqual(ask);      // a figure inside the limit is met
  }
  expect(decide({ rate: 893, nights: 3, round: 1, given: 0 }, {}, { on: true, max: 10, minNights: 2 }).pct).toBe(5);      // first: half the limit
  expect(decide({ rate: 893, nights: 3, round: 2, given: 5 }, {}, { on: true, max: 10, minNights: 2 }).pct).toBe(10);     // then: all of it
  expect(decide({ rate: 893, nights: 3, round: 9, given: 10 }, { ask: 1 }, { on: true, max: 10, minNights: 2 }).pct).toBe(10);
  expect(decide({ rate: 893, nights: 3, round: 1 }, {}, { on: false, max: 10 }).code).toBe('deal_off');
  expect(decide({ rate: 893, nights: 1, round: 1 }, {}, { on: true, max: 10, minNights: 2 }).code).toBe('min_nights');
  expect(decide(null, {}, { on: true, max: 10 }).verdict).toBe('deny');
  expect(decide({ rate: 893, nights: 3, round: 1 }, { ask: 'free' }, { on: true, max: 10 }).verdict).toBe('deny');      // a malformed call is refused, not guessed at
});

for (const lang of LANGS) {
  test.describe('direct booking · ' + lang, () => {
    const say = async (page, text) => {
      const n = await page.locator('#helpFeed .m.guest').count();
      await page.locator('#helpInput').fill(text);
      await page.locator('#helpForm button[type="submit"]').click();
      await expect(page.locator('#helpFeed .m.guest')).toHaveCount(n + 1);
      await expect(page.locator('#helpFeed .m.typing')).toHaveCount(0);
    };
    const last = page => page.locator('#helpFeed .m.bot').last();

    test('haggling moves in two steps to the limit and stops; the booking, the board and a lost opportunity are recorded', async ({ context, page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await page.locator('#helpBook').click();
      await say(page, T(lang, 'جناح ملكي', 'Royal Suite'));
      await say(page, '3');
      await say(page, T(lang, 'فيه خصم؟', 'any discount?'));
      await expect(page.locator('#helpFeed')).toContainText('5%');
      await say(page, T(lang, 'نزل لي شوي', 'can you do better'));
      await expect(page.locator('#helpFeed')).toContainText('10%');
      await say(page, T(lang, 'أبيه ب 400', 'I want it for 400'));
      await expect(page.locator('#helpFeed')).not.toContainText('15%');
      await say(page, T(lang, 'محمد العلي', 'John Smith'));
      await say(page, '1055555555');
      await say(page, '0555555555');
      await expect(last(page)).toContainText('10%');
      await say(page, T(lang, 'تأكيد الحجز', 'Confirm booking'));
      let s = await readStore(page, lang);
      const b = s.bookings.find(x => x.id === '1055555555');
      expect(b.direct).toBe(true); expect(b.disc).toBe(10); expect(b.late).toBe(true);
      expect(s.trail.filter(e => e.tool === 'offer_price').length).toBe(3);
      expect(s.trail.filter(e => e.tool === 'offer_price').every(e => e.verdict === 'allow' && e.src === 'chat')).toBe(true);
      if (lang === 'en') await noArabic(page);

      /* someone else names a price under the limit and walks away */
      await say(page, T(lang, 'تسجيل خروج', 'log out'));
      await say(page, T(lang, 'سجّلني كنزيل جديد', 'register me as a new guest'));
      await say(page, T(lang, 'سالم الدوسري', 'Sam Lee'));
      await say(page, '1066666666');
      await say(page, '0566666666');
      await say(page, T(lang, 'ستاندر', 'Standard'));
      await say(page, '2');
      await say(page, T(lang, 'أبيه ب 300', 'I want it for 300'));
      await say(page, T(lang, 'إلغاء', 'Cancel'));
      s = await readStore(page, lang);
      expect(s.lost.length).toBe(1); expect(s.lost[0].why).toBe('below'); expect(s.lost[0].ask).toBe(300);
      expect(s.bookings.some(x => x.id === '1066666666')).toBe(false);

      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);
      await expect(admin.locator('#dCount')).toHaveText('1');
      await expect(admin.locator('#dLost li')).toHaveCount(1);
      await expect(admin.locator('#dNet')).not.toHaveText('0');
      if (lang === 'en') await noArabic(admin);
      expect(errors).toEqual([]);
    });

    test('the owner switches haggling off: the price is fixed and no discount is recorded', async ({ context, page }) => {
      await open(page, 'admin.html', lang);
      await page.locator('[data-tab="rules"]').click();
      await page.locator('#dOn').uncheck();
      expect((await readStore(page, lang)).deal.on).toBe(false);
      const guest = await context.newPage();
      await open(guest, 'index.html', lang);
      await guest.locator('#helpBook').click();
      await say(guest, T(lang, 'جناح ملكي', 'Royal Suite'));
      await say(guest, '3');
      await say(guest, T(lang, 'فيه خصم؟', 'any discount?'));
      const s = await readStore(guest, lang);
      const e = s.trail.find(x => x.tool === 'offer_price');
      expect(e.verdict).toBe('deny'); expect(e.code).toBe('deal_off');
      await expect(guest.locator('#helpFeed')).not.toContainText('5%');
    });
  });
}
