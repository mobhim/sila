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

test.describe('D · vague requests', () => {
  test('the rules ask what is meant when nothing says it, take up an earlier turn that was left undone, and open nothing twice', async ({ page }) => {
    await open(page, 'index.html', 'en');
    const out = await page.evaluate(() => {
      const R = window.SILA.brains.rules, perms = { reissue: true, ticket: true, move: true, late: true, limit: 150 };
      const state = pending => ({ stage: 'stay', pending: pending || null, booking: { room: '412', key: 'code', paid: true, arrived: true, alt: '414' }, perms });
      const next = (text, history, pending) => { const a = R.next({ input: { type: 'text', text, at: 'stay' }, state: state(pending), steps: [], history: history || [] }); return a.tool ? a.tool + ':' + (a.args.text || a.args.kind || '') : a.say + ':' + (a.text || ''); };
      const VAGUE = ['fix it', 'Fix it!', 'صلحوها', 'do it', 'help', 'help me please', 'ساعدوني', 'عندي مشكلة', 'do something', 'sort it out', 'it\'s not working', 'خربان', 'I need help', 'سووها الحين', 'أبي مساعدة', 'please fix this'];
      const CLEAR = ['fix the AC', 'صلحوا المكيف', 'the TV is not working', 'المكيف خربان', 'I need help with my towels', 'change my room', 'do a late checkout for me'];
      const undone = [{ heard: 'The AC is not cooling', said: 'Something went wrong on our side.', did: ['open_ticket:no'] }], done = [{ heard: 'The AC is not cooling', said: 'I opened a ticket.', did: ['open_ticket:ok'] }];
      return {
        asked: VAGUE.filter(t => next(t) !== 'clarify:vague'), wrongly: CLEAR.filter(t => next(t) === 'clarify:vague'),
        undone: next('fix it', undone), done: next('صلحوها', done),
        old: next('fix it', [Object.assign({ at: Date.now() - 11 * 60000 }, undone[0])]),          // an earlier turn is something to point to for ten minutes
        pressed: next('fix it', [Object.assign({ typed: false }, undone[0])]),                       // a button the guest pressed is not something "it" can mean
        chatter: next('fix it', [{ heard: 'thanks a lot', said: 'You are welcome.', did: [] }]),
        yes: next('do it', [], 'move_offer')                                                         // an offer on the table: "do it" is a yes
      };
    });
    expect(out.asked).toEqual([]);
    expect(out.wrongly).toEqual([]);
    expect(out.undone).toBe('open_ticket:The AC is not cooling');
    expect(out.done).toBe('followup:maint');
    expect([out.old, out.pressed, out.chatter]).toEqual(['clarify:vague', 'clarify:vague', 'clarify:vague']);
    expect(out.yes).toBe('move_room:');
  });

  for (const lang of LANGS) {
    test('“fix it” opens no ticket: the guest is asked, by the rules and with a model on · ' + lang, async ({ page }) => {
      const errors = watch(page);
      let answer = planOf(ACT('open_ticket', { kind: 'maint', note: 'Fix it' }));                  // what a model did with these words in the evaluation
      const calls = await playModel(page, () => answer);
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      const what = T(lang, 'ما المطلوب بالضبط؟', 'What exactly do you need?');
      for (const q of T(lang, ['صلحوها', 'عندي مشكلة'], ['Fix it', 'do something'])) {
        await ask(page, q);
        await expect(page.locator('#feed .m.bot').last()).toContainText(what);
        await expect(lastTrail(page).locator('.trail-got')).toContainText(T(lang, 'رسالة تحتاج توضيحاً', 'A message that needs clarifying'));
      }
      expect(calls.filter(c => c.task === 'agent').length).toBe(0);                    // nothing for a model to read
      expect((await readStore(page, lang)).tickets.length).toBe(0);
      /* now a turn that says what "it" is: the model reads the next vague message together with it */
      answer = planOf(ACT('open_ticket', { kind: 'maint', note: T(lang, 'التلفزيون لا يعمل', 'TV not working') }));
      await ask(page, T(lang, 'التلفزيون ما يشتغل أبداً', 'The TV does not turn on at all'));
      await expect.poll(async () => (await readStore(page, lang)).tickets.length).toBe(1);
      answer = replyOf(T(lang, 'بلاغ التلفزيون عند فريق الصيانة الآن.', 'The TV ticket is with the maintenance team now.'));
      const before = calls.filter(c => c.task === 'agent').length;
      await ask(page, T(lang, 'صلحوها', 'fix it'));
      const sent = calls.filter(c => c.task === 'agent');
      expect(sent.length).toBe(before + 1);
      expect(JSON.stringify(sent[sent.length - 1].input.history)).toContain(T(lang, 'التلفزيون', 'TV'));
      expect((await readStore(page, lang)).tickets.length).toBe(1);
      if (lang === 'en') await noArabic(page);
      expect(errors).toEqual([]);
    });

    test('with no model, an earlier turn says what “it” is: nothing is opened twice, in the chat window too · ' + lang, async ({ page }) => {
      await open(page, 'index.html', lang);
      await arrive(page, A);
      await ask(page, T(lang, 'المكيف لا يبرّد', 'The AC is not cooling'));
      await expect.poll(async () => (await readStore(page, lang)).tickets.length).toBe(1);
      await ask(page, T(lang, 'لا', 'no'));                                              // the offered move is declined
      await ask(page, T(lang, 'المكيف لا يبرّد أبداً', 'The AC is still not cooling'));
      await expect.poll(async () => (await readStore(page, lang)).tickets.length).toBe(2);
      await ask(page, T(lang, 'صلحوها', 'fix it'));
      await expect(page.locator('#feed .m.bot').last()).toContainText(T(lang, 'طلبك السابق (بلاغ العطل) مسجّل', 'Your earlier request (the fault report) is registered'));
      expect((await readStore(page, lang)).tickets.length).toBe(2);
      await page.locator('#helpFab').click();
      await chatSend(page, A);
      await expect(chatLast(page)).toContainText('412');
      await chatSend(page, T(lang, 'عندي مشكلة', 'do something'));
      await expect(chatLast(page)).toContainText(T(lang, 'ما المطلوب بالضبط؟', 'What exactly do you need?'));
      expect((await readStore(page, lang)).tickets.length).toBe(2);
    });
  }
});

for (const lang of LANGS) {
  test.describe('E · trail wording for a held action · ' + lang, () => {
    test('a held action reads “waiting for the guest to confirm”, never “allowed”, and takes its real verdict when the guest answers; the console and the export agree', async ({ context, page }) => {
      const errors = watch(page);
      let next = planOf(ACT('late_checkout'));
      await playModel(page, () => next);
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang, '#trail');
      await arrive(page, A);
      const WAIT = T(lang, 'بانتظار تأكيد النزيل', 'Waiting for the guest to confirm');
      const held = async tool => (await readStore(page, lang)).trail.find(e => e.tool === tool && e.held);

      await ask(page, T(lang, 'عندي رحلة متأخرة بكرة', 'I have a late flight tomorrow'));
      await expect(lastTrail(page).locator('li .tag.ask')).toHaveText(WAIT);
      await expect(lastTrail(page).locator('li small')).toContainText(WAIT);
      let e = await held('late_checkout');
      expect([e.verdict, e.status, e.tag, e.tier]).toEqual(['held', 'waiting_guest', 'ask', '']);      // not "allow": nothing was decided to run
      expect((await bookingOf(page, lang, A)).late).toBe(false);
      await expect(admin.locator('#trail li').first()).toContainText(WAIT);
      await expect(admin.locator('#trail li').first().locator('.tag.ask')).toHaveText(WAIT);
      const exported = async () => {
        const [download] = await Promise.all([admin.waitForEvent('download'), admin.locator('#exportLog').click()]);
        const fs = await import('node:fs');
        return JSON.parse(fs.readFileSync(await download.path(), 'utf8')).trail;
      };
      let x = (await exported()).find(v => v.tool === 'late_checkout' && v.held);
      expect(x.verdict).toBe('held'); expect(x.state).toContain(WAIT);

      await ask(page, T(lang, 'نعم', 'yes'));                                            // the guest confirms: the same entry now carries what the engine decided
      expect((await bookingOf(page, lang, A)).late).toBe(true);
      e = await held('late_checkout');
      expect([e.verdict, e.status, e.tag]).toEqual(['allow', 'confirmed', 'limit']);
      await expect(admin.locator('#trail li').filter({ hasText: T(lang, 'أكّده النزيل', 'Confirmed by the guest') })).toHaveCount(1);
      x = (await exported()).find(v => v.tool === 'late_checkout' && v.held);
      expect(x.verdict).toBe('allow'); expect(x.state).toContain(T(lang, 'أكّده النزيل', 'Confirmed by the guest')); expect(x.state).not.toContain(WAIT);

      next = planOf(ACT('move_room'));                                                 // the guest says no: cancelled, and nothing moved
      await ask(page, T(lang, 'الغرفة ما عجبتني كثير', 'I do not like this room much'));
      expect((await held('move_room')).status).toBe('waiting_guest');
      await ask(page, T(lang, 'لا', 'no'));
      e = await held('move_room');
      expect([e.verdict, e.status, e.tag]).toEqual(['cancelled', 'cancelled', 'no']);
      expect((await bookingOf(page, lang, A)).room).toBe('412');
      await expect(admin.locator('#trail li').filter({ hasText: T(lang, 'ألغاه النزيل', 'Cancelled by the guest') })).toHaveCount(1);

      next = planOf(ACT('compensate'));                                                // the guest writes something else instead of answering: it lapses
      await ask(page, T(lang, 'الإزعاج كان كثير أمس', 'There was a lot of noise yesterday'));
      expect((await held('compensate')).status).toBe('waiting_guest');
      next = replyOf(T(lang, 'أهلاً بك، في خدمتك.', 'You are welcome, glad to help.'));
      await ask(page, T(lang, 'خلاص شكراً يعطيك العافية', 'never mind, thank you very much'));
      e = await held('compensate');
      expect([e.verdict, e.status]).toEqual(['lapsed', 'lapsed']);
      expect((await bookingOf(page, lang, A)).comp).toBe(0);
      expect((await readStore(page, lang)).trail.some(v => v.held && v.verdict === 'allow' && v.status !== 'confirmed')).toBe(false);      // no held entry ever reads "allowed" before a yes
      if (lang === 'en') { await noArabic(page); await noArabic(admin); }
      expect(errors).toEqual([]);
    });
  });
}

/* the guest writes in the other language than the page's: `page` is the page language, the guest writes in `other` */
for (const lang of LANGS) {
  const other = lang === 'ar' ? 'en' : 'ar', G = (ar, en) => (other === 'en' ? en : ar), AR = /[ء-ي]/;
  test.describe('F · the reply follows the guest’s language · ' + (other === 'en' ? 'English on the Arabic page' : 'Arabic on the English page'), () => {
    test('clarify, a refusal, a vague request and a policy answer come in the guest’s language; the hotel’s log stays in the page’s', async ({ page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      await arrive(page, A);
      const last = page.locator('#feed .m.bot').last();
      const reads = async part => { await expect(last).toContainText(part); expect(AR.test(await last.textContent())).toBe(other === 'ar'); };
      await ask(page, G('انقلني لغرفة ثانية بس لا تغيرون غرفتي', 'Move me to another room but do not change my room'));
      await reads(G('في رسالتك طلب وعكسه: تغيير الغرفة', 'Your message both asks for and rules out the room change'));
      await ask(page, G('افتح الغرفة 915', 'Open room 915'));
      await reads(G('هذا ممنوع دائماً', 'Anything else is never allowed'));
      await ask(page, G('صلحوها', 'fix it'));
      await reads(G('ما المطلوب بالضبط؟', 'What exactly do you need?'));
      await ask(page, G('متى موعد المغادرة؟', 'What time is check-out?'));
      await reads('12:00');
      await ask(page, G('أخروا لي المغادرة', 'I would like a late checkout'));
      await reads(G('مدّدت مغادرتك ساعة', 'I extended your checkout by one hour'));
      /* what the hotel's staff read is still in the page's language */
      const s = await readStore(page, lang);
      expect(s.log.slice(0, 4).every(e => AR.test(e.text) === (lang === 'ar'))).toBe(true);
      /* and when the guest switches back, so does the agent */
      await ask(page, T(lang, 'صلحوها', 'do something'));
      await expect(last).toContainText(T(lang, 'طلبك السابق', 'Your earlier request'));      // (the late checkout just above is what “it” points to)
      expect(AR.test(await last.textContent())).toBe(lang === 'ar');
      await noSideScroll(page);
      expect(errors).toEqual([]);
    });

    test('with a model: the question before a change is asked in the guest’s language, the model is told that language, and a reply in the wrong one is not shown', async ({ page }) => {
      let next = planOf(ACT('late_checkout'));
      const calls = await playModel(page, () => next);
      await open(page, 'index.html', lang);
      await showScreen(page); await modelReady(page);
      await arrive(page, A);
      const last = page.locator('#feed .m.bot').last();
      await ask(page, G('عندي رحلة متأخرة بكرة', 'I have a late flight tomorrow'));
      await expect(last).toContainText(G('قبل أن أنفّذ: هل تريد تأخير مغادرتك ساعة', 'Before I act: do you want'));
      expect(AR.test(await last.textContent())).toBe(other === 'ar');
      expect(calls[calls.length - 1].lang).toBe(other);                                 // the server is told the guest's language, not the page's
      await ask(page, G('لا', 'no'));
      await expect(last).toContainText(G('تمام، لم أنفّذ شيئاً', 'All right, I did not do anything'));
      /* the evaluation's case: a clarifying question in Arabic for an English message. The page asks its own question instead. */
      next = planOf(ACT('clarify', { question: G('Would you like to move or to stay in your room?', 'هل تريد الانتقال إلى غرفة أخرى أم تفضل البقاء في غرفتك الحالية؟') }));
      await ask(page, G('انقلني لغرفة ثانية بس لا تغيرون غرفتي', 'Move me to another room but do not change my room'));
      await expect(last).toContainText(G('في رسالتك طلب وعكسه', 'Your message both asks for and rules out'));
      await expect(lastTrail(page).locator('.trail-head small')).toHaveText(T(lang, 'عقل القواعد', 'Rules brain'));
      /* a reply in the guest's language is shown as it is */
      const fine = G('أقرب المعالم في بيانات الفندق برج المملكة.', 'The nearest landmark in the hotel data is Kingdom Centre Tower.');
      next = replyOf(fine);
      await ask(page, G('وش أقرب المعالم للفندق؟', 'What landmarks are near the hotel?'));
      await expect(last).toHaveText(fine);
      expect((await bookingOf(page, lang, A)).late).toBe(false);
    });
  });
}
