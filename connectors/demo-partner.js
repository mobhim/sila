/* صلة — the demo partner: a stand-in for a partner hotel's own system, living entirely in this browser.
   It keeps its own data in its own localStorage key (never Sila's), partner.html is its screen, and the connector at the
   bottom is the only door Sila uses to reach it. It is a simulation: it is not, and does not imitate, any real product's API. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const LINK = 'sila.partner.link';                 // 'off' while the partner is disconnected; shared by both languages
  const keyOf = lang => 'sila.partner.v1' + (lang === 'en' ? '.en' : '');

  function seed(lang) {
    const t = (ar, en) => (lang === 'en' ? en : ar);
    const C = { std: t('ستاندر', 'Standard'), fam: t('غرفة عائلية', 'Family Room'), roy: t('جناح ملكي', 'Royal Suite'), view: t('جناح بإطلالة', 'View Suite') };
    return {
      rev: 1,
      rooms: [
        { no: '412', cat: C.roy, rate: 850, state: 'ready' }, { no: '414', cat: C.roy, rate: 850, state: 'ready' },
        { no: '207', cat: C.std, rate: 520, state: 'prep' }, { no: '209', cat: C.std, rate: 520, state: 'ready' },
        { no: '915', cat: C.view, rate: 1100, state: 'ready' }, { no: '917', cat: C.view, rate: 1100, state: 'ready' },
        { no: '318', cat: C.fam, rate: 640, state: 'prep' }
      ],
      bookings: [
        { id: '1087654321', name: t('عبدالله الحربي', 'Abdullah Al-Harbi'), room: '412', nights: 3, eta: '15:00', phone: '0500000412', email: 'guest412@example.com', checkedInAt: null },
        { id: '2456701938', name: t('سارة المنصور', 'Sarah Al-Mansour'), room: '207', nights: 2, eta: '17:30', phone: '0500000207', email: 'guest207@example.com', checkedInAt: null },
        { id: '1023948576', name: t('فهد العتيبي', 'Fahad Al-Otaibi'), room: '915', nights: 5, eta: '21:00', phone: '0500000915', email: 'guest915@example.com', checkedInAt: null },
        { id: '1190283746', name: t('نورة القحطاني', 'Noura Al-Qahtani'), room: '318', nights: 1, eta: '14:00', phone: '0500000318', email: 'guest318@example.com', checkedInAt: null }
      ],
      inbox: [],                                     // what arrived from Sila
      applied: {}                                    // operation ids already carried out, so a repeat changes nothing
    };
  }

  function open(lang) {
    const KEY = keyOf(lang);
    const valid = s => s && Array.isArray(s.rooms) && Array.isArray(s.bookings) && Array.isArray(s.inbox) && s.applied && typeof s.rev === 'number';
    function load() {
      let s = null; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
      if (!valid(s)) { s = seed(lang); try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
      return s;
    }
    const subs = [];
    const tell = ev => subs.forEach(f => { try { f(ev); } catch (e) {} });
    function save(s) { s.rev++; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} tell({ type: 'changed' }); }
    const linked = () => { try { return localStorage.getItem(LINK) !== 'off'; } catch (e) { return true; } };
    function setLink(on) { try { localStorage.setItem(LINK, on ? 'on' : 'off'); } catch (e) {} tell({ type: 'link', online: !!on }); }
    root.addEventListener('storage', e => {          // the other open pages
      if (e.key === KEY) tell({ type: 'changed' });
      else if (e.key === LINK) tell({ type: 'link', online: e.newValue !== 'off' });
    });
    const nowTime = () => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date());
    const copy = v => JSON.parse(JSON.stringify(v));
    const offline = () => Object.assign(new Error('partner offline'), { code: 'offline' });

    /* an operation from Sila: carried out once, whatever number of times it is delivered */
    function apply(op, work) {
      if (!linked()) return Promise.reject(offline());
      const s = load();
      if (s.applied[op.opId]) return Promise.resolve({ ok: true, duplicate: true, revision: s.rev });
      const error = work(s);
      if (error) return Promise.resolve({ ok: false, error, revision: s.rev });
      s.applied[op.opId] = nowTime();
      const ids = Object.keys(s.applied); if (ids.length > 300) ids.slice(0, ids.length - 300).forEach(k => { delete s.applied[k]; });
      if (s.inbox.length > 60) s.inbox.length = 60;
      save(s);
      return Promise.resolve({ ok: true, revision: s.rev });
    }
    const readOnline = pick => (linked() ? Promise.resolve(copy(pick(load()))) : Promise.reject(offline()));

    const connector = {
      status: () => ({ online: linked() }),
      revision: () => load().rev,
      getBookings: () => readOnline(s => s.bookings.map(b => ({ id: b.id, name: b.name, room: b.room, nights: b.nights, eta: b.eta, phone: b.phone, email: b.email }))),
      getRooms: () => readOnline(s => s.rooms),
      getRates: () => readOnline(s => s.rooms.reduce((l, r) => (l.some(x => x.cat === r.cat) ? l : l.concat({ cat: r.cat, rate: r.rate })), [])),
      pushCheckIn: op => apply(op, s => {
        const b = s.bookings.find(x => x.id === op.bookingId); if (!b) return 'unknown_booking';
        b.checkedInAt = op.at;
        s.inbox.unshift({ t: nowTime(), opId: op.opId, kind: 'check_in', name: b.name, room: b.room, at: op.at });
      }),
      pushRequest: op => apply(op, s => {
        const b = s.bookings.find(x => x.id === op.bookingId); if (!b) return 'unknown_booking';
        if (op.type === 'ticket') s.inbox.unshift({ t: nowTime(), opId: op.opId, kind: 'ticket', name: b.name, room: op.room, ticket: op.ticket });
        else s.inbox.unshift({ t: nowTime(), opId: op.opId, kind: 'request', name: b.name, room: op.room, items: op.items });
      }),
      pushRoomChange: op => apply(op, s => {
        const b = s.bookings.find(x => x.id === op.bookingId), to = s.rooms.find(r => r.no === op.to);
        if (!b) return 'unknown_booking';
        if (!to) return 'unknown_room';
        if (b.room !== op.from || s.bookings.some(x => x !== b && x.room === op.to)) return 'conflict';      // the partner's own data moved on: it stays as it is
        if (op.fromState) { const from = s.rooms.find(r => r.no === op.from); if (from) from.state = op.fromState; }
        b.room = op.to;
        s.inbox.unshift({ t: nowTime(), opId: op.opId, kind: 'room_change', name: b.name, room: op.to, from: op.from });
      }),
      pushRoomState: op => apply(op, s => {
        const r = s.rooms.find(x => x.no === op.room); if (!r) return 'unknown_room';
        if (r.state !== op.from) return 'conflict';
        r.state = op.to;
        s.inbox.unshift({ t: nowTime(), opId: op.opId, kind: 'room_state', room: op.room, state: op.to });
      }),
      subscribe: f => { subs.push(f); return () => { const i = subs.indexOf(f); if (i >= 0) subs.splice(i, 1); }; }
    };

    /* the partner's own screen (partner.html) edits its data through these */
    const desk = {
      load, linked, setLink,
      edit: work => { const s = load(); const error = work(s); if (!error) save(s); return error || null; },
      reset: () => { const s = seed(lang), old = load(); s.rev = old.rev; save(s); }
    };
    return { key: KEY, connector, desk };
  }

  SILA.demoPartner = Object.freeze({ open, keyOf, LINK });
})(typeof window !== 'undefined' ? window : globalThis);
