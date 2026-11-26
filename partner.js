/* صلة — partner.html: the screen of the demo partner hotel system (connectors/demo-partner.js).
   It edits the partner's own data only. Sila hears about a change through the connector, and what Sila's agent
   sends arrives here the same way. This page never reads or writes Sila's store. */
(() => {
  const SILA = window.SILA;
  let lang = new URLSearchParams(location.search).get('lang');
  try { if (lang === 'ar' || lang === 'en') localStorage.setItem('sila.lang', lang); else lang = localStorage.getItem('sila.lang'); } catch (e) {}
  if (lang !== 'ar' && lang !== 'en') lang = /^ar\b/i.test(navigator.language || '') ? 'ar' : 'en';
  const EN = lang === 'en', t = (ar, en) => (EN ? en : ar);
  document.documentElement.lang = lang; document.documentElement.dir = EN ? 'ltr' : 'rtl';
  if (EN) {                                         // the page is written in Arabic; its English sits beside each string
    document.querySelectorAll('[dir="rtl"]').forEach(n => { n.dir = 'ltr'; n.lang = 'en'; });
    document.querySelectorAll('[data-en]').forEach(n => { n.textContent = n.dataset.en; });
    document.querySelectorAll('[data-en-label]').forEach(n => n.setAttribute('aria-label', n.dataset.enLabel));
    document.title = document.body.dataset.titleEn;
  }
  const $ = s => document.querySelector(s);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  {
    const lb = $('#langBtn');
    lb.textContent = EN ? 'عربي' : 'EN'; lb.lang = EN ? 'ar' : 'en'; lb.setAttribute('aria-label', EN ? 'التبديل إلى العربية' : 'Switch to English');
    lb.addEventListener('click', () => { const to = EN ? 'ar' : 'en', u = new URL(location.href); try { localStorage.setItem('sila.lang', to); } catch (e) {} u.searchParams.set('lang', to); location.replace(u); });
  }

  const P = SILA.demoPartner.open(lang), desk = P.desk, SYNC_KEY = 'sila.sync.v1' + (EN ? '.en' : '');
  const NEXT = { ready: 'prep', prep: 'maint', maint: 'ready' }, DOTS = ['#0B4D40', '#7C8B85', '#2F7FC1', '#E0A526'];
  const stateText = v => { const s = SILA.sync.stateLabel(v, lang); return s[0].toUpperCase() + s.slice(1); };
  const say = (text, tone) => { const m = $('#pMsg'); m.textContent = text; m.className = 'msg' + (tone ? ' ' + tone : ''); };
  const cats = s => s.rooms.reduce((l, r) => (l.includes(r.cat) ? l : l.concat(r.cat)), []);
  const holder = (s, no) => s.bookings.find(b => b.room === no);

  function renderRooms(s) {
    const list = cats(s);
    $('#pRooms').replaceChildren(...s.rooms.map(r => {
      const o = holder(s, r.no), c = el('button', 'rm ' + r.state); c.type = 'button';
      c.style.setProperty('--dot', DOTS[list.indexOf(r.cat) % DOTS.length]);
      c.append(el('b', '', r.no), el('span', '', r.cat), el('i', '', stateText(r.state)), el('span', '', o ? o.name : t('شاغرة', 'Vacant')));
      c.addEventListener('click', () => desk.edit(d => { const x = d.rooms.find(v => v.no === r.no); if (x) x.state = NEXT[x.state] || 'ready'; }));
      return c;
    }));
    $('#pRates').replaceChildren(...list.map((cat, i) => {
      const row = el('label', 'perm', cat + t(' · ر.س لليلة', ' · SAR per night')), inp = el('input');
      inp.type = 'number'; inp.min = 100; inp.max = 9990; inp.step = 10; inp.inputMode = 'numeric'; inp.id = 'pRate' + i; inp.value = s.rooms.find(r => r.cat === cat).rate;
      inp.addEventListener('change', () => {
        const v = Math.max(100, Math.min(9990, Math.round((Number(inp.value) || 0) / 10) * 10));
        desk.edit(d => { d.rooms.forEach(x => { if (x.cat === cat) x.rate = v; }); });
      });
      row.append(inp); return row;
    }));
  }
  function renderRows(s) {
    const rows = s.bookings.map(b => {
      const tr = el('tr'), who = el('td', '', b.name), ids = el('td', 'num', b.id);
      if (b.phone) ids.append(el('small', '', b.phone));
      const roomTd = el('td'), sel = el('select', 'room-in wide');
      sel.setAttribute('aria-label', t('غرفة ', 'Room of ') + b.name);
      s.rooms.filter(r => r.no === b.room || !holder(s, r.no)).forEach(r => { const o = el('option', '', r.no + ' · ' + r.cat); o.value = r.no; o.selected = r.no === b.room; sel.append(o); });
      sel.addEventListener('change', () => desk.edit(d => { const x = d.bookings.find(v => v.id === b.id); if (!x || d.bookings.some(v => v !== x && v.room === sel.value)) return 'taken'; x.room = sel.value; }));
      roomTd.append(sel);
      const nTd = el('td'), n = el('input', 'room-in'); n.value = b.nights; n.inputMode = 'numeric'; n.maxLength = 2; n.setAttribute('aria-label', t('ليالي ', 'Nights of ') + b.name);
      n.addEventListener('change', () => { const v = parseInt(n.value, 10); if (!(v >= 1 && v <= 90)) return render(); desk.edit(d => { const x = d.bookings.find(k => k.id === b.id); if (x) x.nights = v; }); });
      nTd.append(n);
      const arr = el('td'); arr.append(b.checkedInAt ? el('span', 'arr', t('وصل ', 'Arrived ') + b.checkedInAt) : t('متوقع ', 'Expected ') + b.eta);
      const del = el('button', 'ghost-btn', t('إلغاء الحجز', 'Cancel booking')); del.type = 'button';
      del.addEventListener('click', () => desk.edit(d => { const i = d.bookings.findIndex(k => k.id === b.id); if (i >= 0) d.bookings.splice(i, 1); }));
      const acts = el('td', 'acts'), box = el('div'); box.append(del); acts.append(box);
      tr.append(who, ids, roomTd, nTd, arr, acts); return tr;
    });
    if (!rows.length) { const tr = el('tr'), td = el('td', 'empty', t('لا حجوزات عند الشريك.', 'No bookings at the partner.')); td.colSpan = 6; tr.append(td); rows.push(tr); }
    $('#pRows').replaceChildren(...rows);
    const free = s.rooms.filter(r => !holder(s, r.no)), pick = $('#pRoom'), was = pick.value;
    pick.replaceChildren(...free.map(r => { const o = el('option', '', r.no + ' · ' + r.cat + ' · ' + stateText(r.state)); o.value = r.no; return o; }));
    if (free.some(r => r.no === was)) pick.value = was;
  }
  const TAG = { check_in: ['auto', t('وصول', 'Check-in')], request: ['limit', t('طلبات', 'Requests')], ticket: ['wait', t('بلاغ', 'Ticket')], room_change: ['ok', t('نقل', 'Move')], room_state: ['staff', t('حالة غرفة', 'Room state')] };
  function inboxText(m) {
    if (m.kind === 'check_in') return t('سجّل وكيل صلة وصول ' + m.name + ' · الغرفة ' + m.room + ' · ' + m.at, 'Sila’s agent checked in ' + m.name + ' · room ' + m.room + ' · ' + m.at);
    if (m.kind === 'request') return t('طلبات الغرفة ' + m.room + ': ', 'Requests from room ' + m.room + ': ') + (m.items || []).map(i => i.request).join(t('، ', ', '));
    if (m.kind === 'ticket') return t('بلاغ ' + SILA.sync.kindLabel(m.ticket.kind, lang) + ' #' + m.ticket.n + ' · الغرفة ' + m.room, 'Ticket #' + m.ticket.n + ' (' + SILA.sync.kindLabel(m.ticket.kind, lang) + ') · room ' + m.room) + (m.ticket.text ? ' · ' + m.ticket.text : '');
    if (m.kind === 'room_change') return t('نُقل ' + m.name + ' من الغرفة ' + m.from + ' إلى ' + m.room, m.name + ' was moved from room ' + m.from + ' to ' + m.room);
    return t('الغرفة ' + m.room + ' صارت ' + SILA.sync.stateLabel(m.state, lang), 'Room ' + m.room + ' is now ' + SILA.sync.stateLabel(m.state, lang));
  }
  function renderInbox(s) {
    const ul = $('#pInbox'); ul.textContent = '';
    if (!s.inbox.length) ul.append(el('li', '', t('لم يصل شيء بعد. سجّل وصول نزيل من شاشة صلة ليظهر هنا.', 'Nothing yet. Check a guest in on Sila’s screen and it shows up here.')));
    s.inbox.forEach(m => { const li = el('li'), g = TAG[m.kind] || TAG.request; li.append(el('time', '', m.t), el('span', '', inboxText(m)), el('span', 'tag ' + g[0], g[1])); ul.append(li); });
  }
  const SYNC_TAG = { out: 'auto', in: 'limit', conflict: 'wait', dup: 'staff', queued: 'wait', link: 'staff', rejected: 'no', skip: 'staff' };
  function renderSync() {
    let s = null; try { s = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) {}
    const log = (s && Array.isArray(s.log) && s.log) || [], ul = $('#pSync'); ul.textContent = '';
    if (!log.length) ul.append(el('li', '', t('لا مزامنة بعد. افتح شاشة صلة بجانب هذه الصفحة.', 'No sync yet. Open Sila’s screen beside this page.')));
    log.forEach(e => { const li = el('li'); li.append(el('time', '', e.t), el('span', '', SILA.sync.text(e, lang)), el('span', 'tag ' + (SYNC_TAG[e.dir] || 'staff'), SILA.sync.dirLabel(e.dir, lang))); ul.append(li); });
    const on = desk.linked(), waiting = (s && Array.isArray(s.outbox) && s.outbox.length) || 0, st = $('#linkState');
    st.textContent = on ? t('متصل بصلة', 'Connected to Sila') : t('مفصول عن صلة', 'Disconnected from Sila') + (waiting ? t(' · ' + waiting + ' عملية تنتظر عند صلة', ' · ' + waiting + ' operation(s) waiting at Sila') : '');
    st.className = 'sync-state ' + (on ? 'on' : 'off');
    const btn = $('#linkBtn'); btn.textContent = on ? t('افصل الشريك', 'Disconnect the partner') : t('أعد وصل الشريك', 'Reconnect the partner');
    btn.className = 'big ' + (on ? 'out' : 'solid'); btn.setAttribute('aria-pressed', String(!on));
  }
  function render() { const s = desk.load(); renderRooms(s); renderRows(s); renderInbox(s); renderSync(); }

  $('#linkBtn').addEventListener('click', () => { desk.setLink(!desk.linked()); renderSync(); });
  $('#pReset').addEventListener('click', () => { desk.reset(); say(t('استُعيدت بيانات الشريك التجريبية.', 'The partner’s sample data was restored.'), 'ok'); });
  ['#pId', '#pPhone', '#pNights'].forEach(s => $(s).addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); }));
  $('#pAdd').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#pName').value.trim(), id = $('#pId').value.trim(), phone = $('#pPhone').value.trim(), room = $('#pRoom').value, nights = Number($('#pNights').value.trim());
    const s = desk.load();
    if (!name) return say(t('اكتب اسم النزيل.', 'Enter the guest’s name.'), 'bad');
    if (!/^[12]\d{9}$/.test(id)) return say(t('رقم الهوية 10 أرقام ويبدأ بـ 1 أو 2.', 'The ID number is 10 digits and starts with 1 or 2.'), 'bad');
    if (s.bookings.some(b => b.id === id)) return say(t('هذه الهوية مرتبطة بحجز آخر.', 'This ID is already on another booking.'), 'bad');
    if (!/^05\d{8}$/.test(phone)) return say(t('رقم الجوال 10 أرقام ويبدأ بـ 05.', 'The mobile number is 10 digits and starts with 05.'), 'bad');
    if (s.bookings.some(b => b.phone === phone)) return say(t('رقم الجوال مرتبط بحجز آخر.', 'This mobile number is already on another booking.'), 'bad');
    if (!room || holder(s, room)) return say(t('لا توجد غرفة شاغرة.', 'There is no vacant room.'), 'bad');
    if (!Number.isInteger(nights) || nights < 1 || nights > 90) return say(t('عدد الليالي بين 1 و90.', 'Nights must be between 1 and 90.'), 'bad');
    desk.edit(d => { d.bookings.push({ id, name, room, nights, eta: '15:00', phone, email: '', checkedInAt: null }); });
    e.target.reset(); $('#pNights').value = '1';
    say(t('أُضيف الحجز عند الشريك، ووصل إلى صلة.', 'The booking was added at the partner and reached Sila.'), 'ok');
  });

  P.connector.subscribe(render);                    // this page's own edits, the other open pages, and the link switch
  addEventListener('storage', e => { if (e.key === SYNC_KEY) renderSync(); });
  render();
  document.body.classList.add('in');
})();
