/* Sila and the partner hotel system: two stores, one connector, changes flowing both ways between the open pages. */
import { test, expect } from '@playwright/test';
import { LANGS, T, watch, open, readStore, readPartner, bookingOf, noArabic, noSideScroll, takeOver, enterNumber, sendRequests, pay, pickKey, arrive, ask, showScreen } from './helpers.mjs';

const A = '1087654321', B = '2456701938';
const syncKey = lang => 'sila.sync.v1' + (lang === 'en' ? '.en' : '');
const readSync = (page, lang) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), syncKey(lang));
const codes = async (page, lang) => (await readSync(page, lang)).log.map(e => e.code);

for (const lang of LANGS) {
  test.describe('partner → agent · ' + lang, () => {
    test('a rate, a room state and a booking changed at the partner reach the guest screen at once', async ({ context, page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      const partner = await context.newPage(); const perr = watch(partner);
      await open(partner, 'partner.html', lang);

      await takeOver(page);
      await enterNumber(page, A);
      await sendRequests(page, '');
      await showScreen(page);
      await expect(page.locator('#panel dl.bill dd').first()).toContainText('850');
      await partner.locator('#pRate0').fill('1000');                                  // Royal Suite: 850 -> 1000
      await partner.locator('#pRate0').press('Tab');
      await expect(page.locator('#panel dl.bill dd').first()).toContainText('1,000');     // the bill on screen is recalculated by code
      expect((await readStore(page, lang)).rooms.filter(r => r.rate === 1000).length).toBe(2);

      await partner.locator('#pRows tr').first().locator('select').selectOption('414');   // the partner moves the booking
      await expect(page.locator('#idrm')).toHaveText('414');
      expect((await bookingOf(page, lang, A)).room).toBe('414');
      await pay(page);
      await pickKey(page, 'sms');
      await expect(page.locator('#feed .m.keymsg')).toContainText('414');
      const b = await bookingOf(page, lang, A);
      expect(Math.round(b.rateBase)).toBe(1000);

      expect(await codes(page, lang)).toEqual(expect.arrayContaining(['in.room_rate', 'in.booking_room', 'out.check_in']));
      if (lang === 'en') { await noArabic(page); await noArabic(partner); }
      await noSideScroll(partner);
      expect(errors).toEqual([]); expect(perr).toEqual([]);
    });

    test('the partner marks the room ready and the waiting guest moves on; a new partner booking can check in; a cancelled one is gone', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const partner = await context.newPage();
      await open(partner, 'partner.html', lang);
      await takeOver(page);
      await enterNumber(page, B);                                                     // room 207, being prepared
      await sendRequests(page, '');
      await page.locator('#panel [data-v="wait"]').click();
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'wait');
      const tile = partner.locator('#pRooms .rm', { hasText: '207' });
      await tile.click();                                                             // -> maintenance: still no key
      await expect.poll(async () => (await readStore(page, lang)).rooms.find(r => r.no === '207').state).toBe('maint');
      await expect(page.locator('#stage')).toHaveAttribute('data-phase', 'wait');
      await tile.click();                                                             // -> ready
      await pay(page);
      await pickKey(page, 'card');

      await partner.locator('#pName').fill('Layla Test');
      await partner.locator('#pId').fill('1555555555');
      await partner.locator('#pPhone').fill('0555555555');
      await partner.locator('#pRoom').selectOption('917');
      await partner.locator('#pAdd button[type="submit"]').click();
      await expect.poll(async () => (await readStore(page, lang)).bookings.length).toBe(5);
      await showScreen(page);
      await page.locator('#resetStage').click();
      await enterNumber(page, '1555555555');
      await sendRequests(page, '');
      await showScreen(page);
      await expect(page.locator('#panel dl.bill')).toBeVisible();
      await expect.poll(async () => (await readPartner(partner, lang)).bookings.find(b => b.id === '1555555555').checkedInAt).toBeTruthy();

      await partner.locator('#pRows tr', { hasText: '1190283746' }).locator('.ghost-btn').click();     // the partner cancels a booking
      await expect.poll(async () => (await readStore(page, lang)).bookings.some(b => b.id === '1190283746')).toBe(false);
    });
  });

  test.describe('agent → partner · ' + lang, () => {
    test('check-in, requests, a ticket, a room move and a room state set in Sila show up at the partner', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const partner = await context.newPage();
      await open(partner, 'partner.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);

      await takeOver(page);
      await enterNumber(page, B);
      await sendRequests(page, T(lang, 'وسادة إضافية، سيارة للمطار', 'an extra pillow, a car to the airport'));
      await page.locator('#panel [data-v="alt"]').click();                            // 207 is not ready: the agent moves the guest to 209
      await pay(page);
      await pickKey(page, 'sms');
      await ask(page, T(lang, 'المكيف لا يعمل', 'The AC is not working'));

      await expect(partner.locator('#pInbox li .tag')).toHaveCount(4);                // check-in, requests, move, ticket
      let p = await readPartner(partner, lang);
      const pb = p.bookings.find(b => b.id === B);
      expect(pb.checkedInAt).toBeTruthy(); expect(pb.room).toBe('209');
      expect(p.inbox.map(m => m.kind).sort()).toEqual(['check_in', 'request', 'room_change', 'ticket']);
      expect(p.inbox.find(m => m.kind === 'request').items.length).toBe(2);
      await expect(partner.locator('#pRows tr', { hasText: B })).toContainText('209');

      await admin.locator('#rooms .rm', { hasText: '917' }).click();                  // staff in Sila: 917 ready -> being prepared
      await expect.poll(async () => (await readPartner(partner, lang)).rooms.find(r => r.no === '917').state).toBe('prep');
      await expect(partner.locator('#pRooms .rm.prep', { hasText: '917' })).toHaveCount(1);

      const log = await codes(page, lang);
      expect(log).toEqual(expect.arrayContaining(['out.check_in', 'out.request', 'out.room_change', 'out.ticket', 'out.room_state']));
      expect(log.filter(c => c.startsWith('conflict')).length).toBe(0);
      await admin.locator('[data-tab="trail"]').click();
      await expect(admin.locator('#syncLog li .tag')).not.toHaveCount(0);
      await expect(partner.locator('#pSync li .tag')).not.toHaveCount(0);
      if (lang === 'en') { await noArabic(partner); await noArabic(admin); }
    });
  });

  test.describe('conflict, disconnect and repeats · ' + lang, () => {
    test('disconnected, Sila carries on with its own data; reconnected, the queue is sent and the partner wins the conflict', async ({ context, page }) => {
      const errors = watch(page);
      await open(page, 'index.html', lang);
      const partner = await context.newPage();
      await open(partner, 'partner.html', lang);
      const admin = await context.newPage();
      await open(admin, 'admin.html', lang);

      await partner.locator('#linkBtn').click();                                      // disconnect the partner
      await expect(partner.locator('#linkState')).toHaveClass(/off/);
      await expect.poll(async () => await codes(page, lang)).toContain('link.off');

      await arrive(page, A, { requests: T(lang, 'سرير إضافي', 'extra bed') });        // the whole arrival still works
      expect((await bookingOf(page, lang, A)).key).toBe('code');
      let p = await readPartner(partner, lang);
      expect(p.bookings.find(b => b.id === A).checkedInAt).toBeFalsy();                // nothing reached the partner
      expect(p.inbox.length).toBe(0);
      expect((await readSync(page, lang)).outbox.length).toBe(2);                      // check-in and the request wait in the queue

      await admin.locator('#rooms .rm', { hasText: '209' }).click();                  // Sila: 209 ready -> being prepared
      const tile = partner.locator('#pRooms .rm', { hasText: '209' });
      await tile.click(); await tile.click();                                         // partner: 209 ready -> prepared -> maintenance
      await partner.locator('#pRate1').fill('600');                                   // and a new Standard rate, while apart
      await partner.locator('#pRate1').press('Tab');
      let s = await readStore(page, lang);
      expect(s.rooms.find(r => r.no === '209').state).toBe('prep');
      expect(s.rooms.find(r => r.no === '209').rate).toBe(520);

      await partner.locator('#linkBtn').click();                                      // reconnect
      await expect(partner.locator('#linkState')).toHaveClass(/on/);
      await expect.poll(async () => (await readSync(page, lang)).outbox.length).toBe(0);
      await expect.poll(async () => (await readStore(page, lang)).rooms.find(r => r.no === '209').state).toBe('maint');   // the partner's value
      s = await readStore(page, lang); p = await readPartner(partner, lang);
      expect(s.rooms.find(r => r.no === '209').rate).toBe(600);
      expect(p.rooms.find(r => r.no === '209').state).toBe('maint');
      expect(p.bookings.find(b => b.id === A).checkedInAt).toBeTruthy();
      expect(p.inbox.map(m => m.kind).sort()).toEqual(['check_in', 'request']);
      const log = await codes(page, lang);
      expect(log).toEqual(expect.arrayContaining(['queued', 'link.off', 'link.on', 'conflict.room_state', 'in.room_rate', 'out.check_in', 'out.request']));
      await expect(partner.locator('#pSync li .tag.wait')).not.toHaveCount(0);
      if (lang === 'en') await noArabic(partner);
      expect(errors).toEqual([]);
    });

    test('the same operation delivered twice is carried out once', async ({ context, page }) => {
      await open(page, 'index.html', lang);
      const partner = await context.newPage();
      await open(partner, 'partner.html', lang);
      await takeOver(page);
      await enterNumber(page, A);
      await sendRequests(page, '');
      await expect.poll(async () => (await readPartner(partner, lang)).inbox.length).toBe(1);

      const direct = await partner.evaluate(async lang => {                            // straight at the connector
        const c = window.SILA.demoPartner.open(lang).connector, op = { opId: 'op-test-1', type: 'ticket', bookingId: '1087654321', room: '412', ticket: { n: 9, kind: 'clean', text: '' } };
        const first = await c.pushRequest(op), second = await c.pushRequest(op);
        return { first: first.ok && !first.duplicate, second: second.duplicate === true, missing: window.SILA.connectors.missing(c) };
      }, lang);
      expect(direct).toEqual({ first: true, second: true, missing: [] });
      expect((await readPartner(partner, lang)).inbox.length).toBe(2);

      await partner.locator('#linkBtn').click();                                      // through the sync engine: the check-in is queued again
      await expect.poll(async () => await codes(page, lang)).toContain('link.off');
      await page.evaluate(([k, pk]) => {
        const s = JSON.parse(localStorage.getItem(k)), p = JSON.parse(localStorage.getItem(pk));
        const done = p.inbox.find(m => m.kind === 'check_in');
        s.outbox.push({ opId: done.opId, type: 'check_in', bookingId: '1087654321', name: done.name, room: done.room, at: done.at });
        localStorage.setItem(k, JSON.stringify(s));
      }, [syncKey(lang), 'sila.partner.v1' + (lang === 'en' ? '.en' : '')]);
      await partner.locator('#linkBtn').click();
      await expect.poll(async () => await codes(page, lang)).toContain('dup');
      const p = await readPartner(partner, lang);
      expect(p.inbox.filter(m => m.kind === 'check_in').length).toBe(1);
      expect((await readSync(page, lang)).outbox.length).toBe(0);
    });

    test('a booking made in Sila stays local, and the stores are kept apart', async ({ context, page }) => {
      await open(page, 'admin.html', lang, '#guests');
      const partner = await context.newPage();
      await open(partner, 'partner.html', lang);
      await page.locator('#fName').fill('Local Guest');
      await page.locator('#fId').fill('1222222222');
      await page.locator('#fPhone').fill('0522222222');
      await page.locator('#addForm button[type="submit"]').click();
      await expect(page.locator('#rows tr')).toHaveCount(5);
      await partner.locator('#pRooms .rm', { hasText: '318' }).click();               // any partner change triggers a full read
      await expect.poll(async () => (await readStore(page, lang)).rooms.find(r => r.no === '318').state).toBe('maint');
      const s = await readStore(page, lang), p = await readPartner(partner, lang);
      expect(s.bookings.some(b => b.id === '1222222222')).toBe(true);                  // not wiped by the partner's list
      expect(p.bookings.some(b => b.id === '1222222222')).toBe(false);
      expect(Object.keys(p).sort()).toEqual(['applied', 'bookings', 'inbox', 'rev', 'rooms']);      // the partner holds none of Sila's data
      expect(JSON.stringify(p)).not.toContain('perms');
    });
  });
}
