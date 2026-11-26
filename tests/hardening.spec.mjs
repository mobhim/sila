/* Hardening of the agent: what a model writes is checked before a guest reads it, what a model proposes is confirmed before it
   changes anything, one message can hold several requests, and a failing tool does not break the turn.
   No real model is used: the tests answer the API address themselves. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, bookingOf, arrive, ask, idle, lastTrail, showScreen, playModel, modelReady } from './helpers.mjs';
import { FALSE_AR, FALSE_EN, FINE_AR, FINE_EN } from './claims.cases.mjs';

const A = '1087654321';
const OLD = { tool: 'none', items: [], via: null, kind: null, scope: null, requested: null, note: '', reply: '' };

test.describe('A · claim checker', () => {
  test('every false claim is caught, in Arabic and in English, and honest sentences pass', async ({ page }) => {
    await open(page, 'index.html', 'en');
    expect(FALSE_AR.length).toBeGreaterThanOrEqual(30); expect(FALSE_EN.length).toBeGreaterThanOrEqual(30);
    const out = await page.evaluate(([bad, fine]) => {
      const { check } = window.SILA.claims;
      const done = tool => [{ tool, result: { ok: true } }];
      return {
        leaked: bad.filter(s => check(s, []).ok),
        refused: fine.filter(s => !check(s, []).ok),
        /* a denied, declined or waiting step backs nothing */
        notBacked: [check('I moved you to suite 414.', [{ tool: 'move_room', result: { ok: false, denied: true } }]).ok, check('تم نقلك.', [{ tool: 'move_room', result: { ok: false, declined: true } }]).ok,
          check('Your refund has been approved.', [{ tool: 'request_staff_approval', result: { ok: false } }]).ok, check('I extended your checkout.', [{ tool: 'open_ticket', result: { ok: true } }]).ok],
        /* the same words are true once the tool has run */
        backed: [check('I moved you to suite 414.', done('move_room')).ok, check('مدّدت مغادرتك ساعة.', done('late_checkout')).ok, check('فتحت لك بلاغ صيانة عاجل.', done('open_ticket')).ok,
          check('I extended your checkout and opened a ticket.', [{ tool: 'late_checkout', result: { ok: true } }, { tool: 'open_ticket', result: { ok: true } }]).ok,
          check('The refund was approved by staff.', [{ tool: 'request_staff_approval', approved: true, result: { ok: true } }]).ok],
        price: check('I applied a discount to your bill.', done('compensate')).ok      // no tool changes a price, so nothing ever backs this
      };
    }, [FALSE_AR.concat(FALSE_EN), FINE_AR.concat(FINE_EN)]);
    expect(out.leaked).toEqual([]);
    expect(out.refused).toEqual([]);
    expect(out.notBacked).toEqual([false, false, false, false]);
    expect(out.backed).toEqual([true, true, true, true, true]);
    expect(out.price).toBe(false);
  });

  for (const lang of LANGS) {
    test('a model that says it acted, when nothing ran, never reaches the guest · ' + lang, async ({ page }) => {
      const errors = watch(page);
      const lies = (lang === 'en' ? FALSE_EN : FALSE_AR).filter((s, i) => i % 6 === 0);
      let n = 0;
      const calls = await playModel(page, () => Object.assign({}, OLD, { reply: lies[n] }));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      const before = await bookingOf(page, lang, A);
      for (n = 0; n < lies.length; n++) {
        await ask(page, T(lang, 'عندي موضوع رقم ' + (n + 1) + ' أبي أتكلم فيه', 'I have matter number ' + (n + 1) + ' to talk about'));
        await expect(page.locator('#feed')).not.toContainText(lies[n]);
        await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));      // the rules answered in the same turn
      }
      expect(calls.filter(c => c.task === 'agent').length).toBe(lies.length);          // a discarded answer does not put the model to rest
      const after = await bookingOf(page, lang, A);
      expect([after.refunded, after.room, after.late, after.comp]).toEqual([before.refunded, before.room, before.late, before.comp]);
      expect((await readStore(page, lang)).trail.filter(e => e.brain === 'model').length).toBe(0);
      expect(errors).toEqual([]);
    });
  }
});

for (const lang of LANGS) {
  test.describe('B · confirm before a model-proposed change · ' + lang, () => {
    test('a move the guest never asked for does not happen; no drops it, yes sends it through the permission engine', async ({ page }) => {
      const errors = watch(page);
      let next = { tool: 'move_room' };
      const calls = await playModel(page, () => Object.assign({}, OLD, next));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);

      await ask(page, T(lang, 'الغرفة حلوة بس الإطلالة عادية', 'The room is nice but the view is plain'));
      expect((await bookingOf(page, lang, A)).room).toBe('412');                       // nothing ran
      await expect(lastTrail(page).locator('li .tag.ask')).toHaveCount(1);
      await expect(page.locator('#feed .m.bot').last()).toContainText('414');          // the one fixed sentence names the action
      await expect(page.locator('#feed .m.bot').last()).toContainText(T(lang, '«نعم»', '“yes”'));
      await ask(page, T(lang, 'لا', 'no'));
      expect((await bookingOf(page, lang, A)).room).toBe('412');
      await showScreen(page);
      await expect(page.locator('#panel [data-v="yes"]')).toHaveCount(0);

      await ask(page, T(lang, 'يعني الإطلالة ما عجبتني صراحة', 'Honestly the view is not what I hoped for'));
      await showScreen(page);
      await page.locator('#panel [data-v="yes"]').click();                             // the same answer, from the screen
      await idle(page);
      expect((await bookingOf(page, lang, A)).room).toBe('414');
      await expect(lastTrail(page).locator('li .tag.limit')).toHaveCount(1);           // allowed by a switch the hotel controls
      await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));

      next = { tool: 'open_ticket', kind: 'maint', note: T(lang, 'المكيف لا يبرد', 'AC not cooling') };      // a ticket needs no confirmation
      await ask(page, T(lang, 'الجو حار داخل الجناح', 'It is hot inside the suite'));
      await expect(lastTrail(page).locator('li .tag.ask')).toHaveCount(0);
      expect((await readStore(page, lang)).tickets.length).toBe(1);

      next = { tool: 'late_checkout' };
      await ask(page, T(lang, 'طيارتي بكرة العصر', 'My flight is tomorrow afternoon'));
      expect((await bookingOf(page, lang, A)).late).toBe(false);
      await ask(page, T(lang, 'نعم', 'yes'));
      expect((await bookingOf(page, lang, A)).late).toBe(true);
      expect(calls.filter(c => c.task === 'agent').length).toBe(4);                    // a bare yes or no is never sent to a model
      expect(errors).toEqual([]);
    });

    test('a confirmed call is still decided by the engine: with the switch off it waits for staff', async ({ page }) => {
      await playModel(page, () => Object.assign({}, OLD, { tool: 'late_checkout' }));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.perms.late = false; localStorage.setItem(k, JSON.stringify(s)); }, lang === 'en' ? 'miftah.sim.v4.en' : 'miftah.sim.v4');
      await page.reload();
      await showScreen(page); await modelReady(page);
      await page.locator('#ctaTry').click();
      for (const d of A) await page.locator('.keypad [data-k="' + d + '"]').click();
      await expect(page.locator('#probText')).toBeVisible();
      await ask(page, T(lang, 'عندي رحلة متأخرة بكرة', 'I have a late flight tomorrow'));
      await ask(page, T(lang, 'نعم', 'yes'), { pending: true });
      await expect.poll(async () => (await readStore(page, lang)).approvals.length).toBe(1);
      expect((await bookingOf(page, lang, A)).late).toBe(false);
    });
  });
}
