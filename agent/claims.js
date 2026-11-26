/* صلة — the claim checker. No model is involved: it is a list of verbs, in Arabic and in English.
   A model may write free text (an answer, a question, the closing reply of a turn). Before any of it is shown, this file reads it
   for statements that something WAS done: refunded, moved, issued, opened, extended, compensated, cancelled, approved, sent on,
   discounted, or simply "done". Each kind of statement must be backed by a step of this very turn whose tool ran and succeeded.
   A statement with nothing behind it fails the check, the text is thrown away, and the written rules answer instead.

   check(text, steps) -> { ok, unbacked: [kind] }      steps: the turn so far, as the loop records them ({ tool, result, approved })

   It errs on the side of refusing: a harmless sentence that only sounds like a claim costs one fixed answer, while a false
   "your refund is approved" costs the hotel a guest. Negations ("was not issued"), conditions ("once approved"), offers and
   questions ("shall I move you?") and plain policy ("a key is issued after payment") are let through. */
(root => {
  const SILA = root.SILA = root.SILA || {};

  /* the tools whose success backs each kind of statement; a price is never changed by any tool, so nothing backs it */
  const BACK = {
    refund: ['request_staff_approval'], move: ['move_room'], key: ['issue_key', 'reissue_key', 'move_room'], ticket: ['open_ticket'],
    late: ['late_checkout'], comp: ['compensate'], cancel: ['request_staff_approval', 'reissue_key', 'move_room'],
    request: ['route_request', 'open_ticket', 'check_in'], price: []
  };

  const EN = {
    refund: /\b(refunded|reimbursed)\b|\b(refund|reimbursement|money|amount|payment)\s+(is|was|has been|have been)\s+(now\s+)?(fully\s+)?(approved|processed|being processed|issued|completed|done|returned|sent back|on (its|the) way|credited)/g,
    move: /\b(moved|relocated|transferred|switched|upgraded)\b|\byour new (room|suite) is\b/g,
    key: /\b(re-?issued|issued|regenerated|re-?sent)\b|\b(sent|reset|texted|emailed)\s+(you\s+)?(a\s+|the\s+|your\s+)?(new\s+)?(key|code|access code|passcode)\b|\bnew (code|key|passcode)\s+(is|was|has been)\s+(sent|issued|ready|active|on (its|the) way)/g,
    ticket: /\b(opened|logged|filed|created|raised|submitted)\b|\b(sent|dispatched|called)\s+(a\s+|the\s+|our\s+|someone from\s+)?(maintenance|housekeeping|technician|team|engineer|cleaner)|\b(technician|maintenance|housekeeping|team|someone|engineer|cleaner)\s+(is|are)\s+(already\s+)?on\s+(the|its|their|his|her)\s+way/g,
    late: /\b(extended|prolonged|pushed back)\b|\bcheck-?out\s+(is now|has been|was)\b|\blate check-?out\s+(is|has been|was)\s+(now\s+)?(confirmed|approved|granted|arranged|set|done)/g,
    comp: /\b(compensated|credited)\b|\bcompensation\s+(is|was|has been)\s+(approved|granted|issued|applied|added|sent|done)|\b(applied|added|issued)\s+(a\s+|the\s+|your\s+)?(credit|compensation|voucher)/g,
    cancel: /\b(cancell?ed|voided)\b/g,
    approve: /\b(approved|granted|authori[sz]ed)\b/g,
    price: /\b(discounted|waived|comped)\b|\b(applied|gave|given)\s+(you\s+)?(a\s+|the\s+|your\s+)?(\d+\s?%\s+)?discount|\bdiscount\s+(is|was|has been)\s+applied|\b(reduced|lowered|changed|updated|adjusted)\s+(the|your)\s+(price|rate|bill|total)|\b(price|rate|bill|total)\s+(is now|has been|was)\s+(changed|reduced|lowered|updated|adjusted)|\bmarked\s+(it\s+|you\s+|this\s+)?as paid/g,
    request: /\b(i|we)(\s+have|\s+just|\s+also|\s+already)*\s+(sent|forwarded|passed|routed|booked|ordered|arranged|scheduled|reserved|requested|notified|informed|told|asked|checked you in)\b|\bha(s|ve) been\s+(sent|forwarded|passed|booked|ordered|arranged|scheduled|reserved|notified|informed)\b|\b(is|are)\s+(now\s+)?(arranged|scheduled|on (its|the|their) way)\b/g,
    done: /\b(done|all set|sorted|taken care of|completed|handled|fixed|resolved)\b/g
  };
  const B = '(?<![\\u0621-\\u064A])', E = '(?![\\u0621-\\u064A])', TM = B + '(?:تم|تمت|جرى)\\s+(?:\\S+\\s+)?';
  const ar = s => new RegExp(s, 'g');
  /* matched after tidy(): no diacritics, and أ إ آ written as ا */
  const AR = {
    refund: ar(B + '(?:استرجعت|استرجعنا|ارجعت لك|ارجعنا|رجعت لك|رجعنا|استرددت|استردينا|رديت لك|ردينا)' + E + '|(?:المبلغ|مبلغك|فلوسك|الاسترجاع|الاسترداد)\\s+(?:\\S+\\s+)?(?:مسترجع|رجع|راجع لك|في الطريق|اعتمد|معتمد|تم|تمت|جاهز)' + E + '|' + TM + '(?:ال)?(?:استرجاع|استرداد|ارجاع|اعاده|اعادة)'),
    move: ar(B + '(?:نقلتك|نقلناك|حولتك|حولناك)' + E + '|' + TM + '(?:ال)?(?:نقل|نقلك|تحويلك)' + E + '|' + B + '(?:غيرت|غيرنا|بدلت|بدلنا)\\s+(?:لك\\s+)?(?:غرفتك|جناحك|الغرفه|الغرفة|الجناح)|(?:غرفتك|جناحك)\\s+(?:الجديده|الجديدة|الجديد|صارت|صار)' + E),
    key: ar(B + '(?:اصدرت|اصدرنا)' + E + '|' + B + '(?:ارسلت|ارسلنا|رسلت|بعثت|بعثنا|طرشت)\\s+(?:لك\\s+)?(?:ال)?(?:رمز|مفتاح|كود)|' + TM + '(?:اصدار|ارسال|تجديد)\\s+(?:ال)?(?:رمز|مفتاح|كود|بطاق)|(?:رمزك|الرمز|الكود|كودك)\\s+(?:ال)?جديد\\s+(?:وصل|ارسل|جاهز|صار|في)'),
    ticket: ar(B + '(?:فتحت|فتحنا|سجلت|سجلنا|رفعت|رفعنا|انشات|انشانا)\\s+(?:لك\\s+)?(?:ال)?(?:بلاغ|تذكر|طلب|شكوى|ملاحظ)|' + B + '(?:ارسلت|ارسلنا|بعثت|بعثنا|طرشت|وجهت|وجهنا)\\s+(?:لك\\s+)?(?:ال)?(?:فريق|فني|صيان|عامل|تدبير|موظف)|(?:الفني|الفريق|فريق الصيانه|فريق الصيانة|فريق التدبير|العامل)\\s+(?:\\S+\\s+)?في الطريق|' + TM + '(?:فتح|تسجيل|رفع|انشاء)\\s+(?:ال)?(?:بلاغ|تذكر|طلب|شكوى)'),
    late: ar(B + '(?:مددت|مددنا|اخرت|اخرنا)' + E + '|' + TM + '(?:تمديد|تاخير)|(?:المغادره|المغادرة|مغادرتك)\\s+(?:صارت|اصبحت|الان|الحين)' + E),
    comp: ar(B + '(?:عوضتك|عوضناك|عوضت|عوضنا)' + E + '|' + TM + '(?:ال)?(?:تعويض|تعويضك)' + E + '|' + B + '(?:اضفت|اضفنا|صرفت|صرفنا)\\s+(?:لك\\s+)?(?:ال)?(?:تعويض|رصيد|مبلغ)'),
    cancel: ar(B + '(?:الغيت|الغينا|لغيت|لغينا|ملغي|ملغى|ملغيه|ملغاه|ملغاة)' + E + '|' + TM + '(?:ال)?الغاء'),
    approve: ar(TM + '(?:ال)?(?:موافقه|موافقة|اعتماد|قبول)|' + B + '(?:وافقت|وافقنا|اعتمدت|اعتمدنا)' + E + '|موافق عليه'),
    price: ar(B + '(?:خصمت|خصمنا)' + E + '|' + B + '(?:خفضت|خفضنا|خصمت|خصمنا|نزلت|نزلنا|عدلت|عدلنا|غيرت|غيرنا)\\s+(?:لك\\s+)?(?:ال)?(?:سعر|فاتور|مبلغ|اجمالي)|' + TM + '(?:ال)?(?:خصم|تخفيض|تعديل السعر|تعديل الفاتور)|' + B + '(?:اعفيتك|اعفيناك)' + E + '|(?:السعر|الاجمالي|الفاتوره|الفاتورة|اجماليك)\\s+(?:صار|اصبح|الان|الحين)' + E),
    request: ar(B + '(?:حولت|حولنا|طلبت لك|طلبنا لك|حجزت لك|حجزنا لك|رتبت|رتبنا|بلغت|بلغنا|ابلغت|ابلغنا|كلمت|كلمنا)' + E + '|' + TM + '(?:ال)?(?:تحويل|حجز|طلب|ابلاغ|ترتيب)'),
    done: ar(B + '(?:تم|تمت|خلاص|انتهينا|انجزت|انجزنا|نفذت|نفذنا|سويت|سوينا|ضبطت|ضبطنا)' + E)
  };
  /* what turns a matched verb into something other than a statement of fact */
  const NOT_EN = /\b(not|never|cannot|can|could|may|might|will|would|should|must|to|if|once|when|until|unless|no)\b|n't\b|'ll\b/, NO_EN = /\bno\b/;
  const RULE_EN = /\b(after|before|only|once|when|upon|unless|until)\b|\bby\s+(the\s+|a\s+)?(staff|reception|hotel|front desk)/;
  const NOT_AR = /^(لم|لن|ما|مو|مش|ليس|اذا|لو|حين|عند|عندما|حتى|لما|متى|قبل|راح|سوف|ممكن|يمكن|هل)$/;
  const CUT = /[.!?؟،,;؛:\n]/;

  const tidy = t => String(t == null ? '' : t).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/[’‘`]/g, '\'');
  function stated(text, at, len, arabic) {
    let a = at, b = at + len;
    while (a > 0 && !CUT.test(text[a - 1])) a--;
    while (b < text.length && !CUT.test(text[b])) b++;
    if (text[b] === '?' || text[b] === '؟') return false;                         // a question is an offer, not a report
    const before = text.slice(a, at).trim(), words = before ? before.split(/\s+/) : [];
    if (arabic) return !NOT_AR.test(words[words.length - 1] || '');
    if (NOT_EN.test(words.slice(-2).join(' ')) || NO_EN.test(before)) return false;
    return !(/^(is|are)$/.test(words[words.length - 1] || '') && RULE_EN.test(text.slice(at + len, b)));      // "a key is issued after payment": policy
  }
  function kinds(raw) {
    const text = tidy(raw), found = [];
    for (const [set, arabic] of [[EN, false], [AR, true]])
      for (const kind of Object.keys(set)) {
        const re = set[kind]; re.lastIndex = 0;
        for (let m; (m = re.exec(text));) {
          if (!m[0]) { re.lastIndex++; continue; }
          if (stated(text, m.index, m[0].length, arabic)) { if (!found.includes(kind)) found.push(kind); break; }
        }
      }
    return found;
  }
  function check(text, steps) {
    const ok = (steps || []).filter(s => s && s.tool && s.result && s.result.ok);
    const unbacked = kinds(text).filter(kind => {
      if (kind === 'done') return !ok.length;
      if (kind === 'approve') return !ok.some(s => s.approved === true);
      return !ok.some(s => BACK[kind].includes(s.tool));
    });
    return { ok: !unbacked.length, unbacked };
  }

  SILA.claims = Object.freeze({ check, kinds });
})(typeof window !== 'undefined' ? window : globalThis);
