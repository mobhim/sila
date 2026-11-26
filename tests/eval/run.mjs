/* صلة — the evaluation of the agent's understanding.   npm run eval   (node tests/eval/run.mjs [options])

   A case in cases.json is a guest message with the list of actions a front desk should take for it, or a short conversation:
   "turns", each with its own message and expected actions (an offer then "yes", a question then the answer, an arrival
   interrupted by a question). Every turn is run through the real pipeline: the model brain asks lib/sila-ai.js for a plan, the
   plan goes through the loop and the permission engine, and if the model fails the written rules take the turn, exactly as on
   the site. Tools are not carried out against a hotel: a small world keeps what a conversation needs from one turn to the
   next (an offer on the table, a call waiting for a yes, a late check-out already given, the turns so far).
   What is scored is which actions were proposed for the guest's words and, where a case says so ("engine"), what the
   permission engine decided about them.

   Which model: with --api URL, whatever the deployed service uses. Otherwise, with SILA_LLM_KEY (or ANTHROPIC_API_KEY) in the
   environment or in .env, the real one. Without a key, or with --stand-in, a local stand-in that is NOT a language model
   (see stand-in.mjs): it proves the path works, nothing more.

   Options:  --runs N      times each case is run (default 3)
             --delay MS    pause between model turns (default 2200 with a real model, to stay inside free quotas; 0 with the stand-in)
             --cat A,B     only these categories (a list, or --cat given more than once)        --limit N   only the first N cases
             --fails       list every case that did not pass, with what was expected and what happened
             --reply       also ask for the closing reply (the second model call) and count how often it passes the checks
             --json FILE   write every result to a file
             --api URL     send every model call to a deployed copy of the service instead of calling the provider from this machine
             --stand-in    use the stand-in even when a key is set */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadAgent, ROOT } from './agent-vm.mjs';
import { startStandIn } from './stand-in.mjs';

const argv = process.argv.slice(2), flag = n => argv.includes('--' + n), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
const opts = n => argv.flatMap((a, i) => (a === '--' + n && argv[i + 1] != null ? String(argv[i + 1]).split(',') : [])).map(s => s.trim()).filter(Boolean);
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) {}
const hasKey = !!((process.env.SILA_LLM_KEY || '').trim() || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
/* --api URL: send every model call to a deployed copy of the service (e.g. https://sila-kappa.vercel.app/api/ask) instead of calling
   the provider from this machine. No local key is needed, and it is the path a visitor's browser takes. */
const API = opt('api', '');
const real = (hasKey || !!API) && !flag('stand-in');
let standIn = null;
if (!real) {
  standIn = await startStandIn();
  delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_AUTH_TOKEN;
  process.env.SILA_LLM_KEY = 'stand-in-not-a-key'; process.env.SILA_LLM_URL = standIn.url; process.env.SILA_LLM_MODEL = 'stand-in';
}
delete process.env.SILA_MOCK;
process.env.SILA_RATE_PER_MIN = '600'; process.env.SILA_DAILY_CAP = '1000000';      // the server's own limits are for the public demo, not for this run
const ai = await import(pathToFileURL(path.join(ROOT, 'lib', 'sila-ai.js')).href);
const SILA = loadAgent(), rules = SILA.brains.rules;

const RUNS = Math.max(1, parseInt(opt('runs', '3'), 10) || 3), DELAY = Math.max(0, parseInt(opt('delay', real ? '2200' : '0'), 10) || 0);
let cases = JSON.parse(readFileSync(path.join(ROOT, 'tests', 'eval', 'cases.json'), 'utf8'));
const CATS = opts('cat');
if (CATS.length) {
  const known = new Set(cases.map(c => c.cat)), odd = CATS.filter(k => !known.has(k));
  if (odd.length) { console.error('no such category: ' + odd.join(', ') + '   (there are: ' + [...known].join(', ') + ')'); process.exit(2); }
  cases = cases.filter(c => CATS.includes(c.cat));
}
if (opt('limit')) cases = cases.slice(0, parseInt(opt('limit'), 10));
const turnsOf = c => (Array.isArray(c.turns) ? c.turns : [{ text: c.text, expect: c.expect, alt: c.alt, engine: c.engine }]);

/* ---------- one fixed hotel and one fixed guest, so that every run sees the same world ---------- */
const HOTEL = {
  name: 'Sila demo hotel', season: 'Regular season', adjustment: '+5%', currency: 'SAR',
  rooms: [{ category: 'Royal Suite', nightlyRate: 893, rooms: 2, vacantAndReady: 1 }, { category: 'Standard', nightlyRate: 546, rooms: 2, vacantAndReady: 1 }, { category: 'View Suite', nightlyRate: 1155, rooms: 2, vacantAndReady: 1 }],
  bill: { nightlyRate: 893, nights: 3, total: '3,080.85 SAR', paid: true },
  policies: ['Check-out is at 12:00 PM; one extra hour, to 1:00 PM, is possible when the hotel allows it.', 'Rates are per night and the total includes 15% VAT.', 'No room key is issued before payment and before the room is ready.',
    'A move is to a room of the same category at the same price.', 'A full refund is decided by reception staff; compensation has a limit set by the hotel.', 'The assistant never takes card details, changes prices or opens a room for anyone but the guest on the booking.'],
  halls: [{ name: 'Al Waha Hall', areaSqm: 140, fullDayRate: 7500 }, { name: 'Al Nada Grand Hall', areaSqm: 748, fullDayRate: 29000 }],
  landmarks: [{ city: 'Riyadh', about: 'The capital.', places: ['Kingdom Centre Tower: a sky bridge over the city', 'At-Turaif in Diriyah: a World Heritage site built of mud brick'] }]
};
const PERMS = { reissue: true, ticket: true, move: true, late: true, limit: 150 };
const ROOMS = [{ no: '412', cat: 'Royal Suite', state: 'ready', taken: true }, { no: '414', cat: 'Royal Suite', state: 'ready', taken: false }, { no: '915', cat: 'View Suite', state: 'ready', taken: true }];
/* presets: none (no booking yet) · prepay (arrived, not paid) · key (paid, no key yet) · stay (key in hand) · offer (stay, with a move offered) */
function world(preset) {
  const there = preset !== 'none', paid = preset !== 'prepay', key = preset === 'stay' || preset === 'offer' ? 'code' : null;
  const b = there ? { room: '412', cat: 'Royal Suite', category: 'Royal Suite', nights: 3, arrived: true, paid, key, late: false, comp: 0, refunded: false, roomState: 'ready', alt: '414' } : null;
  const stage = !there ? 'identify' : !paid ? 'payment' : !key ? 'key' : 'stay';
  return {
    offer: preset === 'offer', confirm: null,
    state: { stage, waiting: false, booking: b, perms: PERMS },
    facts: { booking: b && { room: b.room, arrived: true, paid, key, late: false, comp: 0, refunded: false, total: 3080.85, hasPhone: true, hasEmail: true, keys: ['1087654321', '0500000412'] }, rooms: ROOMS.map(r => Object.assign({}, r)), perms: PERMS }
  };
}
const snapshotOf = w => Object.assign({}, w.state, { pending: w.confirm ? 'confirm' : w.offer ? 'move_offer' : null, confirm: w.confirm });
/* what a tool that ran leaves behind for the turns after it */
function effect(w, tool, args, d) {
  const b = w.state.booking, f = w.facts.booking;
  if (!b) return;
  if (tool === 'late_checkout') b.late = f.late = true;
  else if (tool === 'compensate') b.comp = f.comp = (d && d.amount) || 1;
  else if (tool === 'request_staff_approval') b.refunded = f.refunded = true;
  else if (tool === 'issue_key') { b.key = f.key = args && args.via === 'card' ? 'card' : 'code'; w.state.stage = 'stay'; }
  else if (tool === 'move_room') {
    w.facts.rooms.forEach(r => { if (r.no === b.room) r.taken = false; if (r.no === (args && args.to)) r.taken = true; });
    b.room = f.room = (args && args.to) || b.room; b.alt = null; w.offer = false;
  }
}
const redact = t => String(t).replace(/\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/g, '[card number removed]').replace(/(^|\D)(?:[12]\d{5}|05\d{4})(\d{4})(?=\D|$)/g, '$1••••••$2');

/* ---------- what a turn proposed, in the vocabulary of cases.json ---------- */
const AFTER = ['apology', 'fallback', 'next_step', 'offer_move', 'unhandled'];      // steps the agent adds on its own: not part of what the guest asked for
const SAID = { free: s => (s.intent === 'clarify' ? 'clarify' : 'answer'), info: () => 'answer', clarify: () => 'clarify', followup: () => 'answer', confirm_no: () => 'declined', ask_key: () => 'issue_key', no_alt: () => 'move_room', need_id: () => 'move_room', unhandled: () => null };
const proposed = steps => steps.filter(s => !AFTER.includes(s.intent)).map(s => (s.tool ? s.tool : SAID[s.say] ? SAID[s.say](s) : 'say:' + s.say)).filter(Boolean);
const same = (a, b) => a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');
const passes = (t, got) => same(got, t.expect) || (t.alt || []).some(x => same(got, x));
/* "engine": what the permission engine must have decided for a tool, when that tool was proposed. An injected amount is the example:
   the tool is the right one, and the case passes only if the engine sent it to staff. */
const engineOk = (t, steps) => (t.engine || []).every(e => { const hit = steps.filter(s => s.tool === e.tool); return !hit.length || hit.some(s => s.verdict === e.verdict && (!e.code || s.code === e.code)); });

const TOOL_AR = { open_ticket: 'فتح بلاغ', route_request: 'تحويل الطلب', request_staff_approval: 'طلب موافقة موظف', late_checkout: 'تأخير المغادرة', move_room: 'النقل لغرفة أخرى', reissue_key: 'إعادة إصدار الرمز',
  issue_key: 'إصدار المفتاح', get_rates: 'قراءة الأسعار', get_room_status: 'حالة الغرفة', compensate: 'التعويض', find_booking: 'بيانات الحجز', store_card_data: 'حفظ بيانات بطاقة', open_room_for_other: 'فتح غرفة لغير صاحبها', change_price: 'تغيير السعر' };
let ipN = 0;
const sleep =ms => new Promise(r => setTimeout(r, ms));
/* one turn of a conversation: w and history carry over from the turn before */
async function turn(t, w, history) {
  const lang = rules.langOf(t.text, 'ar');           // Arabic typed in Latin letters is answered in Arabic, as on the page
  let calls = 0, fell = null, wording = null; const via = [], rejected = [], kept = [];
  const ask = async (task, input) => {
    calls++;
    const r = API
      ? await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ task, lang, input }) })
        .then(async x => ({ status: x.status, body: await x.json().catch(() => ({})), via: x.headers.get('x-sila-via') || '' }), e => ({ status: 0, body: {}, via: 'no answer from the service: ' + (e && e.cause && e.cause.code || e.message) }))
      : await ai.handleAsk({ method: 'POST', ip: 'eval-' + (++ipN), body: { task, lang, input } });
    via.push(task + ' ' + r.status + (r.via ? ' <- ' + r.via : ''));
    if (r.status !== 200) throw new Error('ai ' + r.status);
    return r.body.output;
  };
  const brain = SILA.brains.model.create({ ask, hotel: () => HOTEL, rejected: (why, text) => rejected.push({ why, text: String(text).slice(0, 300) }) });
  const input = { type: 'text', text: t.text, shown: redact(t.text) }, t0 = performance.now();
  let offer0 = w.offer;                              // an offer on the table is answered by this turn, whatever the guest says
  const out = await SILA.agent.turn({
    input, lang, brain, fallback: rules, snapshot: () => snapshotOf(w), facts: () => w.facts, history: () => history, alive: () => true,
    run: async (tool, args, d) => { effect(w, tool, args, d); return { ok: true, note: '' }; },
    approve: async () => true, refuse: async () => {}, failed: async () => {},
    hold: (call, d) => { kept.push({ tool: call.tool, args: d.args }); },
    speak: async code => { if (code === 'offer_move' && w.state.booking && w.state.booking.alt) w.offer = true; },
    record: () => { if (offer0) { offer0 = false; w.offer = false; } },
    onFallback: e => { fell = String(e && e.message); }
  });
  const ms = performance.now() - t0;
  if (flag('reply') && !fell && out.steps.some(s => s.tool && s.brain === 'model' && !s.held)) {
    /* the page hands the model its own sentences about the turn, in the guest's language; here a plain line per action stands for them */
    const said = out.steps.filter(s => s.tool).map(s => (lang === 'ar' ? (TOOL_AR[s.tool] || s.tool) + ': ' + (s.held ? 'بانتظار تأكيد النزيل' : s.result && s.result.ok ? 'تم' : 'لم يتم')
      : s.tool.replace(/_/g, ' ') + ': ' + (s.held ? 'waiting for the guest to confirm' : s.result && s.result.ok ? 'done' : 'not done')));
    try { wording = !!(await brain.compose({ input, steps: out.steps, said, facts: '412', lang })); } catch (e) { wording = false; }
  }
  w.confirm = kept.length ? kept : null;             // what this turn kept for a yes replaces whatever was kept before
  const got = proposed(out.steps);
  history.push({ typed: true, heard: input.shown, did: out.steps.filter(s => s.tool).map(s => s.tool + ':' + (s.result && s.result.ok ? 'ok' : s.result && s.result.denied ? 'denied' : 'no')),
    said: out.steps.map(s => (s.say === 'free' && s.text ? s.text : s.tool ? s.tool.replace(/_/g, ' ') + (s.held ? ' (waiting for the guest to confirm)' : s.result && s.result.ok ? ' (done)' : ' (not done)') : '(' + s.say + ')')).join('; ') });
  return { text: t.text, expect: t.expect, got, pass: passes(t, got) && engineOk(t, out.steps), ms, model: calls > 0, fell, wording, via, rejected,
    clarify: got.includes('clarify'), asked: out.steps.some(s => s.held),
    engine: out.steps.filter(s => s.tool).map(s => ({ tool: s.tool, brain: s.brain, verdict: s.verdict, tier: s.tier, code: s.code, held: !!s.held, amount: s.amount == null ? undefined : s.amount })) };
}
/* a case: one turn, or several in the same world */
async function run(c) {
  const w = world(c.state), history = (c.history || []).map(h => Object.assign({}, h)), turns = [];
  for (const t of turnsOf(c)) {
    const res = await turn(t, w, history);
    turns.push(res);
    if (DELAY && res.model) await sleep(DELAY);
  }
  return { turns, pass: turns.every(t => t.pass) };
}

/* ---------- run ---------- */
const host = (process.env.SILA_LLM_URL || (/^gsk_/.test(process.env.SILA_LLM_KEY || '') ? 'api.groq.com' : 'generativelanguage.googleapis.com')).replace(/^https?:\/\//, '').split('/')[0];
const turnCount = cases.reduce((n, c) => n + turnsOf(c).length, 0);
console.log('Sila agent evaluation');
console.log(API ? 'Model: whatever the deployed service uses, through ' + API
  : real ? 'Model: the configured one, through lib/sila-ai.js (' + (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'Claude key' : 'provider ' + host) + ')'
  : 'Model: LOCAL STAND-IN, not a language model. It replays the written rules; these numbers say nothing about a real model.');
console.log(cases.length + ' cases (' + turnCount + ' turns) × ' + RUNS + ' run' + (RUNS > 1 ? 's' : '') + (DELAY ? ', ' + DELAY + ' ms between model turns' : '') + (CATS.length ? ', categories: ' + CATS.join(', ') : '') + '\n');

const rows = cases.map(c => ({ c, runs: [] }));
for (let r = 0; r < RUNS; r++) {
  for (const row of rows) row.runs.push(await run(row.c));
  process.stderr.write('run ' + (r + 1) + '/' + RUNS + ' done\n');
}
if (standIn) await standIn.close();

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '-');
const quant = (list, q) => { if (!list.length) return null; const s = list.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const cats = [...new Set(rows.map(r => r.c.cat))];
const line = (name, set) => {
  const runs = set.flatMap(r => r.runs);
  return name.padEnd(15) + String(set.length).padStart(5) + pct(runs.filter(x => x.pass).length, runs.length).padStart(11) + pct(set.filter(r => r.runs.every(x => x.pass)).length, set.length).padStart(11);
};
console.log('category'.padEnd(15) + 'cases'.padStart(5) + 'accuracy'.padStart(11) + ('pass^' + RUNS).padStart(11));
cats.forEach(k => console.log(line(k, rows.filter(r => r.c.cat === k))));
console.log(line('ALL', rows));
console.log('\naccuracy: share of runs whose proposed actions match the expected list (for a conversation, in every turn).   pass^' + RUNS + ': share of cases that passed in all ' + RUNS + ' runs.');

/* per category: how often the agent asked instead of acting, and how often a model's words were thrown away */
{
  const count = (set, f) => set.flatMap(r => r.runs).flatMap(x => x.turns).reduce((n, t) => n + (f(t) ? 1 : 0), 0), rej = (set, why) => set.flatMap(r => r.runs).flatMap(x => x.turns).reduce((n, t) => n + t.rejected.filter(x => x.why === why).length, 0);
  const row = (name, set) => name.padEnd(15) + String(count(set, () => true)).padStart(6) + String(count(set, t => t.clarify)).padStart(9) + String(count(set, t => t.asked)).padStart(9) + String(rej(set, 'fact')).padStart(7) + String(rej(set, 'claim')).padStart(7) + String(rej(set, 'number')).padStart(8) + String(rej(set, 'language')).padStart(10);
  console.log('\n' + 'category'.padEnd(15) + 'turns'.padStart(6) + 'clarify'.padStart(9) + 'confirm'.padStart(9) + 'fact'.padStart(7) + 'claim'.padStart(7) + 'number'.padStart(8) + 'language'.padStart(10));
  cats.forEach(k => console.log(row(k, rows.filter(r => r.c.cat === k))));
  console.log(row('ALL', rows));
  console.log('clarify: turns answered with a question.   confirm: turns in which a model-proposed change was held for the guest\'s yes.');
  console.log('fact, claim, number, language: replies of a model thrown away by the fact checker, the claim checker, the number check and the language check' + (flag('reply') ? ' (first answers and closing replies).' : ' (first answers only; add --reply to count closing replies).'));
  const thrown = rows.flatMap(r => r.runs.flatMap(x => x.turns.flatMap(t => t.rejected.map(j => ({ id: r.c.id, why: j.why, text: j.text })))));
  if (thrown.length) { console.log('\nthrown away:'); thrown.slice(0, 60).forEach(j => console.log('  ' + j.id + '  [' + j.why + ']  ' + JSON.stringify(j.text))); if (thrown.length > 60) console.log('  … and ' + (thrown.length - 60) + ' more (see --json)'); }
}

const all = rows.flatMap(r => r.runs).flatMap(x => x.turns), reached = all.filter(x => x.model), fell = reached.filter(x => x.fell);
const med = quant(reached.map(x => x.ms), 0.5), p95 = quant(reached.map(x => x.ms), 0.95);
console.log('\nturns that reached the model: ' + reached.length + ' of ' + all.length + ' (' + pct(all.length - reached.length, all.length) + ' were answered in the browser by the rules: cards, other rooms, prices and rates, policy questions, ID numbers, a bare yes or no, a message that names nothing)');
console.log('latency of those turns: median ' + (med == null ? '-' : Math.round(med) + ' ms') + ', p95 ' + (p95 == null ? '-' : Math.round(p95) + ' ms'));
console.log('fell back to the rules after the model failed or its answer was thrown away: ' + fell.length + ' of ' + reached.length + ' (' + pct(fell.length, reached.length) + ')');
const why = {}; fell.forEach(x => { why[x.fell] = (why[x.fell] || 0) + 1; });
Object.keys(why).sort((a, b) => why[b] - why[a]).slice(0, 8).forEach(k => console.log('   ' + String(why[k]).padStart(4) + ' × ' + k));
if (flag('reply')) { const w = all.filter(x => x.wording != null); console.log('closing reply (second call) passed the language, number, claim and fact checks: ' + w.filter(x => x.wording).length + ' of ' + w.length + ' (' + pct(w.filter(x => x.wording).length, w.length) + ')'); }

/* what the provider was asked, as the service reported it: one line per try, "model status note" */
{
  const tries = all.flatMap(x => x.via || []).flatMap(v => (v.split(' <- ')[1] || '').split(' | ')).filter(Boolean), tally = {};
  tries.forEach(t => { const m = t.split(' '), k = m[0] + ' ' + (m[1] || ''); tally[k] = (tally[k] || 0) + 1; });
  const calls = all.reduce((n, x) => n + (x.via ? x.via.length : 0), 0);
  console.log('\nservice calls: ' + calls + '   provider tries reported: ' + tries.length + (calls ? ' (' + (tries.length / calls).toFixed(2) + ' per call)' : ''));
  Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 12).forEach(k => console.log('   ' + String(tally[k]).padStart(4) + ' × ' + k));
  const notes = [...new Set(tries.filter(t => / (429|404|503|400) /.test(t + ' ')).map(t => t.slice(0, 220)))].slice(0, 4);
  notes.forEach(n => console.log('   e.g. ' + n));
}

if (flag('fails')) {
  console.log('\nnot passed:');
  const show = t => JSON.stringify(t.got) + (t.fell ? ' (rules, after: ' + t.fell + ')' : '') + ((t.engine || []).some(e => e.verdict) && !t.pass ? ' engine ' + JSON.stringify(t.engine.map(e => e.tool + ':' + e.verdict + (e.code ? '/' + e.code : ''))) : '');
  rows.forEach(r => {
    const bad = r.runs.filter(x => !x.pass); if (!bad.length) return;
    if (!r.c.turns) return console.log('  ' + r.c.id + '  ' + JSON.stringify(r.c.text) + '\n      expected ' + JSON.stringify(r.c.expect) + (r.c.engine ? ' engine ' + JSON.stringify(r.c.engine) : '') + '   got ' + [...new Set(bad.map(x => show(x.turns[0])))].join('  /  ') + '   in ' + bad.length + '/' + r.runs.length);
    console.log('  ' + r.c.id + '   in ' + bad.length + '/' + r.runs.length);
    bad[0].turns.forEach((t, i) => console.log('      ' + (t.pass ? 'ok  ' : 'NOT ') + (i + 1) + '. ' + JSON.stringify(t.text) + '   expected ' + JSON.stringify(t.expect) + (r.c.turns[i].engine ? ' engine ' + JSON.stringify(r.c.turns[i].engine) : '') + '   got ' + show(t)));
  });
}
if (opt('json')) {
  writeFileSync(opt('json'), JSON.stringify({ model: API ? 'service' : real ? 'real' : 'stand-in', runs: RUNS, results: rows.map(r => ({ id: r.c.id, cat: r.c.cat, text: r.c.text, expect: r.c.expect, state: r.c.state,
    runs: r.runs.map(x => ({ pass: x.pass, turns: x.turns.map(t => ({ text: t.text, expect: t.expect, got: t.got, pass: t.pass, ms: Math.round(t.ms), model: t.model, fell: t.fell, via: t.via, clarify: t.clarify, confirmAsked: t.asked, engine: t.engine, rejected: t.rejected, wording: t.wording })) })) })) }, null, 1));
  console.log('\nwritten: ' + opt('json'));
}
