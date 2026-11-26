/* صلة — the connector contract. A connector is the only thing that knows how to talk to a partner hotel's system.
   Sila's agent, its tools and its sync engine use these methods and nothing else, so replacing the demo partner
   with a real system means writing one object with this shape (see docs/CONNECTORS.md).

   Reading — the partner is the reference for bookings, room states and rates:
     status()            -> { online: boolean }
     revision()          -> a value that changes whenever the partner's data changes (a counter, an ETag, a timestamp)
     getBookings()       -> Promise<[{ id, name, room, nights, eta, phone, email }]>
     getRooms()          -> Promise<[{ no, cat, rate, state }]>          state: 'ready' | 'prep' | 'maint'
     getRates()          -> Promise<[{ cat, rate }]>                      the base nightly rate of each category

   Writing — every operation carries opId; a partner that has seen an opId answers { ok: true, duplicate: true } and does nothing:
     pushCheckIn(op)     { opId, bookingId, room, at }
     pushRequest(op)     { opId, bookingId, room, kind: 'request' | 'ticket', items?, ticket? }
     pushRoomChange(op)  { opId, bookingId, from, to, fromState? }       refused with error 'conflict' if the partner's room is not `from`
     pushRoomState(op)   { opId, room, from, to }                        refused with error 'conflict' if the partner's state is not `from`
                         -> Promise<{ ok, duplicate?, error?, revision? }>; rejects with an Error whose code is 'offline' when unreachable

   Events:
     subscribe(handler)  handler({ type: 'changed' })  the partner's data changed
                         handler({ type: 'link', online })  the connection went down or came back
                         -> a function that unsubscribes */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const METHODS = ['status', 'revision', 'getBookings', 'getRooms', 'getRates', 'pushCheckIn', 'pushRequest', 'pushRoomChange', 'pushRoomState', 'subscribe'];
  const PUSH = { check_in: 'pushCheckIn', request: 'pushRequest', ticket: 'pushRequest', room_change: 'pushRoomChange', room_state: 'pushRoomState' };
  SILA.connectors = Object.freeze({
    METHODS: Object.freeze(METHODS), PUSH: Object.freeze(PUSH),
    /* the names of whatever a connector is missing; an empty list means it can be plugged in */
    missing: c => METHODS.filter(m => !c || typeof c[m] !== 'function')
  });
})(typeof window !== 'undefined' ? window : globalThis);
