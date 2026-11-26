/* Hardening of the agent: what a model writes is checked before a guest reads it, what a model proposes is confirmed before it
   changes anything, one message can hold several requests, and a failing tool does not break the turn.
   No real model is used: the tests answer the API address themselves. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, bookingOf, arrive, ask, idle, lastTrail, showScreen, playModel, modelReady, ACT, planOf, replyOf, takeOver, enterNumber, sendRequests } from './helpers.mjs';
import { FALSE_AR, FALSE_EN, FINE_AR, FINE_EN } from './claims.cases.mjs';

const A = '1087654321';

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
      const calls = await playModel(page, () => replyOf(lies[n]));
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
      let next = planOf(ACT('move_room'));
      const calls = await playModel(page, () => next);
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

      next = planOf(ACT('open_ticket', { kind: 'maint', note: T(lang, 'المكيف لا يبرد', 'AC not cooling') }));      // a ticket needs no confirmation
      await ask(page, T(lang, 'الجو حار داخل الجناح', 'It is hot inside the suite'));
      await expect(lastTrail(page).locator('li .tag.ask')).toHaveCount(0);
      expect((await readStore(page, lang)).tickets.length).toBe(1);

      next = planOf(ACT('late_checkout'));
      await ask(page, T(lang, 'طيارتي بكرة العصر', 'My flight is tomorrow afternoon'));
      expect((await bookingOf(page, lang, A)).late).toBe(false);
      await ask(page, T(lang, 'نعم', 'yes'));
      expect((await bookingOf(page, lang, A)).late).toBe(true);
      expect(calls.filter(c => c.task === 'agent').length).toBe(4);                    // a bare yes or no is never sent to a model
      expect(errors).toEqual([]);
    });

    test('a confirmed call is still decided by the engine: with the switch off it waits for staff', async ({ page }) => {
      await playModel(page, () => planOf(ACT('late_checkout')));
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

for (const lang of LANGS) {
  test.describe('C · one message, several actions · ' + lang, () => {
    const THREE = T(lang, 'المكيف خربان وأبي مناشف إضافية وأخروا لي المغادرة', 'The AC is broken, I need extra towels, and give me a late checkout');

    test('a plan of three: each action is decided on its own and shows in the trail', async ({ page }) => {
      const errors = watch(page);
      const calls = await playModel(page, () => planOf(
        ACT('open_ticket', { kind: 'maint', note: T(lang, 'المكيف لا يعمل', 'AC not working') }),
        ACT('route_request', { items: [{ request: T(lang, 'مناشف إضافية', 'Extra towels'), dept: 'housekeeping' }] }),
        ACT('late_checkout')));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      await ask(page, THREE);
      const s = await readStore(page, lang), b = s.bookings.find(v => v.id === A);
      expect(s.tickets.length).toBe(1);                                                // the ticket ran
      expect(b.requests).toContain(T(lang, 'مناشف إضافية', 'Extra towels'));           // the request ran
      expect(b.late).toBe(false);                                                      // the late checkout waits for a yes
      await expect(lastTrail(page).locator('li .tag.ask')).toHaveCount(1);
      expect(await lastTrail(page).locator('li').count()).toBeGreaterThanOrEqual(3);
      await expect(lastTrail(page).locator('.trail-got')).toContainText(T(lang, 'عطل في الغرفة، طلبات للإقامة، يطلب تأخير المغادرة', 'A fault in the room, Requests for the stay, Asks for a late checkout'));
      await ask(page, T(lang, 'نعم', 'yes'));
      expect((await bookingOf(page, lang, A)).late).toBe(true);
      expect(calls.filter(c => c.task === 'agent').length).toBe(1);
      expect(errors).toEqual([]);
    });

    test('a refused action and a declined one do not stop the rest of the plan', async ({ context, page }) => {
      await playModel(page, () => planOf(ACT('issue_key', { via: 'sms' }), ACT('change_price'), ACT('request_staff_approval'), ACT('open_ticket', { kind: 'clean' }), ACT('get_rates', { scope: 'tonight' })));
      await open(page, 'index.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);
      await showScreen(page); await modelReady(page);
      await takeOver(page); await enterNumber(page, A); await sendRequests(page, '');      // arrived, not paid: no key, nothing to refund
      await ask(page, T(lang, 'عندي كم طلب مع بعض', 'I have a few things at once'));
      const s = await readStore(page, lang);
      expect(s.tickets.length).toBe(1);                                                // the fourth action ran after two refusals and a third one that could not
      await expect(lastTrail(page).locator('li .tag.never')).toHaveCount(1);           // the price change, refused in code
      expect(await lastTrail(page).locator('li .tag.no').count()).toBeGreaterThanOrEqual(2);      // no key and no refund before payment
      expect(s.trail.filter(e => e.turn === s.trail[0].turn && e.tool === 'get_rates').length).toBe(0);              // a fifth action is not part of a plan
      expect(s.bookings.find(v => v.id === A).key).toBeFalsy();
    });

    test('staff decline one action; the next one still runs', async ({ context, page }) => {
      await playModel(page, () => planOf(ACT('request_staff_approval'), ACT('route_request', { items: [{ request: T(lang, 'وسادة إضافية', 'Extra pillow'), dept: 'housekeeping' }] })));
      await open(page, 'index.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      await ask(page, T(lang, 'رجعوا فلوسي وجيبوا لي وسادة', 'Give me my money back and bring me a pillow'), { pending: true });
      await admin.locator('#appr .ghost-btn.nope').click();
      await idle(page);
      const b = await bookingOf(page, lang, A);
      expect(b.refunded).toBe(false);
      expect(b.requests).toContain(T(lang, 'وسادة إضافية', 'Extra pillow'));
    });

    test('clarify: a contradictory message gets one question and nothing runs', async ({ page }) => {
      const q = T(lang, 'تبغى أنقلك لغرفة ثانية أو تبقى في غرفتك؟', 'Do you want me to move you, or keep your room?');
      let next = planOf(ACT('clarify', { question: q }));
      await playModel(page, () => next);
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      await ask(page, T(lang, 'انقلني لغرفة ثانية بس لا تغيرون غرفتي', 'Move me to another room but do not change my room'));
      await expect(page.locator('#feed .m.bot').last()).toHaveText(q);
      await expect(lastTrail(page).locator('.trail-got')).toContainText(T(lang, 'رسالة تحتاج توضيحاً', 'A message that needs clarifying'));
      await expect(lastTrail(page).locator('li')).toHaveCount(0);
      expect((await bookingOf(page, lang, A)).room).toBe('412');
      next = planOf(ACT('clarify', { question: T(lang, 'نقلتك إلى الجناح 414، تمام؟ وهل تبي شي ثاني', 'I moved you to suite 414. Anything else') }));      // a "question" that reports an action is thrown away
      await ask(page, T(lang, 'انقلني لغرفة ثانية بس لا تغيرون غرفتي', 'Move me to another room but do not change my room'));
      await expect(page.locator('#feed')).not.toContainText(T(lang, 'نقلتك إلى الجناح 414', 'I moved you to suite 414'));
      expect((await bookingOf(page, lang, A)).room).toBe('412');
    });

    test('an answer in the older single-tool shape is still understood', async ({ page }) => {
      await playModel(page, () => ({ tool: 'open_ticket', items: [], via: null, kind: 'clean', scope: null, requested: null, note: '', reply: '' }));
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      await ask(page, T(lang, 'الحمام يحتاج ترتيب', 'The bathroom needs tidying'));
      expect((await readStore(page, lang)).tickets.length).toBe(1);
    });

    test('the rules brain alone: it does one thing, names what it left, and asks about a contradiction', async ({ page }) => {
      await open(page, 'index.html', lang);
      await arrive(page, A);
      await ask(page, THREE);
      const b = await bookingOf(page, lang, A);
      expect(b.late).toBe(true);
      const said = page.locator('#feed .m.bot').last();
      await expect(said).toContainText(T(lang, 'بلاغ العطل', 'the fault report'));
      await expect(said).toContainText(T(lang, 'طلبات الإقامة', 'the requests for your stay'));
      await ask(page, T(lang, 'انقلني لغرفة ثانية بس لا تغيرون غرفتي', 'Move me to another room but do not change my room'));
      await expect(page.locator('#feed .m.bot').last()).toContainText(T(lang, 'طلب وعكسه', 'both asks for and rules out'));
      expect((await bookingOf(page, lang, A)).room).toBe('412');
      await ask(page, T(lang, 'انقلني لغرفة ثانية', 'Move me to another room'));           // a clear request, proposed by the rules: it runs as before
      expect((await bookingOf(page, lang, A)).room).toBe('414');
    });
  });
}
