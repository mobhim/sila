/* صلة — the evaluation of the agent's understanding.   npm run eval   (node tests/eval/run.mjs [options])

   Each case in cases.json is one guest message with the list of actions a front desk should take for it. Every case is run
   through the real pipeline: the model brain asks lib/sila-ai.js for a plan, the plan goes through the loop and the permission
   engine, and if the model fails the written rules take the turn, exactly as on the site. Tools are not carried out: what is
   scored is which actions were proposed for the guest's words.

   Which model: with SILA_LLM_KEY (or ANTHROPIC_API_KEY) in the environment or in .env, the real one. Without a key, or with
   --stand-in, a local stand-in that is NOT a language model (see stand-in.mjs): it proves the path works, nothing more.

   Options:  --runs N      times each case is run (default 3)
             --delay MS    pause between model turns (default 2200 with a real model, to stay inside free quotas; 0 with the stand-in)
             --cat NAME    only one category        --limit N   only the first N cases
             --fails       list every case that did not pass, with what was expected and what happened
             --reply       also ask for the closing reply (the second model call) and count how often it passes the checks
             --json FILE   write every result to a file
             --stand-in    use the stand-in even when a key is set */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { loadAgent, ROOT } from './agent-vm.mjs';
import { startStandIn } from './stand-in.mjs';

const argv = process.argv.slice(2), flag = n => argv.includes('--' + n), opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : d; };
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch (e) {}
const hasKey = !!((process.env.SILA_LLM_KEY || '').trim() || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const real = hasKey && !flag('stand-in');
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
if (opt('cat')) cases = cases.filter(c => c.cat === opt('cat'));
if (opt('limit')) cases = cases.slice(0, parseInt(opt('limit'), 10));

/* ---------- one fixed hotel and one fixed guest, so that every run sees the same world ---------- */
const HOTEL = {
  name: 'Sila demo hotel', season: 'Regular season', adjustment: '+5%', currency: 'SAR',
  rooms: [{ category: 'Royal Suite', nightlyRate: 893, rooms: 2, vacantAndReady: 1 }, { category: 'Standard', nightlyRate: 546, rooms: 2, vacantAndReady: 1 }, { category: 'View Suite', nightlyRate: 1155, rooms: 2, vacantAndReady: 1 }],
  bill: { nightlyRate: 893, nights: 3, total: '3,080.85 SAR', paid: true },
  policies: ['Check-out is at 12:00 PM; one extra hour, to 1:00 PM, is possible when the hotel allows it.', 'Rates are per night and the total includes 15% VAT.', 'No room key is issued before payment and before the room is ready.',
    'A move is to a room of the same category at the same price.', 'A full refund is decided by reception staff; compensation has a limit set by the hotel.', 'The assistant never takes card details, changes prices or opens a room for anyone but the guest on the booking.'],
  landmarks: [{ city: 'Riyadh', about: 'The capital.', places: ['Kingdom Centre Tower: a sky bridge over the city', 'At-Turaif in Diriyah: a World Heritage site built of mud brick'] }]
};
const PERMS = { reissue: true, ticket: true, move: true, late: true, limit: 150 };
const ROOMS = [{ no: '412', cat: 'Royal Suite', state: 'ready', taken: true }, { no: '414', cat: 'Royal Suite', state: 'ready', taken: false }, { no: '915', cat: 'View Suite', state: 'ready', taken: true }];
function world(preset) {
  const there = preset !== 'none', paid = preset !== 'prepay', key = preset === 'stay' || preset === 'offer' ? 'code' : null;
  const b = there ? { room: '412', cat: 'Royal Suite', category: 'Royal Suite', nights: 3, arrived: true, paid, key, late: false, comp: 0, refunded: false, roomState: 'ready', alt: '414' } : null;
  const stage = !there ? 'identify' : !paid ? 'payment' : !key ? 'key' : 'stay';
  return {
    state: { stage, waiting: false, pending: preset === 'offer' ? 'move_offer' : null, confirm: null, booking: b, perms: PERMS },
    facts: { booking: b && { room: b.room, arrived: true, paid, key, late: false, comp: 0, refunded: false, total: 3080.85, hasPhone: true, hasEmail: true, keys: ['1087654321', '0500000412'] }, rooms: ROOMS, perms: PERMS }
  };
}
const redact = t => String(t).replace(/\b\d{13,19}\b|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/g, '[card number removed]').replace(/(^|\D)(?:[12]\d{5}|05\d{4})(\d{4})(?=\D|$)/g, '$1••••••$2');

/* ---------- what a turn proposed, in the vocabulary of cases.json ---------- */
const AFTER = ['apology', 'fallback', 'next_step', 'offer_move', 'unhandled'];      // steps the agent adds on its own: not part of what the guest asked for
const SAID = { free: s => (s.intent === 'clarify' ? 'clarify' : 'answer'), info: () => 'answer', clarify: () => 'clarify', confirm_no: () => 'declined', ask_key: () => 'issue_key', no_alt: () => 'move_room', need_id: () => 'move_room', unhandled: () => null };
const proposed = steps => steps.filter(s => !AFTER.includes(s.intent)).map(s => (s.tool ? s.tool : SAID[s.say] ? SAID[s.say](s) : 'say:' + s.say)).filter(Boolean);
const same = (a, b) => a.length === b.length && a.slice().sort().join('|') === b.slice().sort().join('|');
const passes = (c, got) => same(got, c.expect) || (c.alt || []).some(x => same(got, x));

let ipN = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function turn(c) {
  const w = world(c.state), lang = /[؀-ۿ]/.test(c.text) ? 'ar' : 'en';
  let calls = 0, fell = null, wording = null;
  const ask = async (task, input) => {
    calls++;
    const r = await ai.handleAsk({ method: 'POST', ip: 'eval-' + (++ipN), body: { task, lang, input } });
    if (r.status !== 200) throw new Error('ai ' + r.status);
    return r.body.output;
  };
  const brain = SILA.brains.model.create({ ask, hotel: () => HOTEL });
  const input = { type: 'text', text: c.text, shown: redact(c.text) }, t0 = performance.now();
  const out = await SILA.agent.turn({
    input, lang, brain, fallback: rules, snapshot: () => w.state, facts: () => w.facts, history: () => [], alive: () => true,
    run: async () => ({ ok: true, note: '' }), approve: async () => true, refuse: async () => {}, hold: () => {}, failed: async () => {}, speak: async () => {}, record: () => {},
    onFallback: e => { fell = String(e && e.message); }
  });
  const ms = performance.now() - t0;
  if (flag('reply') && !fell && out.steps.some(s => s.tool && s.brain === 'model' && !s.held)) {
    const said = out.steps.filter(s => s.tool).map(s => s.tool.replace(/_/g, ' ') + ': ' + (s.held ? 'waiting for the guest to confirm' : s.result && s.result.ok ? 'done' : 'not done'));
    try { wording = !!(await brain.compose({ input, steps: out.steps, said, facts: '412' })); } catch (e) { wording = false; }
  }
  return { got: proposed(out.steps), ms, model: calls > 0, fell, wording };
}

/* ---------- run ---------- */
const host = (process.env.SILA_LLM_URL || (/^gsk_/.test(process.env.SILA_LLM_KEY || '') ? 'api.groq.com' : 'generativelanguage.googleapis.com')).replace(/^https?:\/\//, '').split('/')[0];
console.log('Sila agent evaluation');
console.log(real ? 'Model: the configured one, through lib/sila-ai.js (' + (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'Claude key' : 'provider ' + host) + ')'
  : 'Model: LOCAL STAND-IN, not a language model. It replays the written rules; these numbers say nothing about a real model.');
console.log(cases.length + ' cases × ' + RUNS + ' run' + (RUNS > 1 ? 's' : '') + (DELAY ? ', ' + DELAY + ' ms between model turns' : '') + '\n');

const rows = cases.map(c => ({ c, runs: [] }));
for (let r = 0; r < RUNS; r++) {
  for (const row of rows) {
    const res = await turn(row.c);
    res.pass = passes(row.c, res.got);
    row.runs.push(res);
    if (DELAY && res.model) await sleep(DELAY);
  }
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
console.log('\naccuracy: share of runs whose proposed actions match the expected list.   pass^' + RUNS + ': share of cases that passed in all ' + RUNS + ' runs.');

const all = rows.flatMap(r => r.runs), reached = all.filter(x => x.model), fell = reached.filter(x => x.fell);
const med = quant(reached.map(x => x.ms), 0.5), p95 = quant(reached.map(x => x.ms), 0.95);
console.log('\nturns that reached the model: ' + reached.length + ' of ' + all.length + ' (' + pct(all.length - reached.length, all.length) + ' were answered in the browser by the rules: cards, other rooms, prices, ID numbers)');
console.log('latency of those turns: median ' + (med == null ? '-' : Math.round(med) + ' ms') + ', p95 ' + (p95 == null ? '-' : Math.round(p95) + ' ms'));
console.log('fell back to the rules after the model failed or its answer was thrown away: ' + fell.length + ' of ' + reached.length + ' (' + pct(fell.length, reached.length) + ')');
const why = {}; fell.forEach(x => { why[x.fell] = (why[x.fell] || 0) + 1; });
Object.keys(why).sort((a, b) => why[b] - why[a]).slice(0, 6).forEach(k => console.log('   ' + String(why[k]).padStart(4) + ' × ' + k));
if (flag('reply')) { const w = all.filter(x => x.wording != null); console.log('closing reply (second call) passed the claim and number checks: ' + w.filter(x => x.wording).length + ' of ' + w.length + ' (' + pct(w.filter(x => x.wording).length, w.length) + ')'); }

if (flag('fails')) {
  console.log('\nnot passed:');
  rows.forEach(r => { const bad = r.runs.filter(x => !x.pass); if (bad.length) console.log('  ' + r.c.id + '  ' + JSON.stringify(r.c.text) + '\n      expected ' + JSON.stringify(r.c.expect) + '   got ' + [...new Set(bad.map(x => JSON.stringify(x.got) + (x.fell ? ' (rules, after: ' + x.fell + ')' : '')))].join('  /  ') + '   in ' + bad.length + '/' + r.runs.length); });
}
if (opt('json')) {
  writeFileSync(opt('json'), JSON.stringify({ model: real ? 'real' : 'stand-in', runs: RUNS, results: rows.map(r => ({ id: r.c.id, cat: r.c.cat, text: r.c.text, expect: r.c.expect, runs: r.runs.map(x => ({ got: x.got, pass: x.pass, ms: Math.round(x.ms), model: x.model, fell: x.fell })) })) }, null, 1));
  console.log('\nwritten: ' + opt('json'));
}
