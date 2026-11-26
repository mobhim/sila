/* Second hardening pass, from the first evaluation against a real model. No real model is used here: the tests answer the
   API address themselves, or call the agent's files directly. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, bookingOf, arrive, ask, idle, lastTrail, showScreen, playModel, modelReady, ACT, planOf, replyOf, takeOver, enterNumber, sendRequests, noArabic, noSideScroll } from './helpers.mjs';
import { RATES, BILL, NOT } from './rates.cases.mjs';

const A = '1087654321';
const chatSend = async (page, text) => { await page.locator('#helpInput').fill(text); await page.locator('#helpForm button[type="submit"]').click(); };
const chatLast = page => page.locator('#helpFeed .m.bot:not(.typing)').last();

test.describe('A · rate questions stay local', () => {
  test('the rules read rate and bill questions in Gulf wording, Latin letters and with typos, and mark them as never for a model', async ({ page }) => {
    await open(page, 'index.html', 'en');
    expect(RATES.length + BILL.length).toBeGreaterThanOrEqual(18);
    const out = await page.evaluate(([rates, bill, not]) => {
      const R = window.SILA.brains.rules, perms = { reissue: true, ticket: true, move: true, late: true, limit: 150 };
      const stay = { stage: 'stay', pending: null, booking: { room: '412', key: 'code', paid: true, arrived: true, alt: '414' }, perms }, none = { stage: 'identify', pending: null, booking: null, perms };
      const miss = [];
      for (const [list, want] of [[rates, 'rates'], [bill, 'bill']]) for (const t of list) for (const st of [stay, none])
        if (R.intentOf(t, st, st.stage).intent !== want || !R.local(t, st, st.stage)) miss.push(t);
      return {
        miss, wrong: not.filter(t => ['rates', 'bill'].includes(R.intentOf(t, stay, 'stay').intent)),
        /* a rate question with another request in the same message is not local: the model plans both */
        mixed: [R.local('كم سعر الليلة وأبي مناشف زيادة', stay, 'stay'), R.local('How much is a night, and can I get a late checkout?', stay, 'stay')]
      };
    }, [RATES, BILL, NOT]);
    expect(out.miss).toEqual([]);
    expect(out.wrong).toEqual([]);
    expect(out.mixed).toEqual([false, false]);
  });

  for (const lang of LANGS) {
    test('with a model on, a rate question never reaches it and the numbers are the page’s own · ' + lang, async ({ page }) => {
      const errors = watch(page);
      const calls = await playModel(page, () => replyOf(T(lang, 'سعر الليلة 1 ريال شامل الضريبة.', 'The nightly rate is 1 riyal including VAT.')));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      const asks = lang === 'en' ? ['how mutch per night', 'whats the prise', 'what do i owe'] : ['كم الليلة عندكم؟', 'kam se3r el leila', 'كم سعرر الليله', 'كم علي'];
      for (const q of asks) {
        await ask(page, q);
        await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));
        await expect(lastTrail(page).locator('li b')).toHaveText(T(lang, 'قراءة الأسعار', 'Read the rates'));
        await expect(page.locator('#feed .m.bot').last()).toContainText(/\d{3}/);
      }
      expect(calls.filter(c => c.task === 'agent').length).toBe(0);
      await expect(page.locator('#feed')).not.toContainText(T(lang, '1 ريال', '1 riyal'));
      /* the chat window answers the same way */
      await page.locator('#helpFab').click();
      await chatSend(page, A);
      await expect(chatLast(page)).toContainText('412');
      await chatSend(page, T(lang, 'كم الليلة عندكم؟', 'hw much is the room'));
      await expect(chatLast(page)).toContainText(/\d{3}/);
      expect(calls.filter(c => c.task === 'agent').length).toBe(0);
      if (lang === 'en') await noArabic(page);
      expect(errors).toEqual([]);
    });
  }
});
