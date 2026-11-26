/* صلة — the model brain. Optional: it exists only when the page has the address of a server that holds a model key
   (lib/sila-ai.js, task "agent"). Same interface as the rules brain: next({ input, state, steps, history }) -> an action.

   What it is trusted with is narrow on purpose:
   - It reads the guest's words once, at the start of a turn, and returns a plan: up to four actions, in the guest's order
     ("the AC is broken, I need towels, and a late checkout" is three). The loop asks for them one at a time, and each goes
     through the permission engine on its own: one that is refused or declined does not stop the next.
   - An action is a tool call, a plain answer, or "clarify": one short question when the message contradicts itself.
   - Card data, another guest's room or booking, a price change, identifying by number, a bare yes/no to an offer, and a
     question about tonight's rates or the guest's own bill are matched by the written rules in this browser and never
     sent to a model at all: every price a guest reads is computed by the page.
   - What follows a tool that ran (an apology, an offered move, the next step of the arrival) is the rules brain's work.
   - It only ever proposes. The permission engine decides, amounts are computed by the page, and a room is the hotel's choice.
   - Free text is read before it is shown: its numbers must come from the hotel's data (grounded), it may not say
     that something was done, approved, refunded, moved, issued, opened, cancelled or compensated (agent/claims.js), and
     what it states about tax, check-out, refunds, compensation, payment, keys or what a price includes must be the
     hotel's own policy (agent/facts.js).
   - After the tools have run it is asked once more (task "reply") to word the closing reply from what actually happened.
     That text replaces the page's fixed sentences only if it passes the same two checks against this turn's steps.
   If the server is down, slow, out of quota or answers with something that does not fit, next() throws and the loop
   carries on with the rules brain in the same turn. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const INTENT = { route_request: 'requests', issue_key: 'give_key', reissue_key: 'code', move_room: 'move', late_checkout: 'late', compensate: 'comp', request_staff_approval: 'refund',
    get_room_status: 'status', find_booking: 'mine', store_card_data: 'card', open_room_for_other: 'other_room', change_price: 'price' };
  const FLOW = { start_registration: 'register', plan_event: 'event', book_tour: 'tour' };
  const MAX_ACTIONS = 4;
  const URGE = /صلح|بسرع|عج[ّ]?ل|للحين|لسى|لسه|ما ?زال|متى|وين (الفريق|الصيان)|\bfix (it|this|that)\b|hurry|quick|still|\byet\b|\bwhen\b|any update|how long/i;
  const fail = (why, soft) => { throw Object.assign(new Error('model brain: ' + why), { soft: !!soft }); };      // soft: the model answered, but its words were thrown away

  /* every number of three digits or more in a free answer must be one the hotel's code supplied */
  function grounded(reply, facts) {
    const known = new Set((JSON.stringify(facts).replace(/,(?=\d{3})/g, '').match(/\d{3,}/g) || []));
    return (String(reply).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,(?=\d{3})/g, '').match(/\d{3,}/g) || []).every(n => known.has(n));
  }

  /* o: { ask(task, input) -> Promise<output>, hotel() -> facts for the model, channel?: 'chat', flows?: tools that only the chat window has,
          rejected?(why, text): told each time a model's words are thrown away ('language' | 'number' | 'claim' | 'fact') } */
  function create(o) {
    const rules = SILA.brains.rules, by = a => Object.assign({ by: 'rules' }, a);
    const drop = (why, text, reason) => { if (o.rejected) o.rejected(why, text); fail(reason, true); };
    /* a reply in Arabic to a guest who wrote in English, or the reverse, is not shown: the page's own sentence in their language is */
    const tongue = (text, lang) => (lang === 'en' ? (String(text).match(/[\u0621-\u064A]/g) || []).length < 3 : lang === 'ar' ? /[\u0621-\u064A]/.test(text) : true);
    const knownOf = state => ({ paid: state && state.booking ? !!state.booking.paid : undefined });
    let plan = null, at = 0, base = 0;              // this turn's plan, the next action in it, and the step its last action began at

    /* free text a model wrote for the guest: an answer or a question, never a report of something done */
    function words(text, max, facts, steps, known, lang) {
      const t = String(text || '').trim().slice(0, max);
      if (!t) fail('empty reply');
      if (!tongue(t, lang)) drop('language', t, 'a reply in another language than the guest wrote in');
      if (!grounded(t, facts)) drop('number', t, 'a number the hotel did not supply');
      if (!SILA.claims.check(t, steps).ok) drop('claim', t, 'a claim that nothing in this turn backs');      // "your refund is approved", with no tool behind it
      if (!SILA.facts.check(t, known).ok) drop('fact', t, 'a statement the hotel data does not support');      // "the nightly rate includes VAT"
      return t;
    }
    /* one planned action -> what the loop is handed. null: not usable, left out of the plan. */
    function action(a, turn, facts) {
      const { input, state } = turn, b = state.booking, t = a && a.tool;
      if (typeof t !== 'string') return null;
      if (t === 'clarify') return { say: 'free', text: words(a.question, 200, facts, [], knownOf(state), turn.lang), intent: 'clarify', end: true };
      if (o.flows && o.flows.includes(t)) return { say: 'flow', text: t, intent: FLOW[t], end: true };      // one of the chat window's own conversations
      if (!SILA.tools.has(t) || t === 'check_in') return null;
      let args = {}, intent = INTENT[t] || 'other';
      if (t === 'route_request') {
        const items = (Array.isArray(a.items) ? a.items : []).filter(i => i && typeof i.request === 'string' && i.request.trim()).slice(0, 6)
          .map(i => ({ request: i.request.trim().slice(0, 80), dept: SILA.tools.DEPTS.includes(i.dept) ? i.dept : 'reception' }));
        if (!items.length) return null;
        args = { items };
      } else if (t === 'issue_key') {
        if (b && b.key) return { tool: 'reissue_key', args: { via: b.key === 'card' ? 'card' : 'code' }, intent: 'code' };
        if (state.stage === 'key' && !a.via) return by({ say: 'ask_key', intent: 'give_key', end: true });
        args = { via: ['sms', 'email', 'card'].includes(a.via) ? a.via : 'sms' };
      } else if (t === 'reissue_key') args = { via: a.via === 'card' || (b && b.key === 'card') ? 'card' : 'code' };
      else if (t === 'open_ticket') {
        const kind = a.kind === 'clean' ? 'clean' : 'maint'; intent = kind;
        /* the guest is pressing about a fault that already has an open ticket ("fix it quickly", "still broken"): no second ticket */
        if (b && (b.tickets || []).includes(kind) && URGE.test(String(input.text || ''))) return by({ say: 'ticket_open', intent: 'answer', end: true });
        args = kind === 'maint' ? { kind, text: String(a.note || input.shown || '').trim().slice(0, 80) } : { kind };
      } else if (t === 'move_room') {
        if (!b || !b.alt) return by({ say: b ? 'no_alt' : 'need_id', intent: 'move', end: true });
        args = { to: b.alt, why: state.pending === 'move_offer' ? 'maint' : state.pending === 'room_choice' ? 'prep' : 'guest' };      // the room is the hotel's choice, never the model's
      } else if (t === 'compensate') args = Number.isInteger(a.requested) && a.requested > 0 && a.requested <= 100000 ? { requested: a.requested } : {};
      else if (t === 'request_staff_approval') args = { action: 'refund' };
      else if (t === 'get_rates') { args = { scope: a.scope === 'bill' && b ? 'bill' : 'tonight' }; intent = args.scope === 'bill' ? 'bill' : 'rates'; }
      return { tool: t, args, intent };
    }
    /* the model's answer -> the turn's plan */
    function planOf(out, turn, facts) {
      if (out && !Array.isArray(out.actions) && typeof out.tool === 'string') out = { actions: out.tool === 'none' ? [] : [out], reply: out.reply };      // a server one version behind answers with a single tool
      if (!out || !Array.isArray(out.actions)) fail('no plan');
      if (!out.actions.length) return [{ say: 'free', text: words(out.reply, 600, facts, [], knownOf(turn.state), turn.lang), intent: 'answer', end: true }];
      const list = [], seen = [];
      let ask = null, flow = null;
      for (const a of out.actions.slice(0, MAX_ACTIONS)) {
        const act = action(a, turn, facts);
        if (!act) continue;
        if (act.intent === 'clarify') { ask = ask || act; continue; }
        if (act.say === 'flow') { flow = flow || act; continue; }
        const same = act.tool === 'route_request' && list.find(x => x.tool === 'route_request');
        if (same) { same.args.items = same.args.items.concat(act.args.items).slice(0, 6); continue; }      // requests for departments travel together
        const key = (act.tool || act.say) + JSON.stringify(act.args || '');
        if (seen.includes(key)) continue;
        seen.push(key); list.push(act);
      }
      if (ask) list.push(ask);                       // a question comes after what could be done
      if (flow) list.push(flow);                     // and a conversation of the chat's own takes over last
      if (!list.length) fail('no usable action');
      return list;
    }
    async function understand(turn) {
      const { input, state } = turn, hotel = o.hotel(), b = state.booking;
      const sent = {
        text: input.shown, hotel,
        state: { channel: o.channel === 'chat' ? 'chat' : 'stage', stage: state.stage, pending: state.pending, booking: b ? { room: b.room, category: b.cat, nights: b.nights, arrived: b.arrived, paid: b.paid, key: b.key, late: b.late, comp: !!b.comp, refunded: b.refunded, roomState: b.roomState, alt: !!b.alt } : null },
        history: (turn.history || []).slice(-8).map(t => ({ guest: t.heard || '', agent: t.said || '' }))
      };
      for (let again = 0; ; again++) {               // an answer that does not fit is asked for once more; after that the rules take the turn
        const out = await o.ask('agent', sent, turn.lang);
        try { return planOf(out, turn, [hotel, b ? b.room : '']); } catch (e) { if (e.soft || again) throw e; }
      }
    }

    let wording = true;                             // false once the server turned out not to know the "reply" task
    const outcome = s => (s.held ? 'waiting_for_guest' : s.result && s.result.ok ? 'done' : s.result && s.result.denied ? 'refused' : s.result && s.result.declined ? 'declined_by_staff' : 'failed');
    return {
      name: 'model',
      /* the closing reply, in the guest's own language and dialect. t: { input, steps, said: the page's fixed sentences, facts }
         -> the text, or null when the fixed sentences should be used */
      async compose(t) {
        if (!wording) return null;
        const results = t.steps.filter(s => s.tool).map(s => ({ action: s.tool, outcome: outcome(s), detail: String((s.result && s.result.note) || s.code || '') }));
        let out;
        try { out = await o.ask('reply', { text: t.input.shown, results, said: t.said }, t.lang); }
        catch (e) { if (/ 400$/.test(String(e && e.message))) { wording = false; return null; } throw e; }      // a server one version behind: the fixed sentences stay
        const text = String((out && out.reply) || '').trim().slice(0, 600);
        if (!text) return null;
        const why = !tongue(text, t.lang) ? 'language' : !grounded(text, [t.said, results, t.facts]) ? 'number' : !SILA.claims.check(text, t.steps).ok ? 'claim' : !SILA.facts.check(text, { paid: t.paid, said: t.said }).ok ? 'fact' : null;
        if (why && o.rejected) o.rejected(why, text);
        return why ? null : text;
      },
      async next(turn) {
        const { input, state } = turn, steps = turn.steps || [];
        if (!steps.length) plan = null;
        if (input.type !== 'text') return by(rules.next(turn));
        if (!plan) {
          if (steps.length || rules.local(input.text, state, input.at)) return by(rules.next(turn));
          /* "fix it", with no earlier turn it could point to: there is nothing for a model to read, so the guest is asked. With an earlier turn, the model reads it. */
          if (rules.vague(input.text) && !rules.lastOf(turn.history)) return by(rules.next(turn));
          plan = await understand(turn); at = 0; base = 0;
        }
        if (at > 0 && steps.length > base && plan[at - 1].tool) {      // what follows a tool that ran is the rules brain's, as long as the rest of the plan still fits in the turn
          const room = SILA.agent.MAX_STEPS - steps.length - (plan.length - at);
          let f = room > 0 ? rules.follow(input, state, steps.slice(base)) : null;
          if (f && f.tool && plan.slice(at).some(p => p.tool === f.tool)) f = null;      // the guest asked for it too: it comes in its own turn of the plan
          if (f && !f.done) return by(f.say && at < plan.length ? Object.assign({}, f, { end: false }) : f);
        }
        if (at >= plan.length) return { done: true };
        const a = plan[at++]; base = steps.length;
        return a.say && at < plan.length ? Object.assign({}, a, { end: false }) : a;
      }
    };
  }

  SILA.brains.model = Object.freeze({ create, grounded, MAX_ACTIONS });
})(typeof window !== 'undefined' ? window : globalThis);
