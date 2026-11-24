/* صلة 2.1 — طبقة التجربة: الحركة والسرد والتفاعلات فوق النموذج الأولي (app.js). لا تغيّر منطق النموذج. */
(() => {
  const EN = document.documentElement.lang === 'en';
  const t = (ar, en) => (EN ? en : ar);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  if (!reduced) root.classList.add('x-motion');
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const scrollToId = id => { const n = document.getElementById(id); if (n) n.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); };

  /* ---------- hero: staged entrance, word-by-word title ---------- */
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

  /* ---------- hero: the live decision stream (real prototype behaviours) ---------- */
  const EVENTS = [
    [t('تسجيل وصول برقم الهوية', 'Check-in by ID number'), t('وجدت الحجز وسجّلت الوصول', 'Booking found, guest checked in'), 'auto', t('بنفسه', 'On its own')],
    [t('«سرير إضافي للطفل، وسيارة للمطار»', '“Extra bed for the child, car to the airport”'), t('طلبان: التدبير الفندقي والكونسيرج', 'Two requests: housekeeping and concierge'), 'auto', t('بنفسه', 'On its own')],
    [t('الغرفة 207 قيد التجهيز', 'Room 207 still being prepared'), t('نقل لغرفة 209 الجاهزة بنفس السعر', 'Moved to ready room 209, same price'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('«الرمز لا يفتح الباب»', '“The code does not open the door”'), t('إلغاء الرمز القديم وإصدار رمز جديد', 'Old code cancelled, new code issued'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('«أريد استرجاع المبلغ»', '“I want a refund”'), t('حُوّل لموظف الاستقبال للموافقة', 'Sent to reception for approval'), 'staff', t('للموظف', 'To staff')],
    [t('تأخير المغادرة ساعة', 'One-hour late checkout'), t('مسموح ضمن صلاحيات الفندق', 'Allowed within hotel permissions'), 'limit', t('ضمن الحدود', 'Within limits')],
    [t('طلب فتح غرفة لغير صاحب الحجز', 'Asked to open a room for someone else'), t('رُفض: ممنوع دائماً', 'Refused: never allowed'), 'never', t('ممنوع', 'Never')],
    [t('«المكيف لا يعمل»', '“The AC is not working”'), t('بلاغ صيانة فُتح وأُبلغ النزيل', 'Maintenance ticket opened, guest informed'), 'auto', t('بنفسه', 'On its own')]
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

  /* ---------- reveals (staggered among siblings), counters ---------- */
  const groups = new Map();
  $$('[data-rv]').forEach(n => { const p = n.parentElement; const i = groups.get(p) || 0; n.style.setProperty('--d', i); groups.set(p, i + 1); });
  const count = n => {
    const to = Number(n.dataset.count), pre = n.dataset.prefix || '';
    if (reduced) { n.textContent = pre + to; return; }
    const t0 = performance.now(), D = 1400;
    (function f(now) { const p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 4); n.textContent = pre + Math.round(to * e); if (p < 1) requestAnimationFrame(f); })(t0);
  };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('on'); io.unobserve(e.target);
      e.target.querySelectorAll('[data-count]').forEach(count);
    }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    $$('[data-rv], .x-perm .ladder').forEach(n => io.observe(n));
  } else $$('[data-rv], .x-perm .ladder').forEach(n => n.classList.add('on'));

  /* ---------- the answer: a pulse travels guest → Sila → hotel ---------- */
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

  /* ---------- the system: sticky device that follows the capability in focus ---------- */
  const screens = $('#xScreens'), caps = $$('.x-cap');
  if (screens && caps.length) {
    const src = k => 'media/' + k + '-' + (EN ? 'en' : 'ar') + '.webp';
    const imgs = {};
    caps.forEach((c, i) => {
      const k = c.dataset.shot;
      const im = new Image(); im.src = src(k); im.alt = ''; im.decoding = 'async'; if (i > 0) im.loading = 'lazy';
      screens.append(im); imgs[k] = im;
      const inline = document.createElement('div'); inline.className = 'x-shot';           // phones and tablets see the shot inside the item
      const im2 = new Image(); im2.src = src(k); im2.alt = c.querySelector('h3').textContent; im2.loading = 'lazy'; im2.decoding = 'async';
      inline.append(im2); c.querySelector('p').after(inline);
    });
    const show = c => { caps.forEach(x => x.classList.toggle('on', x === c)); Object.entries(imgs).forEach(([k, im]) => im.classList.toggle('on', k === c.dataset.shot)); };
    show(caps[0]);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) show(e.target); }), { rootMargin: '-45% 0px -45% 0px' });
      caps.forEach(c => io.observe(c));
    }
  }

  /* ---------- strategic opportunities: tabs ---------- */
  const tabs = $$('.x-ops-tabs [data-op]'), panels = $$('.x-op[data-op]');
  let currentOp = 'acquire';
  const pick = (op, focus) => {
    currentOp = op;
    tabs.forEach(b => { const on = b.dataset.op === op; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
    panels.forEach(p => { const on = p.dataset.op === op; p.hidden = !on; if (on && !reduced) { p.style.animation = 'none'; p.offsetHeight; p.style.animation = ''; } });
  };
  tabs.forEach((b, i) => {
    b.addEventListener('click', () => pick(b.dataset.op));
    b.addEventListener('keydown', e => {
      const fwd = EN ? 'ArrowRight' : 'ArrowLeft', back = EN ? 'ArrowLeft' : 'ArrowRight';
      let j = null;
      if (e.key === fwd || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      if (e.key === back || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      if (j != null) { e.preventDefault(); pick(tabs[j].dataset.op, true); }
    });
  });
  if (tabs.length) pick('acquire');

  /* ---------- links into the prototype and the briefing ---------- */
  document.addEventListener('click', e => {
    const go = e.target.closest('[data-go-x]');
    if (go) { e.preventDefault(); scrollToId(go.dataset.goX); return; }
    if (e.target.closest('[data-events]')) { const s = $('#sysEvents'); if (s) s.click(); return; }
    if (e.target.closest('[data-chat]')) { const f = $('#helpFab'); if (f) f.click(); return; }
    const br = e.target.closest('[data-brief]');
    if (br) {
      const sel = $('#xInterest');
      if (sel && br.closest('.x-ops')) sel.value = currentOp;
      const stay = $('#sysStay');
      if (stay && stay.getAttribute('aria-pressed') !== 'true') { stay.click(); setTimeout(() => scrollToId('brief'), 60); }
      else scrollToId('brief');
      setTimeout(() => { const f = document.querySelector('#xBrief input[name="name"]'); if (f) f.focus({ preventScroll: true }); }, reduced ? 0 : 700);
    }
  });

  /* ---------- private briefing form ---------- */
  const form = $('#xBrief');
  if (form) {
    const msg = $('#xBriefMsg'), copy = $('#xCopy'), copyText = $('#xCopyText'), copyBtn = $('#xCopyBtn');
    const to = ((document.querySelector('meta[name="sila-contact"]') || {}).content || '').trim();
    form.addEventListener('submit', e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const need = ['name', 'org'].filter(k => !String(f[k] || '').trim());
      form.querySelectorAll('input').forEach(i => i.classList.toggle('bad', need.includes(i.name)));
      if (need.length) { msg.className = 'x-form-msg bad'; msg.textContent = t('اكتب الاسم والجهة من فضلك.', 'Please add your name and organisation.'); return; }
      const interest = form.querySelector('select option:checked').textContent.trim();
      const subject = t('طلب عرض خاص: صلة 2.1', 'Private briefing request: Sila 2.1');
      const body = [
        t('الاسم: ', 'Name: ') + f.name.trim(),
        t('الجهة: ', 'Organisation: ') + f.org.trim(),
        f.role && f.role.trim() ? t('المنصب: ', 'Role: ') + f.role.trim() : '',
        t('مجال الاهتمام: ', 'Interest: ') + interest,
        f.msg && f.msg.trim() ? '\n' + f.msg.trim() : ''
      ].filter(Boolean).join('\n');
      if (to) {
        location.href = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
        msg.className = 'x-form-msg'; msg.textContent = t('فتحنا بريدك وفيه الطلب جاهزاً للإرسال.', 'Your email app is open with the request ready to send.');
      } else {
        copy.hidden = false; copyText.value = subject + '\n\n' + body;
        msg.className = 'x-form-msg'; msg.textContent = t('طلبك جاهز. انسخه وأرسله عبر القناة التي وصلتك منها هذه الصفحة.', 'Your request is ready. Copy it and send it through the channel that brought you this page.');
      }
    });
    if (copyBtn) copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copyText.value); } catch (e) { copyText.select(); document.execCommand && document.execCommand('copy'); }
      copyBtn.textContent = t('نُسخ ✓', 'Copied ✓');
    });
  }

  /* ---------- micro-interaction: buttons lean softly toward the pointer ---------- */
  if (!reduced && matchMedia('(hover: hover)').matches) {
    $$('.x-hero .big, .x-ops .big, .x-brief .big').forEach(b => {
      b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left) / r.width - .5) * 8}px, ${((e.clientY - r.top) / r.height - .5) * 6}px)`; });
      b.addEventListener('pointerleave', () => { b.style.transform = ''; });
    });
  }
})();
