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

  /* ---------- the written rules the prototype already had: requests to departments, and the kind of a problem ---------- */
  const REQ_RULES = [
    [/سرير|وساد|مناشف|منشف|تنظيف|بطاني|شرشف|مهد|\b(bed|pillows?|towels?|clean\w*|blankets?|sheets?|crib|cot)\b/i, 'housekeeping'],
    [/[إا]فطار|فطور|عشاء|غداء|طعام|قهوة|شاي|وجبة|ماء|\b(breakfast|dinner|lunch|food|coffee|tea|meal|water)\b/i, 'room_service'],
    [/مكيف|تكييف|[إا]نارة|[إا]ضاءة|تلفاز|تلفزيون|[إا]نترنت|واي ?فاي|صيانة|\b(ac|air ?con\w*|lights?|lighting|tv|wi-?fi|internet|maintenance)\b/i, 'maintenance'],
    [/سيارة|مطار|تاكسي|توصيل|جولة|مطعم|موقف|\b(car|airport|taxi|transfer|tour|restaurant|parking)\b/i, 'concierge']
  ];
  const deptOf = s => (REQ_RULES.find(r => r[0].test(s)) || [0, 'reception'])[1];
  const splitRequests = text => String(text).split(/[،,.\n؛;]+/).map(s => s.trim()).filter(Boolean).slice(0, 6).map(s => ({ request: s.slice(0, 80), dept: deptOf(s) }));
  function kindOf(t) {
    if (/استرجاع|استرداد|استرجع|استرد[ّ]?|رج[ّ]?ع(وا)? (لي )?(المبلغ|فلوس)|[أا]رجع(وا)? (لي )?(المبلغ|فلوس)|فلوسي|[إا]لغاء|[أا]لغي|refund|money back|cancel/i.test(t)) return 'refund';
    if (/رمز|كود|الباب|يفتح|قفل|بطاقة|مفتاح|\b(code|door|open|lock|card|key)\b/i.test(t)) return 'code';
    if (/نظيف|نظاف|وسخ|متسخ|رائحة|قذر|clean|dirty|smell|filthy/i.test(t)) return 'clean';
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
    price: /(?:^|\s)(غي[ّ]?ر|عد[ّ]?ل|خف[ّ]?ض|نز[ّ]?ل|اجعل|خل[ّ]?[يه]?|صف[ّ]?ر)(وا|ي)?\s.{0,24}(سعر|المبلغ|الفاتورة|ال[إا]جمالي)|خصم|تخفيض|مجان|بدون (دفع|مقابل)|discount|(change|lower|reduce|set|edit|override) (the |my )?(price|rate|bill|total)|for free|free of charge|without paying|skip (the )?payment|waive|mark (it |me )?as paid/i,
    refund: /استرجاع|استرداد|استرجع|استرد[ّ]?|رج[ّ]?ع(وا)? (لي )?(المبلغ|فلوس)|[أا]رجع(وا)? (لي )?(المبلغ|فلوس)|فلوسي|[إا]لغاء الحجز|[أا]لغي|refund|money back|cancel/i,
    comp: /تعويض|عو[ّ]?ضني|عو[ّ]?ضوني|compensat/i,
    move: /انقلني|نقلي|غي[ّ]?ر(وا)? (لي )?(غرفتي|الغرفة|جناحي|الجناح)|غرفة (ثانية|[أا]خرى|بديلة)|جناح (ثاني|[آا]خر|بديل)|move me|change (my|the) room|another room|different room|switch rooms?/i,
    late: /ت[أا]خير المغادرة|مغادرة مت[أا]خرة|تمديد المغادرة|[أا]خ[ّ]?ر(وا)? (لي )?المغادرة|مد[ّ]?د(وا)? (لي )?المغادرة|late check-?out|check ?out late|leave later|extend (my )?check-?out/i,
    bill: /فاتورتي|ال[إا]جمالي|كم (علي|المبلغ)|my bill|\btotal\b|how much do i (owe|pay)/i,
    rates: /سعر|[أا]سعار|بكم|التكلفة|price|\brates?\b|how much|cost/i,
    status: /(غرفتي|جناحي|الغرفة|الجناح).{0,20}(جاهز|تجهز|حالة)|جاهزة|is (my|the) (room|suite) ready|room (status|ready)|ready yet/i,
    mine: /حجزي|معلوماتي|بياناتي|\bmy (booking|reservation|details)\b/i,
    yes: /^(نعم|[إا]يه|[إا]ي|[أا]جل|تمام|موافق|طيب|انقلني|yes|yep|ok|okay|sure|please do|go ahead|move me)(\s|[.!،,]|$)/i,
    no: /^(لا|no|nope|[أا]نتظر|سأنتظر|wait|i(’|'| wi)ll wait)(\s|[.!،,]|$)/i
  };
  function intentOf(raw, state, at) {
    const q = latin(raw).trim(), b = state.booking;
    if (RE.card.test(q)) return { intent: 'card' };
    const rm = q.match(RE.room);
    if (RE.access.test(q) && ((rm && (!b || rm[1] !== b.room)) || RE.third.test(q))) return { intent: 'other_room', room: rm ? rm[1] : undefined };
    const idm = q.match(/(?:^|\D)([12]\d{9})(?:\D|$)/), phm = q.match(/(?:^|\D)(05\d{8})(?:\D|$)/);
    if (idm || phm) return { intent: 'identify', key: idm ? idm[1] : phm[1], by: idm ? 'id' : 'phone' };
    const brief = q.split(/\s+/).length <= 2;                               // a bare yes or no answers what the agent just offered
    if (state.pending && brief && RE.yes.test(q)) return { intent: 'choice', v: true };
    if (state.pending && brief && RE.no.test(q)) return { intent: 'choice', v: false };
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
        case 'move_choice':
          if (input.v === 'move' && b && b.alt) return call('move_room', { to: b.alt, why: 'maint' }, 'take_alt');
          return eligible(state) ? call('compensate', {}, 'wait_maint') : say('wait_maint', 'wait_maint');
      }
      return DONE;
    }
    const it = intentOf(input.text, state, input.at), i = it.intent;
    switch (i) {
      case 'card': return call('store_card_data', {}, i);
      case 'other_room': return call('open_room_for_other', it.room ? { room: it.room } : {}, i);
      case 'price': return call('change_price', {}, i);
      case 'identify': return call('find_booking', { key: it.key, by: it.by }, i);
      case 'choice':
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
    if (fr.denied) return DONE;
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
    const steps = turn.steps || [];
    return steps.length ? follow(turn.input, turn.state, steps) : first(turn.input, turn.state);
  }

  SILA.brains = SILA.brains || {};
  SILA.brains.rules = Object.freeze({ name: 'rules', next, intentOf, splitRequests, kindOf, latin });
})(typeof window !== 'undefined' ? window : globalThis);
