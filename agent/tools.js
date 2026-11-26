/* صلة — the agent's tools: a name, a description and an argument schema for each.
   This file only describes them. What a tool does is bound later by the page (app.js) on top of the functions it already had,
   and whether a call may run is decided by agent/permissions.js. A brain can name a tool and fill its arguments; nothing more. */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const DEPTS = ['housekeeping', 'room_service', 'reception', 'maintenance', 'concierge'];

  /* tier: auto = the agent does it on its own · set = a switch the hotel controls · limit = inside an amount the hotel sets
           staff = always needs a staff member · never = refused in code, whatever is asked */
  const SPECS = {
    find_booking: {
      tier: 'auto', needsBooking: false,
      description: 'Find the booking linked to the ID or mobile number the guest gave, or read the current guest’s own booking.',
      args: { key: { type: 'string', pattern: /^\d{10}$/, optional: true }, by: { type: 'string', enum: ['id', 'phone'], optional: true } }
    },
    get_room_status: {
      tier: 'auto', needsBooking: true,
      description: 'Read whether the guest’s room is ready, being prepared or under maintenance, and whether a ready room of the same category exists.',
      args: {}
    },
    get_rates: {
      tier: 'auto', needsBooking: false,
      description: 'Read tonight’s nightly rates, or the guest’s own bill (scope "bill"). Prices are computed by the hotel’s code.',
      args: { scope: { type: 'string', enum: ['tonight', 'bill'], optional: true } }
    },
    check_in: {
      tier: 'auto', needsBooking: true,
      description: 'Register the guest’s arrival on their booking.',
      args: {}
    },
    route_request: {
      tier: 'auto', needsBooking: true,
      description: 'Send each of the guest’s requests to the department responsible for it.',
      args: {
        items: {
          type: 'array', min: 1, max: 6,
          items: { type: 'object', props: { request: { type: 'string', max: 80, min: 1 }, dept: { type: 'string', enum: DEPTS } } }
        },
        note: { type: 'boolean', optional: true }
      }
    },
    issue_key: {
      tier: 'auto', needsBooking: true,
      description: 'Issue the room’s access code (by SMS or email) or prepare a key card at reception. Only after payment and only when the room is ready.',
      args: { via: { type: 'string', enum: ['sms', 'email', 'card'] } }
    },
    reissue_key: {
      tier: 'set', perm: 'reissue', needsBooking: true,
      description: 'Cancel the access code and issue a new one, or switch the guest to a key card from reception (via "card").',
      args: { via: { type: 'string', enum: ['code', 'card'], optional: true } }
    },
    open_ticket: {
      tier: 'set', perm: 'ticket', needsBooking: true,
      description: 'Open a maintenance or cleaning ticket for the guest’s room.',
      args: { kind: { type: 'string', enum: ['maint', 'clean'] }, text: { type: 'string', max: 80, optional: true } }
    },
    move_room: {
      tier: 'set', perm: 'move', needsBooking: true,
      description: 'Move the guest to another room of the same category that is ready and vacant, at the same price.',
      args: { to: { type: 'string', pattern: /^\d{3,4}$/ }, why: { type: 'string', enum: ['prep', 'maint', 'guest'], optional: true } }
    },
    late_checkout: {
      tier: 'set', perm: 'late', needsBooking: true,
      description: 'Extend the guest’s checkout by one hour.',
      args: {}
    },
    compensate: {
      tier: 'limit', needsBooking: true,
      description: 'Compensate the guest. The amount is computed by the hotel’s code inside the hotel’s limit; a larger amount the guest asks for goes to staff.',
      args: { requested: { type: 'integer', min: 1, max: 100000, optional: true } }
    },
    request_staff_approval: {
      tier: 'staff', needsBooking: true,
      description: 'Ask a staff member to decide something the agent may never decide alone: a full refund.',
      args: { action: { type: 'string', enum: ['refund'] } }
    },
    /* named so that a brain can say what was asked for; the permission engine refuses all three, always */
    store_card_data: { tier: 'never', needsBooking: false, description: 'Read, keep or repeat payment-card details. Always refused.', args: {} },
    open_room_for_other: {
      tier: 'never', needsBooking: false,
      description: 'Open a room, or issue its key, for anyone other than the guest on the booking. Always refused.',
      args: { room: { type: 'string', max: 6, optional: true } }
    },
    change_price: { tier: 'never', needsBooking: false, description: 'Change a rate, a bill or a total, or skip payment. Always refused.', args: {} }
  };

  /* returns a clean copy of the value if it fits the schema, otherwise undefined; unknown properties are a failure, not ignored */
  function fit(schema, v) {
    if (schema.type === 'string') {
      if (typeof v !== 'string') return undefined;
      if (schema.max && v.length > schema.max) return undefined;
      if (schema.min && v.trim().length < schema.min) return undefined;
      if (schema.pattern && !schema.pattern.test(v)) return undefined;
      if (schema.enum && !schema.enum.includes(v)) return undefined;
      return v;
    }
    if (schema.type === 'integer') return Number.isInteger(v) && v >= schema.min && v <= schema.max ? v : undefined;
    if (schema.type === 'boolean') return typeof v === 'boolean' ? v : undefined;
    if (schema.type === 'array') {
      if (!Array.isArray(v) || v.length < (schema.min || 0) || v.length > schema.max) return undefined;
      const out = v.map(x => fit(schema.items, x));
      return out.includes(undefined) ? undefined : out;
    }
    if (schema.type === 'object') return fitProps(schema.props, v);
    return undefined;
  }
  function fitProps(props, v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    const out = {};
    for (const k of Object.keys(v)) if (!Object.prototype.hasOwnProperty.call(props, k)) return undefined;
    for (const k of Object.keys(props)) {
      if (v[k] === undefined || v[k] === null) { if (props[k].optional) continue; return undefined; }
      const c = fit(props[k], v[k]); if (c === undefined) return undefined;
      out[k] = c;
    }
    return out;
  }

  const has = name => typeof name === 'string' && Object.prototype.hasOwnProperty.call(SPECS, name);
  SILA.tools = Object.freeze({
    DEPTS: Object.freeze(DEPTS.slice()),
    names: Object.freeze(Object.keys(SPECS)),
    has,
    spec: name => (has(name) ? SPECS[name] : null),
    validate: (name, args) => (has(name) ? fitProps(SPECS[name].args, args == null ? {} : args) : undefined),
    /* the list a model is shown: names, descriptions and argument shapes, nothing about the hotel's data */
    catalogue: () => Object.keys(SPECS).map(name => ({
      name, tier: SPECS[name].tier, description: SPECS[name].description,
      args: JSON.parse(JSON.stringify(SPECS[name].args, (k, v) => (v instanceof RegExp ? v.source : v)))
    }))
  });
})(typeof window !== 'undefined' ? window : globalThis);
