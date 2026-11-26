/* صلة — a stand-in for an OpenAI-compatible model endpoint, for running the evaluation with no key and at no cost.
   IT IS NOT A LANGUAGE MODEL. It answers the "agent" task by asking the written rules brain what each part of the message
   means and returning that as a plan, and it answers the "reply" task by repeating the hotel's own sentences.
   What it proves is that the whole path works (server prompt and schema check, plan, permission engine, loop, scoring).
   Its accuracy says how far the written rules get, and nothing about any real model. */
import http from 'node:http';
import { loadAgent } from './agent-vm.mjs';

const { rules } = loadAgent().brains;
const between = (s, tag) => { const m = String(s).match(new RegExp('<' + tag + '>\\n?([\\s\\S]*?)\\n?</' + tag + '>')); return m ? m[1] : ''; };
const blank = (tool, extra) => Object.assign({ tool, items: [], via: null, kind: null, scope: null, requested: null, note: '', question: '' }, extra);

function plan(text, st, history) {
  /* "fix it" after an earlier turn: the stand-in reads the last guest line the way the rules do. A matter the agent could not carry
     out is taken up again; one it did carry out is only answered. */
  const lines = String(history || '').split('\n'), heard = (lines.filter(l => l.startsWith('guest: ')).pop() || '').slice(7), said = (lines.filter(l => l.startsWith('agent: ')).pop() || '').slice(7);
  if (rules.vague(text) && heard) {
    if (!said || /could not|went wrong|تعذ[ّ]?ر|خلل/.test(said)) text = heard;
    else return { actions: [], reply: /[؀-ۿ]/.test(text) ? 'طلبك السابق مسجّل ويُتابَع.' : 'Your earlier request is registered and being followed up.' };
  }
  const ar = /[؀-ۿ]/.test(text), b = st.booking;
  const state = { stage: st.stage, pending: st.pending, booking: b ? { room: b.room, key: b.key, paid: b.paid, arrived: b.arrived, alt: b.alternativeRoomAvailable ? '0' : null } : null, perms: {} };
  const main = rules.intentOf(text, state, st.stage), stance = rules.stance(text, main.intent);
  if (stance === 'conflict') return { actions: [blank('clarify', { question: ar ? 'أي الطلبين تريد؟' : 'Which of the two do you want?' })], reply: '' };
  const say = { actions: [], reply: ar ? 'أهلاً بك. أنا هنا لمساعدتك.' : 'Welcome. I am here to help.' };
  if (stance === 'refused') return say;
  const actions = [];
  for (const i of [main.intent].concat(rules.others(text, state, st.stage, main.intent))) {
    if (i === 'refund') actions.push(blank('request_staff_approval'));
    else if (i === 'comp') actions.push(blank('compensate', { requested: main.requested || null }));
    else if (i === 'move') actions.push(blank('move_room'));
    else if (i === 'late') actions.push(blank('late_checkout'));
    else if (i === 'code') actions.push(blank('reissue_key', { via: 'code' }));
    else if (i === 'give_key') actions.push(blank('issue_key', { via: main.via || null }));
    else if (i === 'clean' || i === 'maint') actions.push(blank('open_ticket', { kind: i, note: text.slice(0, 80) }));
    else if (i === 'requests') actions.push(blank('route_request', { items: rules.splitRequests(text) }));
    else if (i === 'bill' || i === 'rates') actions.push(blank('get_rates', { scope: i === 'bill' ? 'bill' : 'tonight' }));
    else if (i === 'status') actions.push(blank('get_room_status'));
    else if (i === 'mine') actions.push(blank('find_booking'));
    else if (i === 'card') actions.push(blank('store_card_data'));
    else if (i === 'other_room') actions.push(blank('open_room_for_other'));
    else if (i === 'price') actions.push(blank('change_price'));
  }
  return actions.length ? { actions: actions.slice(0, 4), reply: '' } : say;
}

export function startStandIn() {
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.url.endsWith('/models')) return res.end(JSON.stringify({ data: [{ id: 'stand-in' }] }));
      let out = {};
      try {
        const m = JSON.parse(raw || '{}').messages || [], sys = String((m[0] || {}).content), user = String((m[1] || {}).content);
        if (sys.includes('closing reply')) out = { reply: between(user, 'said').split('\n').filter(Boolean).join(' ') };
        else if (sys.includes('"actions"')) out = plan(between(user, 'guest_text'), JSON.parse(between(user, 'booking_state') || '{}'), between(user, 'history'));
      } catch (e) { out = {}; }
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(r => server.close(r)) })));
}
