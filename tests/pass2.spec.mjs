/* Second hardening pass, from the first evaluation against a real model. No real model is used here: the tests answer the
   API address themselves, or call the agent's files directly. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, bookingOf, arrive, ask, idle, lastTrail, showScreen, playModel, modelReady, ACT, planOf, replyOf, takeOver, enterNumber, sendRequests, noArabic, noSideScroll } from './helpers.mjs';
import { RATES, BILL, NOT } from './rates.cases.mjs';
import * as FACTS from './facts.cases.mjs';

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

test.describe('B · fact checker for free model text', () => {
  test('no false statement about tax, check-out, check-in, refunds, compensation, payment, keys or inclusions passes; true ones are counted', async ({ page }, info) => {
    await open(page, 'index.html', 'en');
    const bad = FACTS.FALSE_EN.concat(FACTS.FALSE_AR), good = FACTS.TRUE_EN.concat(FACTS.TRUE_AR);
    expect(FACTS.FALSE_EN.length).toBeGreaterThanOrEqual(20); expect(FACTS.FALSE_AR.length).toBeGreaterThanOrEqual(20); expect(good.length).toBeGreaterThanOrEqual(20);
    const out = await page.evaluate(([bad, good, plain]) => {
      const { check } = window.SILA.facts;
      const said = ['مدّدت مغادرتك ساعة إلى 1:00 ظهراً.', 'واعتذاراً عن الإزعاج عوّضتك بمبلغ 150.00 ر.س يُعاد إلى وسيلة الدفع نفسها.'];
      return {
        leaked: bad.filter(s => check(s, {}).ok), refused: good.filter(s => !check(s, {}).ok), plain: plain.filter(s => !check(s, {}).ok),
        /* what is paid is read from the booking, never taken from a model */
        paid: [check('Your stay is already paid.', { paid: true }).ok, check('Your stay is already paid.', { paid: false }).ok, check('Your stay is already paid.', {}).ok, check('إقامتك غير مدفوعة.', { paid: false }).ok, check('إقامتك غير مدفوعة.', { paid: true }).ok],
        /* a closing reply may reword what the hotel's code said in this turn, and may add no number to it */
        backed: [check('مدّدنا مغادرتك إلى 1:00 ظهراً، وعوّضناك بمبلغ 150.00 ر.س.', { said }).ok, check('مدّدنا مغادرتك إلى 3:00 عصراً.', { said }).ok, check('عوّضناك بمبلغ 900 ر.س.', { said }).ok, check('عوّضناك بمبلغ 150.00 ر.س.', {}).ok]
      };
    }, [bad, good, FACTS.PLAIN]);
    expect(out.leaked).toEqual([]);
    expect(out.plain).toEqual([]);
    expect(out.paid).toEqual([true, false, false, true, false]);
    expect(out.backed).toEqual([true, false, false, false]);
    info.annotations.push({ type: 'true statements refused', description: out.refused.length + ' of ' + good.length + (out.refused.length ? ': ' + out.refused.join(' | ') : '') });
    console.log('fact checker: ' + bad.length + ' false statements, 0 passed; ' + out.refused.length + ' of ' + good.length + ' true statements refused' + (out.refused.length ? ':\n  ' + out.refused.join('\n  ') : ''));
    expect(out.refused.length).toBeLessThanOrEqual(Math.floor(good.length / 10));      // it errs towards refusing, but not by much
  });

  for (const lang of LANGS) {
    test('a false fact from a model never reaches the guest, a policy question is answered by the code, and the hotel’s own sentences pass · ' + lang, async ({ page }) => {
      const errors = watch(page);
      const lies = lang === 'en' ? ['Good news: the nightly rate includes 15% VAT.', 'Check-out is at 2:00 PM and breakfast is included in your stay.', 'Refunds are automatic once you ask.']
        : ['سعر الليلة يشمل ضريبة القيمة المضافة.', 'المغادرة الساعة 2:00 ظهراً والإفطار مشمول ضمن الإقامة.', 'الاسترجاع تلقائي بمجرد طلبك.'];
      let n = 0;
      const calls = await playModel(page, () => replyOf(lies[n]));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      for (n = 0; n < lies.length; n++) {
        await ask(page, T(lang, 'عندي موضوع رقم ' + (n + 1) + ' أبي أتكلم فيه', 'I have matter number ' + (n + 1) + ' to talk about'));
        await expect(page.locator('#feed')).not.toContainText(lies[n]);
        await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));
      }
      const sent = calls.filter(c => c.task === 'agent');
      expect(sent.length).toBe(lies.length);                                           // a discarded answer does not put the model to rest
      /* the policy sentences the model is given are the ones the checker allows */
      const refusedPolicies = await page.evaluate(list => list.filter(s => !window.SILA.facts.check(s, {}).ok), sent[0].input.hotel.policies);
      expect(refusedPolicies).toEqual([]);
      /* tax, check-out time and the refund policy: the code answers with the hotel's sentence, and no model is asked */
      for (const [q, part] of [[T(lang, 'هل السعر يشمل الضريبة؟', 'Does the price include VAT?'), '15%'], [T(lang, 'متى موعد المغادرة؟', 'What time is check-out?'), '12:00']]) {
        await ask(page, q);
        await expect(page.locator('#feed .m.bot').last()).toContainText(part);
        await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));
      }
      expect(calls.filter(c => c.task === 'agent').length).toBe(lies.length);
      /* a true answer from the model is shown as it is */
      const fine = T(lang, 'الإجمالي يشمل ضريبة القيمة المضافة 15%، وأقرب المعالم برج المملكة.', 'Your total includes 15% VAT, and the nearest landmark is Kingdom Centre Tower.');
      lies.push(fine);
      await ask(page, T(lang, 'عندي سؤال أخير لو تكرمت', 'One last question, if I may'));
      await expect(page.locator('#feed .m.bot').last()).toHaveText(fine);
      if (lang === 'en') await noArabic(page);
      expect(errors).toEqual([]);
    });
  }
});
