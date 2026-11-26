/* صلة — the permission engine. The brain proposes; this code decides.
   decide(call, facts) is the only way a tool call gets to run. It never reads what the guest wrote and never asks a model:
   it looks at the tool's tier, the hotel's switches and limit, and facts about the booking that the page computed itself.
   Every amount that appears in a decision is calculated here.

   call:  { tool, args }
   facts: { booking: null | { room, cat, arrived, paid, key, late, comp, refunded, total, hasPhone, hasEmail, keys: [id, phone] },
            rooms: [{ no, cat, state, taken }],
            perms: { reissue, ticket, move, late, limit } }
   ->     { verdict: 'allow' | 'approve' | 'deny', tier, code, args, amount? }
          tier: auto · set · limit · staff · never · guard (a precondition in code, e.g. no key before payment) */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const COMP_SHARE = 0.1;                         // the automatic compensation: a tenth of the bill, capped by the hotel's limit

  const allow = (tier, args, extra) => Object.assign({ verdict: 'allow', tier, code: 'ok', args }, extra);
  const approve = (tier, code, args, extra) => Object.assign({ verdict: 'approve', tier, code, args }, extra);
  const deny = (tier, code) => ({ verdict: 'deny', tier, code, args: null });
  const NEVER = { store_card_data: 'card_data', open_room_for_other: 'other_room', change_price: 'price' };

  function decide(call, facts) {
    const tools = SILA.tools, name = call && call.tool;
    if (!tools.has(name)) return deny('never', 'unknown_tool');
    const spec = tools.spec(name);
    if (spec.tier === 'never') return deny('never', NEVER[name] || 'forbidden');
    const args = tools.validate(name, call.args);
    if (args === undefined) return deny('guard', 'bad_args');

    const b = facts && facts.booking, perms = (facts && facts.perms) || {}, rooms = (facts && facts.rooms) || [];
    if (spec.needsBooking && !b) return deny('guard', 'no_booking');
    const mine = b ? rooms.find(r => r.no === b.room) : null;
    const bySwitch = () => (perms[spec.perm] ? allow('set', args) : approve('set', 'switched_off', args));

    switch (name) {
      case 'find_booking':
        if (b && args.key && !(b.keys || []).includes(args.key)) return deny('never', 'other_booking');
        return allow('auto', args);
      case 'get_room_status': case 'get_rates': case 'check_in': case 'route_request':
        return allow('auto', args);
      case 'issue_key':
        if (b.refunded) return deny('guard', 'refunded');
        if (b.key) return deny('guard', 'has_key');
        if (!b.arrived) return deny('guard', 'not_arrived');
        if (!b.paid) return deny('guard', 'not_paid');
        if (!mine || mine.state !== 'ready') return deny('guard', 'room_not_ready');
        if (args.via === 'sms' && !b.hasPhone) return deny('guard', 'no_contact');
        if (args.via === 'email' && !b.hasEmail) return deny('guard', 'no_contact');
        return allow('auto', args);
      case 'reissue_key':
        if (!b.key) return deny('guard', 'no_key');
        if (b.refunded) return deny('guard', 'refunded');
        if (args.via === 'card' || b.key === 'card') return allow('auto', Object.assign({}, args, { via: 'card' }));      // a card is handed over by a person at reception
        return perms.reissue ? allow('set', Object.assign({}, args, { via: 'code' })) : approve('set', 'switched_off', Object.assign({}, args, { via: 'code' }));
      case 'open_ticket':
        return bySwitch();
      case 'move_room': {
        const to = rooms.find(r => r.no === args.to);
        if (!to || !mine || to.no === mine.no) return deny('guard', 'target_unavailable');
        if (to.cat !== mine.cat) return deny('never', 'other_category');          // a different category is a different price
        if (to.taken) return deny('never', 'other_room');
        if (to.state !== 'ready') return deny('guard', 'target_unavailable');
        return bySwitch();
      }
      case 'late_checkout':
        if (b.late) return deny('guard', 'already');
        return bySwitch();
      case 'compensate': {
        if (!b.paid) return deny('guard', 'not_paid');
        if (b.refunded) return deny('guard', 'refunded');
        const limit = Math.max(0, Number(perms.limit) || 0), share = Math.round(b.total * COMP_SHARE), auto = Math.min(limit, share);
        if (args.requested && args.requested > auto)                               // more than the code would give: a person decides
          return approve('staff', 'over_limit', args, { amount: Math.min(args.requested, Math.round(b.total)), limit });
        if (b.comp) return deny('guard', 'already');
        if (!auto) return approve('staff', 'limit_zero', args, { amount: share, limit });
        return allow('limit', args, { amount: auto, limit });
      }
      case 'request_staff_approval':
        if (!b.paid) return deny('guard', 'not_paid');
        if (b.refunded) return deny('guard', 'already');
        return approve('staff', 'always_staff', args, { amount: b.total });
    }
    return deny('never', 'unknown_tool');
  }

  SILA.permissions = Object.freeze({ decide, COMP_SHARE });
})(typeof window !== 'undefined' ? window : globalThis);
