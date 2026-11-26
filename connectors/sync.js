/* صلة — the sync engine between Sila and a partner system, on top of any connector (connectors/connector.js).
   Out: what the agent did (check-in, requests, tickets, a room change, a room state) is queued with an operation id and sent.
        While the partner is unreachable the queue waits and Sila carries on with its own data; on return it is sent in order.
   In:  the partner's bookings, room states and rates are read and laid over Sila's. On a conflict the partner's value wins.
   Every step lands in a visible log. The queue, the log and the last values agreed with the partner live in their own
   localStorage key, apart from both Sila's store and the partner's store, and are shared by every open Sila page. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const B_FIELDS = ['name', 'room', 'nights', 'eta', 'phone', 'email'], R_FIELDS = ['state', 'rate', 'cat'];
  const clock = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());

  /* lay the partner's data over Sila's, in place (objects are kept, so a check-in under way keeps its booking).
     base = the partner's values at the last sync; a local value that moved away from it since, and differs from the
     partner's now, is a conflict: the partner's value is taken and the conflict is reported. */
  function reconcile(local, remote, base, makeBooking) {
    const out = [], bb = (base && base.bookings) || {}, br = (base && base.rooms) || {}, seenRate = {};
    const differs = (was, mine, f) => !!was && was[f] !== undefined && mine !== was[f];
    remote.rooms.forEach(rr => {
      let lr = local.rooms.find(x => x.no === rr.no);
      if (!lr) { local.rooms.push({ no: rr.no, cat: rr.cat, rate: rr.rate, state: rr.state, src: 'partner' }); out.push({ code: 'in.room_new', room: rr.no, cat: rr.cat }); return; }
      lr.src = 'partner';
      R_FIELDS.forEach(f => {
        if (lr[f] === rr[f]) return;
        const conflict = differs(br[rr.no], lr[f], f), e = { code: (conflict ? 'conflict.' : 'in.') + 'room_' + f, room: rr.no, cat: rr.cat, from: lr[f], to: rr[f] };
        lr[f] = rr[f];
        if (f === 'rate' && !conflict) { if (seenRate[rr.cat]) return; seenRate[rr.cat] = 1; }      // one line per category, not per room
        out.push(e);
      });
    });
    for (let i = local.rooms.length - 1; i >= 0; i--) {
      const lr = local.rooms[i];
      if (lr.src === 'partner' && !remote.rooms.some(r => r.no === lr.no) && !local.bookings.some(b => b.room === lr.no && b.src !== 'partner')) { local.rooms.splice(i, 1); out.push({ code: 'in.room_gone', room: lr.no }); }
    }
    remote.bookings.forEach(rb => {
      let lb = local.bookings.find(x => x.id === rb.id);
      if (!lb) { lb = makeBooking(rb); lb.src = 'partner'; local.bookings.push(lb); out.push({ code: 'in.booking_new', name: rb.name, room: rb.room }); return; }
      lb.src = 'partner';
      B_FIELDS.forEach(f => {
        const theirs = rb[f] == null ? '' : rb[f], mine = lb[f] == null ? '' : lb[f];
        if (mine === theirs) return;
        const conflict = differs(bb[rb.id], mine, f);
        lb[f] = rb[f];
        if (f === 'room' || f === 'nights' || f === 'name') out.push({ code: (conflict ? 'conflict.' : 'in.') + 'booking_' + f, name: rb.name, from: mine, to: theirs });
        else out.push({ code: 'in.booking_contact', name: rb.name });
      });
    });
    for (let i = local.bookings.length - 1; i >= 0; i--) {
      const lb = local.bookings[i];
      if (lb.src === 'partner' && !remote.bookings.some(b => b.id === lb.id)) { local.bookings.splice(i, 1); out.push({ code: 'in.booking_gone', name: lb.name, room: lb.room }); }
    }
    return out;
  }
  const baseOf = remote => ({
    bookings: Object.fromEntries(remote.bookings.map(b => [b.id, Object.fromEntries(B_FIELDS.map(f => [f, b[f] == null ? '' : b[f]]))])),
    rooms: Object.fromEntries(remote.rooms.map(r => [r.no, { state: r.state, rate: r.rate, cat: r.cat }]))
  });

  /* o: { connector, key, refresh(), local() -> { bookings, rooms }, makeBooking(remoteBooking), commit(changes) } */
  function create(o) {
    const c = o.connector, listeners = [];
    const fresh = () => ({ rev: null, base: null, outbox: [], log: [], seq: 0, linked: null });
    const load = () => { let s = null; try { s = JSON.parse(localStorage.getItem(o.key)); } catch (e) {} return s && Array.isArray(s.outbox) && Array.isArray(s.log) ? s : fresh(); };
    const save = s => { try { localStorage.setItem(o.key, JSON.stringify(s)); } catch (e) {} listeners.forEach(f => f(s)); };
    const lock = fn => (root.navigator && navigator.locks ? navigator.locks.request(o.key, fn) : Promise.resolve().then(fn));      // one Sila page at a time
    const note = (s, entry) => {
      if (entry.id && s.log.some(e => e.id === entry.id)) return;
      s.log.unshift(Object.assign({ t: clock() }, entry)); if (s.log.length > 80) s.log.length = 80;
    };
    const online = () => !!c.status().online;

    async function flushLocked(s) {
      let sent = 0;
      while (s.outbox.length) {
        const op = s.outbox[0];
        let res;
        try { res = await c[SILA.connectors.PUSH[op.type]](op); }
        catch (e) { if (!op.queued) { op.queued = true; note(s, { id: 'q:' + op.opId, dir: 'queued', code: 'queued', p: op }); } break; }
        s.outbox.shift();
        if (res && res.duplicate) note(s, { id: 'dup:' + op.opId, dir: 'dup', code: 'dup', p: op });
        else if (res && res.ok) { sent++; note(s, { id: 'out:' + op.opId, dir: 'out', code: 'out.' + op.type, p: op }); }
        else if (res && res.error === 'conflict') s.clash = true;       // the pull that follows reports it and takes the partner's value
        else note(s, { id: 'rej:' + op.opId, dir: 'rejected', code: 'rejected', p: Object.assign({ error: (res && res.error) || 'refused' }, op) });
      }
      return sent;
    }
    async function pullLocked(s, force) {
      if (!online()) return 0;
      const rev = c.revision();
      if (!force && s.rev === rev && s.base) return 0;
      const remote = { bookings: await c.getBookings(), rooms: await c.getRooms() };
      o.refresh();
      const changes = reconcile(o.local(), remote, s.base, o.makeBooking);
      changes.forEach((ch, i) => note(s, { id: 'in:' + rev + ':' + ch.code + ':' + (ch.room || ch.name || i) + ':' + ch.to, dir: ch.code.startsWith('conflict') ? 'conflict' : 'in', code: ch.code, p: ch }));
      s.rev = rev; s.base = baseOf(remote); s.clash = false;
      o.commit(changes);
      return changes.length;
    }

    const api = {
      online, state: load,
      onChange: f => { listeners.push(f); },
      /* queue an operation and try to send it now */
      send: (type, payload) => lock(async () => {
        const s = load(); s.seq = (s.seq || 0) + 1;
        s.outbox.push(Object.assign({ opId: 'op-' + Date.now().toString(36) + '-' + s.seq + '-' + Math.random().toString(36).slice(2, 6), type }, payload));
        const sent = await flushLocked(s);
        if (sent || s.clash) await pullLocked(s, true);
        save(s);
      }),
      note: (code, p) => lock(async () => { const s = load(); note(s, { dir: 'skip', code, p }); save(s); }),
      pull: force => lock(async () => { const s = load(); const n = await pullLocked(s, force); save(s); return n; }),
      /* the connection came back, or the page just opened: send what waited, then take the partner's data */
      resume: () => lock(async () => {
        const s = load(), waited = s.outbox.length, was = s.linked;
        if (!online()) { if (was !== false) { s.linked = false; note(s, { dir: 'link', code: 'link.off' }); save(s); } return; }
        const sent = await flushLocked(s), got = await pullLocked(s, true);
        if (was === false) note(s, { dir: 'link', code: 'link.on', p: { sent, got, waited } });
        s.linked = true; save(s);
      })
    };
    c.subscribe(ev => {
      if (ev.type === 'changed') api.pull(false);
      else if (ev.type === 'link') api.resume();
      else if (ev.type === 'log') listeners.forEach(f => f(load()));     // another Sila page wrote the log
    });
    return api;
  }

  /* ---------- the log in words: Arabic and English ---------- */
  const STATES = { ready: ['جاهزة', 'ready'], prep: ['قيد التجهيز', 'being prepared'], maint: ['صيانة', 'under maintenance'] };
  const KINDS = { clean: ['تنظيف', 'cleaning'], maint: ['صيانة', 'maintenance'] };
  const OPS = { check_in: ['تسجيل وصول', 'check-in'], request: ['طلبات', 'requests'], ticket: ['بلاغ', 'ticket'], room_change: ['نقل غرفة', 'room change'], room_state: ['حالة غرفة', 'room state'] };
  const DIR = { out: ['أُرسل', 'Sent'], in: ['استُقبل', 'Received'], conflict: ['تعارض', 'Conflict'], dup: ['تكرار مُنع', 'Duplicate blocked'], queued: ['ينتظر', 'Waiting'], link: ['الاتصال', 'Link'], rejected: ['رُفض', 'Refused'], skip: ['لم يُرسل', 'Not sent'] };
  function text(e, lang) {
    const en = lang === 'en', p = e.p || {}, t = (ar, eng) => (en ? eng : ar), st = v => (STATES[v] ? STATES[v][en ? 1 : 0] : v), who = p.name || p.bookingId || '';
    switch (e.code) {
      case 'out.check_in': return t('تسجيل وصول ' + who + ' · الغرفة ' + p.room + ' · ' + p.at, 'Check-in for ' + who + ' · room ' + p.room + ' · ' + p.at);
      case 'out.request': return t((p.items || []).length + ' طلب من الغرفة ' + p.room + ': ' + (p.items || []).map(i => i.request).join('، '), (p.items || []).length + ' request(s) from room ' + p.room + ': ' + (p.items || []).map(i => i.request).join(', '));
      case 'out.ticket': { const k = KINDS[p.ticket && p.ticket.kind] || KINDS.maint; return t('بلاغ ' + k[0] + ' #' + p.ticket.n + ' للغرفة ' + p.room, k[1][0].toUpperCase() + k[1].slice(1) + ' ticket #' + p.ticket.n + ' for room ' + p.room); }
      case 'out.room_change': return t('نقل ' + who + ' من الغرفة ' + p.from + ' إلى ' + p.to, who + ' moved from room ' + p.from + ' to ' + p.to);
      case 'out.room_state': return t('الغرفة ' + p.room + ' صارت ' + st(p.to), 'Room ' + p.room + ' is now ' + st(p.to));
      case 'queued': return t(OPS[p.type][0] + (p.room ? ' · الغرفة ' + p.room : '') + ': الشريك مفصول، تُرسل عند عودته', OPS[p.type][1] + (p.room ? ' · room ' + p.room : '') + ': partner disconnected, will be sent when it is back');
      case 'dup': return t(OPS[p.type][0] + (p.room ? ' · الغرفة ' + p.room : '') + ': وصلت للشريك من قبل، فلم تُنفَّذ مرتين', OPS[p.type][1] + (p.room ? ' · room ' + p.room : '') + ': the partner already had it, so it was not applied twice');
      case 'rejected': return t(OPS[p.type][0] + ': رفضها الشريك (' + p.error + ')', OPS[p.type][1] + ': refused by the partner (' + p.error + ')');
      case 'skip.local': return t('حجز ' + who + ' أُنشئ في صلة وغير موجود عند الشريك', 'The booking of ' + who + ' was created in Sila and does not exist at the partner');
      case 'in.room_state': return t('الغرفة ' + p.room + ' صارت ' + st(p.to) + ' (كانت ' + st(p.from) + ')', 'Room ' + p.room + ' is now ' + st(p.to) + ' (was ' + st(p.from) + ')');
      case 'in.room_rate': return t('سعر ' + p.cat + ' صار ' + p.to + ' ر.س (كان ' + p.from + ')', p.cat + ' rate is now ' + p.to + ' SAR (was ' + p.from + ')');
      case 'in.room_cat': return t('الغرفة ' + p.room + ' صارت من فئة ' + p.to, 'Room ' + p.room + ' is now in category ' + p.to);
      case 'in.room_new': return t('غرفة جديدة عند الشريك: ' + p.room, 'New room at the partner: ' + p.room);
      case 'in.room_gone': return t('الغرفة ' + p.room + ' حُذفت عند الشريك', 'Room ' + p.room + ' was removed at the partner');
      case 'in.booking_new': return t('حجز جديد: ' + p.name + ' · الغرفة ' + p.room, 'New booking: ' + p.name + ' · room ' + p.room);
      case 'in.booking_gone': return t('حجز ' + p.name + ' أُلغي عند الشريك', 'The booking of ' + p.name + ' was cancelled at the partner');
      case 'in.booking_room': return t('حجز ' + p.name + ' صار في الغرفة ' + p.to + ' (كان ' + p.from + ')', 'The booking of ' + p.name + ' is now in room ' + p.to + ' (was ' + p.from + ')');
      case 'in.booking_nights': return t('حجز ' + p.name + ' صار ' + p.to + ' ليالٍ (كان ' + p.from + ')', 'The booking of ' + p.name + ' is now ' + p.to + ' night(s) (was ' + p.from + ')');
      case 'in.booking_name': return t('اسم النزيل صار ' + p.to + ' (كان ' + p.from + ')', 'The guest name is now ' + p.to + ' (was ' + p.from + ')');
      case 'in.booking_contact': return t('تحدّثت بيانات التواصل لحجز ' + p.name, 'Contact details updated for the booking of ' + p.name);
      case 'conflict.room_state': return t('الغرفة ' + p.room + ': صلة قالت ' + st(p.from) + ' والشريك قال ' + st(p.to) + '. اعتُمدت قيمة الشريك', 'Room ' + p.room + ': Sila had ' + st(p.from) + ', the partner has ' + st(p.to) + '. The partner’s value was taken');
      case 'conflict.room_rate': return t('سعر ' + p.cat + ': صلة ' + p.from + ' والشريك ' + p.to + '. اعتُمد سعر الشريك', p.cat + ' rate: Sila had ' + p.from + ', the partner has ' + p.to + '. The partner’s rate was taken');
      case 'conflict.room_cat': return t('فئة الغرفة ' + p.room + ': اعتُمدت قيمة الشريك ' + p.to, 'Category of room ' + p.room + ': the partner’s value ' + p.to + ' was taken');
      case 'conflict.booking_room': return t('غرفة ' + p.name + ': صلة قالت ' + p.from + ' والشريك قال ' + p.to + '. اعتُمدت قيمة الشريك', 'Room of ' + p.name + ': Sila had ' + p.from + ', the partner has ' + p.to + '. The partner’s value was taken');
      case 'conflict.booking_nights': return t('ليالي ' + p.name + ': صلة ' + p.from + ' والشريك ' + p.to + '. اعتُمدت قيمة الشريك', 'Nights of ' + p.name + ': Sila had ' + p.from + ', the partner has ' + p.to + '. The partner’s value was taken');
      case 'conflict.booking_name': return t('اسم النزيل: اعتُمدت قيمة الشريك ' + p.to, 'Guest name: the partner’s value ' + p.to + ' was taken');
      case 'link.off': return t('فُصل الشريك. صلة تكمل ببياناتها، وما تنفّذه ينتظر في الطابور', 'Partner disconnected. Sila carries on with its own data, and what it does waits in the queue');
      case 'link.on': return t('عاد الاتصال. أُرسل ' + p.sent + ' من ' + p.waited + ' عملية منتظرة، واستُقبل ' + p.got + ' تغيير', 'Connection restored. Sent ' + p.sent + ' of ' + p.waited + ' waiting operation(s), received ' + p.got + ' change(s)');
    }
    return e.code || '';
  }

  SILA.sync = Object.freeze({ create, reconcile, text, dirLabel: (dir, lang) => (DIR[dir] || DIR.in)[lang === 'en' ? 1 : 0], stateLabel: (v, lang) => (STATES[v] || [v, v])[lang === 'en' ? 1 : 0], kindLabel: (v, lang) => (KINDS[v] || [v, v])[lang === 'en' ? 1 : 0] });
})(typeof window !== 'undefined' ? window : globalThis);
