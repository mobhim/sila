/* صلة — the model brain. Optional: it exists only when the page has the address of a server that holds a model key
   (lib/sila-ai.js, task "agent"). Same interface as the rules brain: next({ input, state, steps, history }) -> an action.

   What it is trusted with is narrow on purpose:
   - It reads the guest's words once, at the start of a turn, and proposes one tool or a plain answer.
   - Card data, another guest's room or booking, a price change, identifying by number, and a bare yes/no to an offer
     are matched by the written rules in this browser and never sent to a model at all.
   - What happens after a tool has answered (the next tool, the next step of the arrival) is the rules brain's work.
   - It only ever proposes. The permission engine decides, and amounts are computed by the page.
   If the server is down, slow, out of quota or answers with something that does not fit, next() throws and the loop
   carries on with the rules brain in the same turn. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const LOCAL = ['card', 'other_room', 'price', 'identify', 'choice'];
  const INTENT = { route_request: 'requests', issue_key: 'give_key', reissue_key: 'code', move_room: 'move', late_checkout: 'late', compensate: 'comp', request_staff_approval: 'refund',
    get_room_status: 'status', find_booking: 'mine', store_card_data: 'card', open_room_for_other: 'other_room', change_price: 'price' };
  const fail = why => { throw new Error('model brain: ' + why); };

  /* every number of three digits or more in a free answer must be one the hotel's code supplied */
  function grounded(reply, facts) {
    const known = new Set((JSON.stringify(facts).replace(/,(?=\d{3})/g, '').match(/\d{3,}/g) || []));
    return (String(reply).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,(?=\d{3})/g, '').match(/\d{3,}/g) || []).every(n => known.has(n));
  }

  /* o: { ask(task, input) -> Promise<output>, hotel() -> facts for the model } */
  function create(o) {
    const rules = SILA.brains.rules, by = a => Object.assign({ by: 'rules' }, a);
    return {
      name: 'model',
      async next(turn) {
        const { input, state, steps } = turn;
        if (input.type !== 'text' || (steps && steps.length)) return by(rules.next(turn));
        if (LOCAL.includes(rules.intentOf(input.text, state, input.at).intent)) return by(rules.next(turn));
        const hotel = o.hotel(), b = state.booking;
        const out = await o.ask('agent', {
          text: input.shown, hotel,
          state: { stage: state.stage, pending: state.pending, booking: b ? { room: b.room, category: b.cat, nights: b.nights, arrived: b.arrived, paid: b.paid, key: b.key, late: b.late, comp: !!b.comp, refunded: b.refunded, roomState: b.roomState, alt: !!b.alt } : null },
          history: (turn.history || []).slice(-8).map(t => ({ guest: t.heard || '', agent: t.said || '' }))
        });
        if (!out || typeof out.tool !== 'string') fail('no tool');
        const t = out.tool;
        if (t === 'none') {
          const reply = String(out.reply || '').trim().slice(0, 600);
          if (!reply) fail('empty reply');
          if (!grounded(reply, [hotel, b ? b.room : ''])) fail('a number the hotel did not supply');
          return { say: 'free', text: reply, intent: 'answer', end: true };
        }
        if (!SILA.tools.has(t) || t === 'check_in') fail('unknown tool');
        let args = {}, intent = INTENT[t] || 'other';
        if (t === 'route_request') {
          const items = (Array.isArray(out.items) ? out.items : []).filter(i => i && typeof i.request === 'string' && i.request.trim()).slice(0, 6)
            .map(i => ({ request: i.request.trim().slice(0, 80), dept: SILA.tools.DEPTS.includes(i.dept) ? i.dept : 'reception' }));
          if (!items.length) fail('no items');
          args = { items };
        } else if (t === 'issue_key') {
          if (b && b.key) return by({ tool: 'reissue_key', args: { via: b.key === 'card' ? 'card' : 'code' }, intent: 'code' });
          if (state.stage === 'key' && !out.via) return by({ say: 'ask_key', intent: 'give_key', end: true });
          args = { via: ['sms', 'email', 'card'].includes(out.via) ? out.via : 'sms' };
        } else if (t === 'reissue_key') args = { via: out.via === 'card' || (b && b.key === 'card') ? 'card' : 'code' };
        else if (t === 'open_ticket') {
          const kind = out.kind === 'clean' ? 'clean' : 'maint'; intent = kind;
          args = kind === 'maint' ? { kind, text: String(out.note || input.shown || '').trim().slice(0, 80) } : { kind };
        } else if (t === 'move_room') {
          if (!b || !b.alt) return by({ say: b ? 'no_alt' : 'need_id', intent: 'move', end: true });
          args = { to: b.alt, why: state.pending === 'move_offer' ? 'maint' : state.pending === 'room_choice' ? 'prep' : 'guest' };      // the room is the hotel's choice, never the model's
        } else if (t === 'compensate') args = Number.isInteger(out.requested) && out.requested > 0 && out.requested <= 100000 ? { requested: out.requested } : {};
        else if (t === 'request_staff_approval') args = { action: 'refund' };
        else if (t === 'get_rates') { args = { scope: out.scope === 'bill' && b ? 'bill' : 'tonight' }; intent = args.scope === 'bill' ? 'bill' : 'rates'; }
        return { tool: t, args, intent };
      }
    };
  }

  SILA.brains.model = Object.freeze({ create, grounded });
})(typeof window !== 'undefined' ? window : globalThis);
