/* صلة — the rules brain. It is the default brain: it runs in the browser, always, at no cost.
   One interface for every brain:   next({ input, state, steps, lang })  ->  an action, as plain JSON
     input  { type: 'text', text, at }  what the guest wrote (data, never instructions), and the stage the turn started at
            { type: 'event', name, ... } something the guest did on the screen: entered a number, paid, picked an option
     state  a redacted picture of the booking (see snapshot() in app.js): no identity numbers, no contact details
     steps  what this turn has done so far: [{ tool, args, result } | { say }]
   action   { tool, args, intent }   propose a tool call; the permission engine decides whether it runs
            { say, intent, end }     ask the page to say one of its own fixed sentences; end: false keeps the turn going
            { done: true }           nothing more to do
   A brain only ever proposes. It cannot run a tool, grant itself a permission, or state an amount. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const DONE = { done: true };
  const call = (tool, args, intent) => ({ tool, args: args || {}, intent });
  const say = (code, intent, end) => ({ say: code, intent: intent || code, end: end !== false });
  const latin = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));

  /* Arabic typed in Latin letters ("el mokayef 5arban"): the common hotel words are put back into Arabic before the rules read
     the message. A short list of spellings, not a transliterator; what it misses goes to reception as a note, as before. */
  const ARABIZI = [
    [/\b(el[ -]?|al[ -]?)?(mo?u?kay+[ei]f|mkay+[ei]f|taky[ei]+f)\b/gi, 'المكيف'],
    [/\b(5arban[ae]?|kh?arban[ae]?|5rban|3a[t6]lan[ae]?|baye[zd]|m[aeou]sh? sha(gh|8)[a]?l|ma y[ei]?sh?ta(gh|8)[ae]?l|ma ysh?tghl)\b/gi, 'خربان'],
    [/\b(7ar+|7ara)\b/gi, 'حر'],
    [/\b(el[ -]?|al[ -]?)?(gh|8|g)[ou]rf(a|ti|ty)\b/gi, 'الغرفة'],
    [/\b(w[ei]s5[ae]?|waskh[ae]?|m[ou]sh? n[ae][dt]h?[ei]+f[ae]?)\b/gi, 'وسخة'],
    [/\b(tan[dz]h?[ei]+f|na[dt]h?afa)\b/gi, 'تنظيف'],
    [/\b(manash[ei]f|f[ou]wa[t6])\b/gi, 'مناشف'],
    [/\b(m[eoi]f?ta[7h]|m[eoi]fta7)\b/gi, 'مفتاح'],
    [/\b(el[ -]?|al[ -]?)(ramz|kod|code)\b|\bramz\b/gi, 'الرمز'],
    [/\b(el[ -]?|al[ -]?)bab\b/gi, 'الباب'],
    [/\b(ma|mo|mu|msh|mesh) (b?y[ei]fta[7h])\b/gi, 'لا يفتح'],
    [/\b(f[ou]?[t6]oo?r|[ei]f[t6]ar)\b/gi, 'فطور'],
    [/\b(f[eu]?loo?si|f[eu]?loo?s|flousi?)\b/gi, 'فلوسي'],
    [/\b(ra[jg]+[ae]?3o?(oli|li)?|[ei]st[ei]r[jg]a3)\b/gi, 'استرجاع'],
    [/\b([eio]n[28gq][eo]lni|na[gq]lni)\b/gi, 'انقلني'],
    [/\b(gh|8)ay+[eia]ro?\b/gi, 'غير'],
    [/\b(a(5|kh)[eia]?ro?(oli| li)?)\b/gi, 'أخروا لي'],
    [/\b(ta2?(5|kh)[ei]+r)\b/gi, 'تأخير'],
    [/\b(el[ -]?|al[ -]?)?m[ou](gh|8)ad[a]?ra\b/gi, 'المغادرة'],
    [/\b(se3r|as3ar|b[ei]?kam)\b/gi, 'سعر'],
    [/\b(ta3w[ei]+[dz]|3aw+[ae]?[dz](ni|oni|ooni))\b/gi, 'تعويض'],
    [/\b(sar[ei]+r)\b/gi, 'سرير'], [/\b(m[ei]khad+a|w[ei]sada)\b/gi, 'وسادة'], [/\b(may+a|mo[iy]+a)\b/gi, 'ماء'],
    [/\b(say+ara)\b/gi, 'سيارة'], [/\b(ma[t6]ar)\b/gi, 'مطار'], [/\b(ma[t6]3am|mata3em)\b/gi, 'مطعم'],
    [/\b(wein|wain|ween)\b/gi, 'وين'], [/\b(a[2gq]rab)\b/gi, 'أقرب'], [/\b(th?an[iy]+a|tany+a)\b/gi, 'ثانية']
  ];
  const norm = s => {
    let t = latin(s).replace(/(?<=[\u0621-\u064A]{3})ه(?![\u0621-\u064A])/g, 'ة');      // «الغرفه» is «الغرفة»
    if (/[a-z]/i.test(t)) for (const [re, word] of ARABIZI) t = t.replace(re, ' ' + word + ' '); return t.replace(/\s+/g, ' '); };

  /* ---------- the written rules the prototype already had: requests to departments, and the kind of a problem ---------- */
  const REQ_RULES = [
    [/سرير|وساد|مناشف|منشف|تنظيف|بطاني|شرشف|مهد|\b(bed|pillows?|towels?|clean\w*|blankets?|sheets?|crib|cot)\b/i, 'housekeeping'],
    [/[إا]فطار|فطور|عشاء|غداء|طعام|قهوة|شاي|وجبة|ماء|\b(breakfast|dinner|lunch|food|coffee|tea|meal|water)\b/i, 'room_service'],
    [/مكيف|تكييف|[إا]نارة|[إا]ضاءة|تلفاز|تلفزيون|[إا]نترنت|واي ?فاي|صيانة|\b(ac|air ?con\w*|lights?|lighting|tv|wi-?fi|internet|maintenance)\b/i, 'maintenance'],
    [/سيارة|مطار|تاكسي|توصيل|جولة|مطعم|موقف|\b(car|airport|taxi|transfer|tour|restaurant|parking)\b/i, 'concierge']
  ];
  const deptOf = s => { const t = norm(s); return (REQ_RULES.find(r => r[0].test(t)) || [0, 'reception'])[1]; };
  const splitRequests = text => String(text).split(/[،,.\n؛;]+/).map(s => s.trim()).filter(Boolean).slice(0, 6).map(s => ({ request: s.slice(0, 80), dept: deptOf(s) }));
  function kindOf(t) {
    if (/استرجاع|استرداد|استرجع|استرد[ّ]?|رج[ّ]?ع(وا)? (لي )?(المبلغ|فلوس)|[أا]رجع(وا)? (لي )?(المبلغ|فلوس)|فلوسي|[إا]لغاء|[أا]لغي|refund|money back|cancel/i.test(t)) return 'refund';
    if (/رمز|كود|الباب|يفتح|قفل|مقفل|مسك[ّ]?ر|بطاقة|كرت|مفتاح|\b(code|door|open|lock|card|key)\b/i.test(t)) return 'code';
    if (/نظيف|نظاف|وسخ|وصخ|متسخ|رائحة|ريحة|قذر|زبالة|clean|dirty|smell|filthy/i.test(t)) return 'clean';
    /* Gulf and everyday wording for a fault: "hot", "not cooling", "dead", "cut off", "not running" */
    if (/(?<![\u0621-\u064A])(حر|حار[ةه]?|برد|بارد[ةه]?|طافي[ةه]?|مقطوع[ةه]?|خرب|خربت|عطلان[ةه]?|بايظ[ةه]?)(?![\u0621-\u064A])|ما (ي|ت)بر[ّ]?د|م[وش] (شغ[ّ]?ال|راضي)|ما (ي|ت)شتغل|يسر[ّ]?ب|يخر[ّ]?|\b(too (hot|cold)|not cooling|won'?t (turn on|work)|doesn'?t work|stopped working|out of order)\b/i.test(t)) return 'maint';
    if (/مكيف|تكييف|صيانة|عطل|خربان|معطل|لا يعمل|ما يشتغل|ماء|سباكة|تسريب|كهرب|[إا]نارة|[إا]ضاءة|تلفاز|[إا]نترنت|\b(ac|air ?con\w*|tv)\b|maintenance|broken|not working|water|plumbing|leak|electric|light|internet|wi-?fi/i.test(t)) return 'maint';
    return 'other';
  }

  /* ---------- what does the guest want? Arabic and English. The text is only ever matched against patterns. ---------- */
  const RE = {
    card: /\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b|\bcvv\b|\bcvc\b|card (number|details)|credit card number|رقم (ال)?بطاق|بيانات (ال)?بطاق|احفظ(وا)? بطاقتي|save my card|charge (my|the|this) card/i,
    room: /(?:غرفة|الغرفة|جناح|الجناح|room|suite)\s*(?:رقم|number|no\.?|#)?\s*(\d{3,4})/i,
    access: /افتح|فتح|[أا]عط|[أا]رسل|[أا]صدر|رمز|مفتاح|كود|دخ[ّ]?لني|\b(open|unlock|key|code|access|enter|let me in)\b/i,
    third: /لصديق|لزميل|لصاحب|لشخص|ل[أا]خي|لزوج|غرفة (صديق|جار|زميل)|غير غرفتي|ليست غرفتي|for (my|a|the) (friend|colleague|brother|sister|wife|husband|guest)|someone else|another guest|(friend|neighbou?r|colleague)['’]?s room|not my room/i,
    keyWant: /([أا]عطني|[أا]رسل|[أا]صدر|[أا]بغى|[أا]بي|[أا]ريد|وين|[أا]ين|هات).{0,24}(مفتاح|رمز|الكود)|\b(give|send|issue|get|want|need|where)\b.{0,30}\b(key|code)\b/i,
    price: /(?:^|\s)[وف]?(غي[ّ]?ر|عد[ّ]?ل|خف[ّ]?ض|نز[ّ]?ل|اجعل|خل[ّ]?[يه]?|صف[ّ]?ر)(وا|ي)?\s.{0,24}(سعر|المبلغ|الفاتورة|ال[إا]جمالي)|خصم|تخفيض|مجان|بدون (دفع|مقابل)|discount|(change|lower|reduce|set|edit|override) (the |my )?(price|rate|bill|total)|for free|free of charge|without paying|skip (the )?payment|waive|mark .{0,24}as paid/i,
    refund: /استرجاع|استرداد|استرجع|استرد[ّ]?|رج[ّ]?ع(وا)? (لي )?(المبلغ|فلوس)|[أا]رجع(وا)? (لي )?(المبلغ|فلوس)|فلوسي|[إا]لغاء الحجز|[أا]لغي|refund|money back|cancel/i,
    comp: /تعويض|عو[ّ]?ضني|عو[ّ]?ضوني|compensat/i,
    move: /انقلني|انقلوني|نقلي|حو[ّ]?لوني|(غي[ّ]?ر|بد[ّ]?ل)(وا)? (لي )?(غرفتي|الغرفة|جناحي|الجناح)|غرفة (ثانية|[أا]خرى|بديلة|غيرها|غير (هذي|هذه|ذي))|جناح (ثاني|[آا]خر|بديل)|move me|change (my|the) room|another room|different room|switch rooms?/i,
    late: /(ت[أا]خير|تمديد|[أا]خ[ّ]?ر(وا)?( لي)?|مد[ّ]?د(وا)?( لي)?) (ال)?(مغادرة|خروج|طلعة|تشيك ?[أا]وت|شيك ?[أا]وت)|مغادرة مت[أا]خرة|[أا]طلع مت[أا]خر|late check-?out|check ?out late|leave later|extend (my )?check-?out/i,
    bill: /فاتورتي|ال[إا]جمالي|كم (علي|المبلغ)|my bill|\btotal\b|how much do i (owe|pay)/i,
    rates: /سعر|[أا]سعار|بكم|كم الليلة|التكلفة|price|\brates?\b|how much|cost/i,
    status: /(غرفتي|جناحي|الغرفة|الجناح).{0,20}(جاهز|تجهز|حالة)|جاهزة|is (my|the) (room|suite) ready|room (status|ready)|ready yet/i,
    mine: /حجزي|معلوماتي|بياناتي|\bmy (booking|reservation|details)\b/i,
    yes: /^(نعم|[إا]يه|[إا]ي|[أا]جل|تمام|موافق|طيب|انقلني|[أا]ك[ّ]?د|نف[ّ]?ذ|yes|yep|ok|okay|sure|please do|go ahead|move me|confirm|do it)(\s|[.!،,]|$)/i,
    no: /^(لا|no|nope|[أا]نتظر|سأنتظر|wait|i(’|'| wi)ll wait)(\s|[.!،,]|$)/i
  };
  /* a question about the hotel's surroundings or its policies is answered from the hotel's data, not logged as a request */
  const ASKS = /[?؟]|^(وين|[أا]ين|فين|متى|هل|وش|[إا]يش|شنو|ما هي|ما هو|كيف|في|فيه|where|when|what|which|how|is there|are there|do you|does|can i|any)(?![\u0621-\u064Aa-z])|[أا]قرب|قريب|nearest|nearby|near (the|here)|recommend|تنصح|تقترح/i;
  const INFO = [
    ['checkout', /(متى|وقت|موعد|ساعة|كم الساعة).{0,20}(المغادرة|الخروج|تسجيل الخروج)|(المغادرة|الخروج).{0,12}(متى|الساعة كم|[أا]ي ساعة)|check-?out time|(what time|when).{0,24}check-?out/i, false],
    ['refunds', /سياسة.{0,12}(الاسترجاع|الاسترداد|ال[إا]لغاء)|(refund|cancell?ation) policy/i, true],
    ['restaurants', /مطعم|مطاعم|restaurants?|places? to eat|where (can|to) (i )?eat/i, true],
    ['landmarks', /معالم|معلم|[أا]ماكن.{0,12}(زيار|سياح)|سياح|وين [أا]روح|[أا]زور|landmarks?|sights?|attractions?|places to (see|visit)|things to do|what to (see|visit)/i, true],
    ['tax', /ضريبة|\bvat\b|\btax(es)?\b/i, true]
  ];
  const infoOf = q => { const asks = ASKS.test(q), hit = INFO.find(i => i[1].test(q) && (asks || !i[2])); return hit ? hit[0] : null; };
  function intentOf(raw, state, at) {
    const q = norm(raw).trim(), b = state.booking;
    if (RE.card.test(q)) return { intent: 'card' };
    const rm = q.match(RE.room);
    if (RE.access.test(q) && ((rm && (!b || rm[1] !== b.room)) || RE.third.test(q))) return { intent: 'other_room', room: rm ? rm[1] : undefined };
    const idm = q.match(/(?:^|\D)([12]\d{9})(?:\D|$)/), phm = q.match(/(?:^|\D)(05\d{8})(?:\D|$)/);
    if (idm || phm) return { intent: 'identify', key: idm ? idm[1] : phm[1], by: idm ? 'id' : 'phone' };
    const brief = q.split(/\s+/).length <= 2;                               // a bare yes or no answers what the agent just offered
    if (state.pending && brief && RE.yes.test(q)) return { intent: 'choice', v: true };
    if (state.pending && brief && RE.no.test(q)) return { intent: 'choice', v: false };
    const topic = infoOf(q);
    if (topic) return { intent: 'info', topic };
    if (RE.keyWant.test(q)) return { intent: 'give_key', via: /email|e-mail|بريد|[إا]يميل/i.test(q) ? 'email' : /\bcard\b|بطاقة/i.test(q) ? 'card' : /sms|رسالة|جوال/i.test(q) ? 'sms' : null };
    if (RE.price.test(q)) return { intent: 'price' };
    if (RE.refund.test(q)) return { intent: 'refund' };
    if (RE.comp.test(q)) { const n = q.replace(/,/g, '').match(/\d{2,6}/); return { intent: 'comp', requested: n ? parseInt(n[0], 10) : undefined }; }
    if (RE.move.test(q)) return { intent: 'move' };
    if (RE.late.test(q)) return { intent: 'late' };
    if (at !== 'requests' && at !== 'identify' && b) {                    // a problem can only be about a room the guest has reached
      const k = kindOf(q);
      if (k === 'code') return { intent: b.key ? 'code' : 'give_key', via: null };
      if (k === 'clean' || k === 'maint') return { intent: k };
    }
    if (RE.bill.test(q)) return { intent: 'bill' };
    if (RE.rates.test(q)) return { intent: 'rates' };
    if (RE.status.test(q)) return { intent: 'status' };
    if (RE.mine.test(q)) return { intent: 'mine' };
    if (at === 'requests' || REQ_RULES.some(r => r[0].test(q))) return { intent: 'requests' };
    return { intent: 'other' };
  }

  /* ---------- one message, several things ----------
     This brain acts on one intent per message. It still reads the others, so that it can tell the guest which parts it left
     (they are never dropped silently), and so that "move me, but do not change my room" is asked about instead of carried out. */
  const PARTS = ['refund', 'comp', 'move', 'late', 'code', 'give_key', 'clean', 'maint', 'requests', 'bill', 'rates', 'status'];
  const SPLIT = /[،,.؛;\n!؟?]+|\s+(?:and|also|plus|then|but|however|though|&|w|wa|ثم|كمان|وبعدين|بعدين|بس|لكن)\s+|\s+و(?!ساد|سخ|صخ|قت|صول|جب|رق|ين|اي|احد|ضع|ش\s)(?=[\u0621-\u064A])/i;      // «و» joins two requests, unless it is the first letter of a word
  const NO = '(?:^|\\s)(?:لا|ما|مو|لن|بدون|don[’\']?t|do not|not|never|without|no)\\s+(?:\\S+\\s+){0,2}?';
  const NEG = {
    move: new RegExp(NO + '(?:تنقل|تغي[ّ]?ر|[أا]نتقل|[أا]غي[ّ]?ر|نقل|move|change|switch)', 'i'),
    late: new RegExp(NO + '(?:(?:ت[أا]خ[ّ]?ر|تمد[ّ]?د|ت[أا]خير|تمديد)\\S*\\s+(?:\\S+\\s+)?(?:ال)?مغادر|extend|delay)', 'i'),
    refund: new RegExp(NO + '(?:تلغ|تسترجع|ترجع|استرجاع|[إا]لغاء|cancel|refund)', 'i'),
    comp: new RegExp(NO + '(?:تعو[ّ]?ض|تعويض|compensat)', 'i')
  };
  const pieces = raw => norm(raw).split(SPLIT).map(s => (s || '').trim()).filter(Boolean);
  /* 'conflict': the message asks for the intent and, in another clause, for its opposite · 'refused': it only asks not to */
  function stance(raw, intent) {
    const neg = NEG[intent]; if (!neg) return 'asked';
    const cl = pieces(raw), no = cl.filter(c => neg.test(c)), yes = cl.filter(c => !neg.test(c) && RE[intent].test(c));
    return no.length ? (yes.length ? 'conflict' : 'refused') : 'asked';
  }
  /* the other things the message asks for, besides the one this brain acts on */
  function others(raw, state, at, main) {
    if (!state.booking || at === 'identify' || !PARTS.includes(main)) return [];
    const out = [];
    for (const c of pieces(raw)) {
      const i = intentOf(c, state, at).intent;
      if (i !== main && PARTS.includes(i) && !out.includes(i) && stance(c, i) === 'asked') out.push(i);
    }
    return out;
  }

  const eligible = state => { const b = state.booking; return !!(b && b.paid && !b.comp && !b.refunded && state.perms.limit > 0); };

  /* the arrival is a line of steps; this moves the guest to the next one they have not done yet */
  function advance(state, steps, returning) {
    const did = t => steps.some(s => s.tool === t), said = c => steps.some(s => s.say === c);
    if (!state.booking) return DONE;
    switch (state.stage) {
      case 'requests': return said('ask_requests') ? DONE : say('ask_requests', 'next_step');
      case 'readiness': return did('get_room_status') || state.waiting ? DONE : call('get_room_status', {}, 'next_step');
      case 'payment':
        if (!did('get_room_status') && !did('get_rates')) return call('get_room_status', {}, 'next_step');
        return did('get_rates') ? DONE : call('get_rates', { scope: 'bill' }, 'next_step');
      case 'key': return said('ask_key') ? DONE : say('ask_key', 'next_step');
      default: return returning && !said('welcome_back') ? say('welcome_back', 'next_step') : DONE;
    }
  }

  function first(input, state) {
    const b = state.booking;
    if (input.type === 'event') {
      switch (input.name) {
        case 'identify': return call('find_booking', { key: input.key, by: input.by }, 'identify');
        case 'no_requests': return say('no_requests', 'no_requests', false);
        case 'room_choice': return input.v === 'alt' && b && b.alt ? call('move_room', { to: b.alt, why: 'prep' }, 'take_alt') : say('will_notify', 'wait_room');
        case 'room_ready': return say('room_ready', 'room_ready', false);
        case 'paid': return advance(state, []);
        case 'key_choice': return call('issue_key', { via: input.via }, 'key_choice');
        case 'confirm': {                            // the guest answered "shall I ...?": yes proposes the kept call, and the engine decides as for any other
          const k = (state.confirm || [])[0];
          return input.v && k ? call(k.tool, k.args, 'confirmed') : say('confirm_no', 'confirm_no');
        }
        case 'move_choice':
          if (input.v === 'move' && b && b.alt) return call('move_room', { to: b.alt, why: 'maint' }, 'take_alt');
          return eligible(state) ? call('compensate', {}, 'wait_maint') : say('wait_maint', 'wait_maint');
      }
      return DONE;
    }
    const it = intentOf(input.text, state, input.at), i = it.intent, st = stance(input.text, i);
    if (st === 'conflict') return Object.assign(say('clarify', 'clarify'), { text: i });      // a request and its opposite: ask, do not guess
    if (st === 'refused') return say('confirm_no', i);                                       // "do not move me" is not a move
    switch (i) {
      case 'card': return call('store_card_data', {}, i);
      case 'other_room': return call('open_room_for_other', it.room ? { room: it.room } : {}, i);
      case 'price': return call('change_price', {}, i);
      case 'identify': return call('find_booking', { key: it.key, by: it.by }, i);
      case 'choice':
        if (state.pending === 'confirm') return first({ type: 'event', name: 'confirm', v: it.v }, state);
        if (state.pending === 'room_choice') return first({ type: 'event', name: 'room_choice', v: it.v ? 'alt' : 'wait' }, state);
        return first({ type: 'event', name: 'move_choice', v: it.v ? 'move' : 'stay' }, state);
      case 'give_key':
        if (b && b.key) return call('reissue_key', { via: b.key === 'card' ? 'card' : 'code' }, 'code');
        if (state.stage === 'key' && !it.via) return say('ask_key', i);
        return call('issue_key', { via: it.via || 'sms' }, i);
      case 'refund': return call('request_staff_approval', { action: 'refund' }, i);
      case 'comp': return call('compensate', it.requested ? { requested: it.requested } : {}, i);
      case 'move': return b && b.alt ? call('move_room', { to: b.alt, why: 'guest' }, i) : say(b ? 'no_alt' : 'need_id', i);
      case 'late': return call('late_checkout', {}, i);
      case 'code': return call('reissue_key', { via: b.key === 'card' ? 'card' : 'code' }, i);
      case 'clean': return call('open_ticket', { kind: 'clean' }, i);
      case 'maint': return call('open_ticket', { kind: 'maint', text: String(input.text).trim().slice(0, 80) }, i);
      case 'bill': return call('get_rates', { scope: b ? 'bill' : 'tonight' }, i);
      case 'rates': return call('get_rates', { scope: 'tonight' }, i);
      case 'status': return call('get_room_status', {}, i);
      case 'mine': return call('find_booking', {}, i);
      case 'info': return Object.assign(say('info', 'answer'), { text: it.topic });
      case 'requests': { const items = splitRequests(input.text); return items.length ? call('route_request', { items }, i) : say('no_requests', i, false); }
    }
    const note = String(input.text).trim().slice(0, 80);
    return note ? call('route_request', { items: [{ request: note, dept: 'reception' }], note: true }, 'other') : DONE;
  }

  /* after a tool has answered: reply, or carry on with another tool */
  function follow(input, state, steps) {
    const f = steps[0], last = steps[steps.length - 1], b = state.booking, res = last.result || {};
    const did = t => steps.some(s => s.tool === t), said = c => steps.some(s => s.say === c), count = t => steps.filter(s => s.tool === t).length;
    const moved = () => (state.stage !== input.at ? advance(state, steps) : DONE);
    if (f.say) return f.say === 'no_requests' || f.say === 'room_ready' ? advance(state, steps) : DONE;
    const fr = f.result || {}, fa = f.args || {};
    if (f.tool === 'move_room' && !fr.ok) return input.at === 'readiness' && !said('move_failed') ? say('move_failed', 'wait_room') : DONE;
    if (fr.denied || fr.held || fr.error) return DONE;
    switch (f.tool) {
      case 'find_booking':
        if (!fa.key || !fr.ok || !b) return DONE;
        if (!b.arrived && !did('check_in')) return call('check_in', {}, 'identify');
        return advance(state, steps, true);
      case 'check_in': return advance(state, steps, true);
      case 'move_room':
        if (fa.why === 'maint' && eligible(state) && !did('compensate')) return call('compensate', {}, 'apology');
        return moved();
      case 'open_ticket':
        if (fa.kind === 'clean') return state.perms.late && b && !b.late && !did('late_checkout') ? call('late_checkout', {}, 'apology') : DONE;
        if (b && b.alt && !said('offer_move')) return say('offer_move', 'offer_move');
        return eligible(state) && !did('compensate') ? call('compensate', {}, 'apology') : DONE;
      case 'reissue_key':
        return fa.via !== 'card' && res.declined && count('reissue_key') === 1 ? call('reissue_key', { via: 'card' }, 'fallback') : DONE;
      case 'request_staff_approval':
        return res.declined && eligible(state) && !did('compensate') ? call('compensate', {}, 'apology') : DONE;
      case 'compensate':
        return fa.requested && res.declined && eligible(state) && count('compensate') === 1 ? call('compensate', {}, 'fallback') : DONE;
    }
    return moved();
  }

  function next(turn) {
    const steps = turn.steps || [], kept = turn.state.confirm || [], input = turn.input;
    if (steps.length && steps[0].intent === 'confirmed' && kept.length > 1) {      // several kept calls, one yes: each is proposed in its turn
      const n = steps.filter(s => s.intent === 'confirmed').length;
      return n < kept.length ? call(kept[n].tool, kept[n].args, 'confirmed') : DONE;
    }
    const a = steps.length ? follow(input, turn.state, steps) : first(input, turn.state);
    if (input.type !== 'text') return a;
    if (!steps.length) { const main = intentOf(input.text, turn.state, input.at).intent; input.rest = a.say === 'clarify' ? [] : others(input.text, turn.state, input.at, main); }
    if (!input.rest || !input.rest.length || steps.some(s => s.say === 'unhandled')) return a;
    if (a.done) return Object.assign(say('unhandled', 'unhandled'), { text: input.rest.join(',') });      // say which parts were left, rather than drop them
    return a.say && a.end !== false ? Object.assign({}, a, { end: false }) : a;
  }

  SILA.brains = SILA.brains || {};
  SILA.brains.rules = Object.freeze({ name: 'rules', next, follow, intentOf, others, stance, splitRequests, kindOf, latin, norm });
})(typeof window !== 'undefined' ? window : globalThis);
