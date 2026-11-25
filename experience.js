/* صلة 2.1 — طبقة التجربة فوق النموذج الأولي (app.js): الحركة، التنقل، وتفاعلات العرض. لا تغيّر منطق النموذج. */
(() => {
  const EN = document.documentElement.lang === 'en';
  const t = (ar, en) => (EN ? en : ar);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  if (!reduced) root.classList.add('x-motion');
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
  const inStay = () => { const s = $('#sysStay'); return !s || s.getAttribute('aria-pressed') === 'true'; };
  const scrollToId = id => {
    if (!inStay() && id !== 'evStage' && id !== 'evDoc') { const s = $('#sysStay'); if (s) s.click(); }
    const n = document.getElementById(id);
    if (n) n.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  /* ---------- hero: staged entrance, word-by-word title (C7) ---------- */
  const hero = $('.x-hero');
  if (hero) {
    hero.querySelectorAll('[data-x]').forEach(n => n.style.setProperty('--d', n.dataset.x));
    const title = hero.querySelector('.x-title');
    if (title && !reduced) {
      let wi = 0;
      const split = node => [...node.childNodes].forEach(c => {
        if (c.nodeType === 3) {
          const frag = document.createDocumentFragment();
          c.nodeValue.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(part); return; }
            const w = document.createElement('span'); w.className = 'w'; w.textContent = part; w.style.setProperty('--wi', wi++); frag.append(w);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1) split(c);
      });
      split(title);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => hero.classList.add('on')));
  }

  /* ---------- hero: Sila's decisions, live (real behaviours of the prototype) ---------- */
  const EVENTS = [
    [t('تسجيل وصول برقم الهوية', 'Check-in by ID number'), t('وجدت الحجز وسجّلت الوصول', 'Booking found, guest checked in'), 'auto', t('بنفسها', 'On its own')],
    [t('«سرير إضافي للطفل، وسيارة للمطار»', '“Extra bed for the child, car to the airport”'), t('طلبان: التدبير الفندقي والكونسيرج', 'Two requests: housekeeping and concierge'), 'auto', t('بنفسها', 'On its own')],
    [t('الغرفة 207 قيد التجهيز', 'Room 207 still being prepared'), t('نقل لغرفة 209 الجاهزة بنفس السعر', 'Moved to ready room 209, same price'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('«الرمز لا يفتح الباب»', '“The code does not open the door”'), t('إلغاء الرمز القديم وإصدار رمز جديد', 'Old code cancelled, new code issued'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('«أريد استرجاع المبلغ»', '“I want a refund”'), t('حُوّل لموظف الاستقبال للموافقة', 'Sent to reception for approval'), 'staff', t('للموظف', 'To staff')],
    [t('تأخير المغادرة ساعة', 'One-hour late checkout'), t('مسموح ضمن صلاحيات الفندق', 'Allowed within hotel permissions'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('طلب فتح غرفة لغير صاحب الحجز', 'Asked to open a room for someone else'), t('رُفض: ممنوع دائماً', 'Refused: never allowed'), 'never', t('ممنوع', 'Never')],
    [t('«المكيف لا يعمل»', '“The AC is not working”'), t('بلاغ صيانة فُتح وأُبلغ النزيل', 'Maintenance ticket opened, guest informed'), 'auto', t('بنفسها', 'On its own')]
  ];
  const list = $('#xStream');
  if (list) {
    let k = 0;
    const make = ev => {
      const li = document.createElement('li'); li.className = 'x-ev';
      const b = document.createElement('b'); b.textContent = ev[0];
      const s = document.createElement('small'); s.textContent = ev[1];
      const tg = document.createElement('span'); tg.className = 'x-t t-' + ev[2]; tg.textContent = ev[3];
      li.append(b, s, tg); return li;
    };
    const push = first => {
      const li = make(EVENTS[k++ % EVENTS.length]);
      list.querySelectorAll('.x-ev').forEach((n, i) => { n.classList.remove('fresh'); n.classList.toggle('old', i >= 2); });
      li.classList.add('fresh'); if (!first) li.classList.add('new');
      list.prepend(li);
      if (!first) requestAnimationFrame(() => requestAnimationFrame(() => li.classList.remove('new')));
      while (list.children.length > 5) list.lastElementChild.remove();
    };
    for (let i = 0; i < 4; i++) push(true);
    [...list.children].forEach((n, i) => { n.classList.toggle('fresh', i === 0); n.classList.toggle('old', i >= 2); });
    if (!reduced) {
      let visible = true;
      if ('IntersectionObserver' in window) new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; })).observe(list);
      setInterval(() => { if (visible && !document.hidden) push(false); }, 2600);
    }
  }

  /* ---------- scroll: progress bar + gentle hero parallax ---------- */
  const bar = $('.x-progress');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.setProperty('--p', max > 0 ? Math.min(1, scrollY / max).toFixed(4) : 0);
    if (hero && !reduced && scrollY < innerHeight * 1.2) hero.style.setProperty('--py', (scrollY * 0.22).toFixed(1) + 'px');
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- reveals, staggered among siblings (C18) ---------- */
  const groups = new Map();
  $$('[data-rv]').forEach(n => { const p = n.parentElement; const i = groups.get(p) || 0; n.style.setProperty('--d', i); groups.set(p, i + 1); });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-rv], .x-perm .ladder').forEach(n => io.observe(n));
  } else $$('[data-rv], .x-perm .ladder').forEach(n => n.classList.add('on'));

  /* ---------- how it works: a pulse travels guest → Sila → hotel (C8) ---------- */
  const flowPath = $('.x-flow-line path'), pulse = $('.x-pulse');
  if (flowPath && pulse) {
    const L = flowPath.getTotalLength();
    const place = f => { const p = flowPath.getPointAtLength(L * f); pulse.setAttribute('cx', p.x); pulse.setAttribute('cy', p.y); };
    place(.5);
    if (!reduced && 'IntersectionObserver' in window) {
      let run = false, t0 = 0;
      const loop = now => { if (!run) return; const f = ((now - t0) / 3200) % 1; place(EN ? f : 1 - f); requestAnimationFrame(loop); };
      new IntersectionObserver(es => es.forEach(e => { run = e.isIntersecting; if (run) { t0 = performance.now(); requestAnimationFrame(loop); } })).observe(flowPath);
    }
  }

  /* ---------- screenshots follow the page language ---------- */
  const shot = k => 'media/' + k + '-' + (EN ? 'en' : 'ar') + '.webp?v=2';
  $$('img[data-shot-src]').forEach(im => { im.src = shot(im.dataset.shotSrc); });

  /* ---------- capabilities: a device that follows the capability in focus (C9) ---------- */
  const screens = $('#xScreens'), caps = $$('.x-cap');
  if (screens && caps.length) {
    const imgs = {};
    caps.forEach((c, i) => {
      const k = c.dataset.shot;
      const im = new Image(); im.src = shot(k); im.alt = ''; im.decoding = 'async'; if (i > 0) im.loading = 'lazy';
      screens.append(im); imgs[k] = im;
      const inline = document.createElement('div'); inline.className = 'x-shot';           // phones and tablets see the shot inside the item
      const im2 = new Image(); im2.src = shot(k); im2.alt = c.querySelector('h3').textContent; im2.loading = 'lazy'; im2.decoding = 'async';
      inline.append(im2); c.querySelector('p').after(inline);
    });
    const show = c => { caps.forEach(x => x.classList.toggle('on', x === c)); Object.entries(imgs).forEach(([k, im]) => im.classList.toggle('on', k === c.dataset.shot)); };
    show(caps[0]);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) show(e.target); }), { rootMargin: '-45% 0px -45% 0px' });
      caps.forEach(c => io.observe(c));
    }
  }

  /* ---------- the prototype: starts when it is seen, stops when it leaves (C2) ---------- */
  const stage = $('#stage'), demoBtn = $('#demoBtn');
  if (stage && demoBtn && document.body.dataset.autoplay === 'view') {
    let touched = false, ours = false;
    const running = () => demoBtn.getAttribute('aria-pressed') === 'true';
    stage.addEventListener('pointerdown', e => { if (!e.target.closest('#demoBtn')) touched = true; }, true);
    stage.addEventListener('keydown', () => { touched = true; }, true);
    demoBtn.addEventListener('click', e => { if (e.isTrusted) { touched = true; ours = false; } });
    const ctaDemo = $('#ctaDemo'); if (ctaDemo) ctaDemo.addEventListener('click', () => { touched = true; });
    if (!reduced && 'IntersectionObserver' in window) {
      new IntersectionObserver(es => es.forEach(e => {
        if (!inStay() || touched) return;
        if (e.isIntersecting && !running()) { ours = true; demoBtn.click(); }
        else if (!e.isIntersecting && running() && ours) { ours = false; demoBtn.click(); }
      }), { threshold: .35 }).observe(stage);
    }
  }

  /* ---------- the prototype on phones: two tabs, "screen" and "assistant" (C12) ---------- */
  const phone = matchMedia('(max-width: 680px)');
  const feed = $('#feed');
  if (stage && feed) {
    const tabs = document.createElement('div'); tabs.className = 'x-stage-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', t('عرض المحاكاة', 'Simulation view'));
    const mk = (id, label) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = id; b.textContent = label; return b; };
    const bScreen = mk('screen', t('الشاشة', 'Screen')), bAssist = mk('assist', t('المساعد', 'Assistant'));
    const dot = document.createElement('i'); dot.className = 'x-badge-dot'; dot.hidden = true; bAssist.append(dot);
    tabs.append(bScreen, bAssist);
    const top = stage.querySelector('.hero-top'); top.after(tabs);
    const set = v => {
      stage.dataset.view = v;
      bScreen.setAttribute('aria-selected', String(v === 'screen')); bAssist.setAttribute('aria-selected', String(v === 'assist'));
      if (v === 'assist') dot.hidden = true;
    };
    bScreen.addEventListener('click', () => set('screen')); bAssist.addEventListener('click', () => set('assist'));
    set('screen');
    new MutationObserver(() => { if (phone.matches && stage.dataset.view !== 'assist') dot.hidden = false; }).observe(feed, { childList: true });
  }

  /* ---------- the step line names the step: "Step 3 of 6 · Readiness" (C13) ---------- */
  const steps = $('#steps');
  if (steps) {
    const lab = document.createElement('p'); lab.className = 'x-step-label'; lab.setAttribute('aria-live', 'polite');
    steps.after(lab);
    const items = [...steps.children];
    const upd = () => {
      let i = items.findIndex(li => li.classList.contains('on') || li.classList.contains('hold') || li.classList.contains('fail'));
      if (i < 0) { const done = items.filter(li => li.classList.contains('done')).length; i = Math.min(done, items.length - 1); }
      lab.textContent = t('الخطوة ', 'Step ') + (i + 1) + t(' من ', ' of ') + items.length + ' · ' + items[i].textContent.trim();
    };
    upd();
    new MutationObserver(upd).observe(steps, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ---------- permissions: each tier opens a real example (C19) ---------- */
  $$('.x-perm .lv').forEach(li => {
    const toggle = () => {
      const open = li.getAttribute('aria-expanded') !== 'true';
      $$('.x-perm .lv').forEach(o => o.setAttribute('aria-expanded', 'false'));
      li.setAttribute('aria-expanded', String(open));
    };
    li.addEventListener('click', toggle);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  /* ---------- rooms: mark the one on the guest screen "showing now" (C24) ---------- */
  const capName = $('#capName'), bento = $('#bento');
  if (capName && bento) {
    const mark = () => {
      const name = capName.textContent.trim();
      bento.querySelectorAll('.bento').forEach(b => { const n = b.querySelector('.info b'); b.classList.toggle('x-now', !!n && n.textContent.trim() === name); b.dataset.now = t('معروضة الآن', 'Showing now'); });
    };
    mark();
    new MutationObserver(mark).observe(capName, { childList: true, characterData: true, subtree: true });
    new MutationObserver(mark).observe(bento, { childList: true });
  }

  /* ---------- chat assistant: introduced once, on the first visit (C14) ---------- */
  const fab = $('#helpFab');
  if (fab && !store.get('sila.chatHint')) {
    const tip = document.createElement('div'); tip.className = 'x-chat-tip'; tip.setAttribute('role', 'status');
    const p = document.createElement('p'); p.textContent = t('اسأل صلة: الأسعار، تسجيل الوصول، أو حجز قاعة.', 'Ask Sila: rates, check-in, or booking a hall.');
    const x = document.createElement('button'); x.type = 'button'; x.setAttribute('aria-label', t('إغلاق', 'Close')); x.textContent = '×';
    tip.append(p, x); document.body.append(tip);
    const close = () => { tip.classList.remove('on'); store.set('sila.chatHint', '1'); setTimeout(() => tip.remove(), 400); };
    x.addEventListener('click', close); fab.addEventListener('click', close);
    setTimeout(() => tip.classList.add('on'), 4500);
    setTimeout(() => { if (tip.isConnected) close(); }, 16000);
  }

  /* ---------- mobile menu (C1) ---------- */
  const menuBtn = $('#xMenuBtn'), menu = $('#xMenu');
  if (menuBtn && menu) {
    const setMenu = open => {
      menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('x-menu-open', open);
      if (open) { const f = menu.querySelector('a'); if (f) f.focus(); }
    };
    menuBtn.addEventListener('click', () => setMenu(menu.hidden));
    menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); } });
  }

  /* ---------- links into sections, the planner and the chat ---------- */
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go-x]');
    if (go) { e.preventDefault(); scrollToId(go.dataset.goX); try { history.replaceState(null, '', '#' + go.dataset.goX); } catch (er) {} return; }
    if (e.target.closest('[data-events]')) { const s = $('#sysEvents'); if (s) s.click(); return; }
    if (e.target.closest('[data-chat]')) { const f = $('#helpFab'); if (f) f.click(); }
  });

  /* ---------- deep links to sections, e.g. index.html#system (C27) ---------- */
  const want = (window.__SILA_HASH || '').slice(1);
  if (want && want !== 'stay' && want !== 'events' && document.getElementById(want)) setTimeout(() => scrollToId(want), 120);

  /* ---------- micro-interaction: hero buttons lean softly toward the pointer ---------- */
  if (!reduced && matchMedia('(hover: hover)').matches) {
    $$('.x-hero .big').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 8}px, ${((e.clientY - r.top) / r.height - .5) * 6}px)`; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }
})();
