/* صلة — the fact checker. No model is involved: it is a small table of topics, in Arabic and in English.
   agent/claims.js stops a model saying that something was DONE; the number check stops a number the hotel did not supply.
   This file stops the third kind of mistake: a plain statement of fact that is not the hotel's ("the nightly rate includes VAT",
   "check-out is at 2 PM", "breakfast is included", "refunds are automatic").

   A reply is read sentence by sentence. A sentence that touches a topic of the table must be one of:
     - a statement the table allows for that topic (they are the hotel's own policy sentences, in other words),
     - a rewording of what the hotel's code itself said in this turn (opts.said), with no number added,
     - a question, an offer, or "I do not have that, reception can tell you": these state nothing.
   Anything else fails the check, the text is thrown away and the written rules answer instead.

   check(text, opts) -> { ok, refused: [{ topic, sentence }] }      opts: { paid: true|false|undefined, said: [the hotel's sentences] }

   It errs on the side of refusing: a true sentence in an unusual wording costs one fixed answer; a false one costs trust.
   The table states the policy the page shows guests (POLICIES in app.js); a test holds the two together. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const HOTEL = { checkout: 12, late: 1, vat: 15 };          // check-out at 12:00 noon, late check-out to 1:00 PM when allowed, 15% VAT in the total

  /* matched after tidy(): lower case, Latin digits, no diacritics, أ إ آ as ا, ة as ه, ى as ي, "p.m." as "pm" */
  const tidy = t => String(t == null ? '' : t).toLowerCase().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/[’‘`]/g, '\'').replace(/\b([ap])\.\s?m\b\.?/g, '$1m').replace(/(\d)\.(\d)/g, '$1:$2');
  const sentences = t => tidy(t).split(/(?<=[.!?؟\n])/).map(s => s.trim()).filter(s => /[a-zء-ي\d]/.test(s));

  /* what states nothing: a question, an offer, or sending the guest to reception. None may carry a number. */
  const DEFER = /\b(do not|don't|cannot|can't|am not able to|unable to|am unable to)\s+(have|know|confirm|see|find|tell|say)\b|\bnot\s+(in|part of|available in|listed in|covered (in|by))\s+(the\s+|our\s+|my\s+)?(hotel('s)?\s+)?(data|records|information)\b|\b(hotel\s+)?data\s+(does not|doesn't|holds no|has no)\b|\b(ask|check with|contact|speak to|speak with)\s+(the\s+|our\s+)?(reception|front desk|staff)\b|\b(reception|front desk)\s+(can|will|would)\s+(confirm|tell|help|answer|advise)\b|\bpass\s+(it|this|that|your\s+(question|request))\s+(on\s+)?to\s+(the\s+)?(reception|front desk)\b|لا (املك|اعرف|استطيع (تاكيد|الجزم)|يوجد (في|لدي|عندي))|ليس (في|لدي|عندي|ضمن)|ما عندي|غير (متوفر|مذكور|موجود)ه? في (بيانات|معلومات)|(بيانات|معلومات) الفندق لا|(راجع|اسال|تواصل مع|كلم) (موظف )?الاستقبال|الاستقبال (يقدر|يستطيع|سيؤكد|يؤكد|يفيدك)|(احول|ارفع|امرر) (سؤالك|طلبك|استفسارك) (ل|الي )(موظف )?الاستقبال/;
  const OFFER = /^(would you like|do you want|shall i|should i|i can (ask|request|check|pass|send|register|log|open)|if you (like|wish|want),? i can)\b|^(هل (تريد|ترغب|تود|تبي|تبغي)|تبي|تبغي|تحب|اقدر (اطلب|احول|اسال|اسجل|ارفع|افتح)|يمكنني (طلب|تحويل|تسجيل|رفع|فتح)|ممكن (اطلب|احول|اسجل|افتح))/;
  /* "I cannot process a refund", "we will not extend your check-out", "لا أستطيع تأكيد الاسترجاع": the agent says what it will NOT do.
     That promises nothing and states no policy, so it is not held to the table (it still may not carry a number). */
  const DECLINE = /\b(i|we)\s+(cannot|can't|can not|am unable to|are unable to|am not able to|will not|won't|do not|don't)\s+(process|approve|confirm|issue|give|grant|make|do|extend|change|move|cancel|refund|offer|promise|guarantee)\b|(?<![ء-ي])(لا|لن|ما)\s+(يمكنني|يمكننا|استطيع|نستطيع|اقدر|نقدر)\s+(تاكيد|معالجه|تنفيذ|اصدار|منح|الموافقه|اعتماد|تمديد|تغيير|الغاء|استرجاع|استرداد|ارجاع|اعطاء|ضمان)|(?<![ء-ي])(لن|ما راح)\s+(نمدد|امدد|نغير|اغير|ننقل|انقل|نلغي|الغي)/;
  const says = s => !(/\d/.test(s) ? false : (/[?؟]\s*$/.test(s) || DEFER.test(s) || OFFER.test(s) || DECLINE.test(s)));

  /* clock times in a sentence: [hour, minutes, part of day] */
  function times(s) {
    const out = [];
    s.replace(/(?<![\d:])(\d{1,2})(?::(\d{2}))?(?![\d:])\s*(am|pm|صباحا|ظهرا|مساء|عصرا|ليلا|ص(?![ء-ي])|م(?![ء-ي]))?(\s*%)?/g, (m, h, mm, part, pct) => { if (!pct) out.push([+h, mm || '00', part || '']); return m; });
    return out;
  }
  const digits = s => (s.replace(/,(?=\d{3})/g, '').match(/\d+/g) || []);

  const SEP = '[^,،;؛:]';
  const INC = /includ|inclusive|complimentary|free of charge|for free|at no (extra |additional )?(cost|charge)|comes? with|يشمل|تشمل|شامل|متضمن|مجانا|مجاني|بدون رسوم|مع الاقامه|ضمن (السعر|الاقامه|الحجز)/;
  const AMEN = /breakfast|wi-?fi|internet|parking|\bgym\b|\bpool\b|\bspa\b|mini-?bar|laundry|airport|transfer|shuttle|dinner|lunch|\bmeals?\b|upgrade|فطور|افطار|واي ?فاي|انترنت|موقف|مواقف|النادي|مسبح|سبا|ميني بار|غسيل|مطار|توصيل|عشاء|غداء|وجب|ترقيه/;
  const FREE = /\bfree\b|\bon us\b|on the house|علينا|علي حسابنا|مجان|ببلاش/;
  const PRICED =/\b(price|prices|rate|rates|stay|booking|package|total|bill)\b|سعر|اسعار|الاقامه|الحجز|الباقه|الاجمالي|فاتور/;
  const TAX_OK = [
    new RegExp('(total|bill|invoice|amount due|اجمالي|المجموع|فاتور)(?:(?!rate|price|سعر)' + SEP + '){0,40}(includ|inclusive|يشمل|تشمل|شامل|متضمن)' + SEP + '{0,40}(vat|tax|ضريب)'),
    new RegExp('(vat|tax|ضريب)' + SEP + '{0,30}(included|part of|ضمن|مشمول|محسوب|داخل)' + SEP + '{0,25}(total|bill|اجمالي|المجموع|فاتور)'),
    new RegExp('(vat|ضريب)' + SEP + '{0,25}15\\s?%|15\\s?%\\s?(vat|ضريب)')
  ];

  const TOPICS = [
    { key: 'tax',
      hit: /\bvat\b|\btax(es|ed)?\b|ضريب|القيمه المضافه/,
      deny: new RegExp('(\\b(rates?|prices?|nightly|per night|night)\\b|سعر|اسعار|الليله|لليله)(?:(?!total|bill|اجمالي|فاتور)' + SEP + '){0,28}(includ|inclusive|يشمل|تشمل|شامل|متضمن)'
        + '|(includ|inclusive|يشمل|تشمل|شامل)' + SEP + '{0,14}\\b(in|ضمن|في)\\s(the\\s)?(nightly\\s|room\\s)?(rate|price|سعر)'
        + '|\\b(no|not|without|exclud\\w*|exclusive|exempt|free of|plus|added|extra|on top)\\b' + SEP + '{0,24}(vat|tax)|(vat|tax)' + SEP + '{0,24}\\b(not|excluded|extra|added|on top|separately|waived|exempt)\\b'
        + '|(?<![\\u0621-\\u064A])(لا|بدون|غير|معفي|معفاه|معفى|زائد|تضاف)(?![\\u0621-\\u064A])' + SEP + '{0,24}ضريب|ضريب' + SEP + '{0,24}(غير|اضافيه|تضاف|منفصل|معف)'),
      test: s => (s.match(/\d+(?::\d+)?\s?%|%\s?\d+/g) || []).every(p => p.replace(/[^\d:]/g, '') === String(HOTEL.vat)),
      allow: TAX_OK },

    { key: 'checkout',
      hit: /check-?\s?out|\bdepart(ure)?\b|\bleave (by|before|at)\b|\bvacate\b|المغادره|مغادرت|تسجيل الخروج|(وقت|موعد) الخروج|تغادر|الخروج من (الغرفه|الفندق)/,
      deny: /\b(free|complimentary|guaranteed|always|any ?time|whenever|no (charge|limit|fee)|all day|midnight|evening|morning|fees?|charges?|surcharge|costs?)\b|\b(two|three|four|several|a few|[2-9])\s(extra\s|more\s|additional\s)?hours\b|مجان|مضمون|دائما|اي وقت|متي ما|بدون (رسوم|مقابل)|رسوم|مقابل مبلغ|ساعتين|ساعات|منتصف الليل|الصباح|المساء/,
      test(s, o, backed) {
        const late = /late|extra|exten|later|تاخير|تمديد|مدد|اضافيه|ساعه/.test(s), maybe = /possible|\bmay\b|can be|when the hotel allows|if (the hotel )?(allows|permits)|subject to|(on|upon) request|if available|ممكن|حين يسمح|اذا سمح|حسب|عند الطلب/.test(s);
        return times(s).every(([h, m, part]) => {
          if (m !== '00' || /^(am|صباحا|ص|مساء|ليلا)$/.test(part)) return false;
          if (h === HOTEL.checkout) return true;
          return (h === HOTEL.late || h === HOTEL.late + 12) && late && (maybe || backed);      // 1:00 PM only as the late check-out, and only as a possibility
        });
      },
      allow: [/(?<![\d:])12(:00)?(?![\d:])|\bnoon\b|\bmidday\b|الظهر|الثانيه عشر/, /(late|exten|تاخير|تمديد)[^.]{0,60}(possible|\bmay\b|can be|when the hotel allows|subject to|request|ممكن|حين يسمح|اذا سمح|حسب)|(possible|ممكن)[^.]{0,40}(late|exten|تاخير|تمديد)/] },

    { key: 'checkin',
      hit: /check-?\s?in\s(time|is|starts?|begins?|opens?|from|at|after)\b|\b(time|when|early|earliest)\b[^.]{0,20}check-?\s?in|early check-?\s?in|arrival time|(وقت|موعد|ساعه|متي)[^.]{0,15}(الدخول|الوصول|تسجيل الوصول|تسجيل الدخول)|(تسجيل الوصول|تسجيل الدخول|الدخول)[^.]{0,15}(الساعه|من الساعه|يبدا|متاح من)|دخول مبكر|الدخول المبكر/,
      allow: [] },                                      // the hotel data holds no check-in time: nothing may be stated

    { key: 'refund',
      hit: /refund|money back|reimburs|cancell?ation|(return|give back)[^.]{0,15}(money|amount)|amount (goes|is going|will go) back|استرجاع|استرداد|ارجاع (المبلغ|الفلوس)|(نرجع|ارجع|يرجع|رجعنا|نعيد|يعاد|اعاده)\s(لك\s)?(ال)?(مبلغ|فلوس)|الغاء (الحجز|مجاني)|سياسه الالغاء/,
      deny: /\b(guaranteed|automatic(ally)?|instant(ly)?|immediately|within|business days?|days?|hours?|weeks?|non-?refundable|no refunds?|free cancell?ation|partial(ly)?|fees?|penalt(y|ies))\b|\d|مضمون|تلقائي|فوري|فورا|خلال|ايام|يوم|ساعه|اسبوع|غير قابل|الغاء مجاني|جزئي|رسوم|غرامه/,
      allow: [/(decid|approv|review|handl|up to|يقرر|يوافق|موافق|قرار|بيد|صلاحي)[^.]{0,30}(reception|staff|front desk|employee|موظف|الاستقبال)|(reception|staff|front desk|موظف|الاستقبال)[^.]{0,30}(decid|approv|review|must|needs?|يقرر|يوافق|يراجع|هو من)/] },

    { key: 'compensation',
      hit: /compensat|تعويض|عوض(ت|نا|ناك|تك)/,
      deny: /\b(guaranteed|entitled|always|unlimited|any amount|double|free night|upgrade|voucher|points)\b|مضمون|يحق لك|دائما|بلا حد|غير محدود|اي مبلغ|مضاعف|ليله مجانيه|ترقيه|قسيم|نقاط/,
      test: (s, o, backed) => backed || !/\d/.test(s),      // an amount is the code's to state, never a model's
      allow: [/(limit|cap|ceiling|حد|سقف)[^.]{0,30}(hotel|الفندق)|(hotel|الفندق)[^.]{0,30}(limit|cap|حد|سقف)|(computed|calculated|worked out|decided|set|determined|يحسب|يحدد|تحدد|يقرر)[^.]{0,30}(hotel|system|الفندق|النظام)/] },

    { key: 'payment',
      hit: /\bpay(ment|ments|ing|s)?\b|\b(un)?paid\b|\bcharg(e|ed|es)\b|deposit|\bcash\b|\bvisa\b|master ?card|\bmada\b|apple pay|stc pay|installments?|prepa(id|y)|دفع|مدفوع|عربون|تامين|نقدا|كاش|(?<![ء-ي])مدي(?![ء-ي])|فيزا|ماستر|تقسيط|قسط/,
      deny: /deposit|\bcash\b|\bvisa\b|master ?card|\bmada\b|apple pay|stc pay|amex|installments?|pay\s+(later|at (check-?out|departure|the end)|on (departure|arrival)|in (cash|parts))|(no|without)\s+(need to\s+|a\s+)?pay|skip (the )?payment|free of charge|for free|عربون|تامين|نقدا|كاش|(?<![ء-ي])مدي(?![ء-ي])|فيزا|ماستر|ابل باي|تقسيط|قسط|(الدفع|تدفع|ادفع) (لاحقا|بعدين|عند المغادره|عند الخروج|وقت الخروج)|بدون دفع|مجانا/,
      test(s, o, backed) {
        if (backed) return true;
        const no = /\b(not|unpaid|isn't|hasn't|yet to be)\b[^.]{0,12}\bpaid\b|\bunpaid\b|لم (يدفع|يتم الدفع|تدفع)|غير مدفوع|ما دفعت/.test(s), yes = !no && /\b(already|is|are|was|been|fully)\s+(pre)?paid\b|\bprepaid\b|مدفوع|تم الدفع|دفعت/.test(s);
        return (!no || o.paid === false) && (!yes || o.paid === true);      // what is paid is read from the booking, not taken from a model
      },
      allow: [/(key|code|مفتاح|رمز)[^.]{0,50}(after|once|until|unless|before|بعد|قبل|حتي|الا)[^.]{0,25}(pay|دفع)/, /(after|once|before|complete|finish|بعد|قبل|اتمام|اكمال|تكمل|اكمل)[^.]{0,12}(payment|paying|الدفع)/,
        /payment (panel|screen|step)|(لوحه|شاشه|خطوه) الدفع|(same|original) payment method|وسيله الدفع نفسها/, /(do not|don't|never|cannot|لا) (take|accept|store|keep|استقبل|احفظ|اخذ)[^.]{0,25}(card|بطاق)/,
        /\b(no|not|nothing|never)\b[^.]{0,30}\b(charged|deducted)\b|(لا|لن) (يخصم|نخصم|يسحب)/, /\b(not|unpaid|already|is|are|was|been|fully)\b[^.]{0,12}\b(pre)?paid\b|\bunpaid\b|مدفوع|تم الدفع|لم (يدفع|يتم الدفع)/] },

    { key: 'keys',
      hit: /\bkeys?\b|access code|pass ?code|door code|key ?card|مفتاح|مفاتيح|رمز (الدخول|الباب|الغرفه)|بطاقه (الغرفه|الدخول)/,
      deny: /whats ?app|\bapp\b|application|\bnfc\b|bluetooth|fingerprint|face id|wallet|\b(two|three|2|3|extra|spare|second|another|additional)\s(key|keys|card|cards)\b|keys?\s(for|to)\s(your\s)?(friend|guest|family|wife|husband)|واتس|تطبيق|بلوتوث|بصمه|مفتاحين|مفاتيح اضافيه|مفتاح (اضافي|ثاني|احتياطي)|\b(can|could|may|will|able)\b[^.]{0,40}(key|code)[^.]{0,30}(before|without)[^.]{0,15}pay|(ممكن|يمكن|اقدر|نقدر|تقدر)[^.]{0,40}(مفتاح|رمز)[^.]{0,30}(قبل|بدون)[^.]{0,15}دفع/,
      allow: [/\bsms\b|text message|e-?mail|card from (the )?reception|reception (desk )?card|at (the )?reception|رساله|بريد|بطاقه من الاستقبال|من الاستقبال|عند الاستقبال/,
        /(\b(no|not|never|cannot|can't|won't|only|isn't)\b|(?<![ء-ي])(لا|لن|فقط|الا)(?![ء-ي]))[^.]{0,45}(key|code|مفتاح|رمز)[^.]{0,45}(before|until|unless|after|once|قبل|حتي|بعد|الا)[^.]{0,30}(pay|دفع|ready|جاهز)/,
        /(key|code|مفتاح|رمز)[^.]{0,30}(\b(never|not|only|isn't|cannot|can't)\b|(?<![ء-ي])(لا|لن)(?![ء-ي]))[^.]{0,40}(before|until|unless|after|once|قبل|حتي|الا بعد)[^.]{0,30}(pay|دفع|ready|جاهز)/,
        /(key|code|مفتاح|رمز)[^.]{0,40}(issued|sent|given|ready|يصدر|يرسل|تستلم|جاهز)[^.]{0,25}(after|once|when|بعد|عند|حين)[^.]{0,25}(pay|دفع|ready|جاهز)/] },

    { key: 'includes',                               // what a price or a stay includes: the hotel data names only the tax in the total
      hit: s => (INC.test(s) && (AMEN.test(s) || PRICED.test(s))) || (FREE.test(s) && AMEN.test(s)),
      test: (s, o, backed, stating) => !stating || !AMEN.test(s),
      allow: TAX_OK }
  ];

  function check(text, opts) {
    const o = opts || {}, said = (o.said || []).map(tidy), refused = [];
    const known = new Set(digits(said.join(' ')));
    for (const s of sentences(text)) {
      const stating = says(s);
      for (const t of TOPICS) {
        const hit = typeof t.hit === 'function' ? t.hit(s) : t.hit.test(s);
        if (!hit) continue;
        /* the hotel's code spoke of this topic in this very turn, and the sentence adds no number of its own */
        const backed = said.some(x => (typeof t.hit === 'function' ? t.hit(x) : t.hit.test(x))) && digits(s).every(n => known.has(n));
        const fine = !(t.deny && t.deny.test(s)) && (!t.test || t.test(s, o, backed, stating)) && (!stating || backed || t.allow.some(re => re.test(s)));
        if (!fine) refused.push({ topic: t.key, sentence: s.slice(0, 160) });
      }
    }
    return { ok: !refused.length, refused };
  }

  SILA.facts = Object.freeze({ check, topics: TOPICS.map(t => t.key), HOTEL: Object.freeze(Object.assign({}, HOTEL)) });
})(typeof window !== 'undefined' ? window : globalThis);
