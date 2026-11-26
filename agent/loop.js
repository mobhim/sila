/* صلة — the agent loop. One turn per guest message or screen action:
     ask the brain for an action -> if it is a tool call, ask the permission engine -> allowed: run it and record it
     -> over the line: put an approval in front of staff and wait -> never allowed: refuse, in code
     -> hand the result back to the brain, which replies or carries on with another tool. At most MAX_STEPS per turn.
   The loop owns no hotel data. Everything it touches is handed to it by the page:
     brain, fallback        two brains with the same next(); if the first one fails, the turn carries on with the second
     snapshot()             the redacted state a brain may see
     facts()                what the permission engine decides on
     run(tool, args, d)     runs an allowed tool and returns { ok, note, ... }
     approve(call, d)       resolves true or false when a staff member decides
     speak(code, state)     says one of the page's own sentences
     refuse(call, d)        tells the guest a call was refused
     failed(call, d, e)     tells the guest a tool broke while it ran; the turn carries on
     hold(call, d)          keeps a call that a model proposed until the guest confirms it (see CONFIRM)
     record(entry)          one line of the agent's trail
     alive()                false once the guest has moved on; the turn stops quietly */
(root => {
  const SILA = root.SILA = root.SILA || {};
  const MAX_STEPS = 6;
  /* a model can mishear. These tools change the booking, so when a brain other than the written rules proposes one, it is not
     run: the guest is asked first, and their "yes" comes back as a new turn that the rules brain proposes and the engine decides.
     Reading tools, a ticket and a request to a department need no confirmation. */
  const CONFIRM = ['move_room', 'late_checkout', 'compensate', 'reissue_key', 'issue_key'];

  async function turn(o) {
    const steps = [], input = Object.assign({}, o.input, { at: o.snapshot().stage });
    let brain = o.brain, n = 0;
    for (; n < MAX_STEPS; n++) {
      const state = o.snapshot();
      let act = null;
      try { act = await brain.next({ input, state, steps, lang: o.lang, history: o.history ? o.history() : [] }); }
      catch (e) {
        if (!o.fallback || brain === o.fallback) throw e;
        brain = o.fallback; if (o.onFallback) o.onFallback(e);            // the guest sees no break: the same turn carries on with the rules
        act = await brain.next({ input, state, steps, lang: o.lang, history: o.history ? o.history() : [] });
      }
      if (!o.alive()) return { steps, stopped: true };
      if (!act || act.done) break;

      if (act.say) {
        const step = { n, say: String(act.say), intent: act.intent, brain: act.by || brain.name, text: act.text };
        steps.push(step); o.record(Object.assign({ kind: 'say' }, step));
        await o.speak(step.say, state, act.text);
        if (!o.alive()) return { steps, stopped: true };
        if (act.end !== false) break;
        continue;
      }

      const call = { tool: String(act.tool), args: act.args && typeof act.args === 'object' ? act.args : {} };
      const d = SILA.permissions.decide(call, o.facts());
      const step = { n, tool: call.tool, args: d.args || call.args, intent: act.intent, brain: act.by || brain.name, verdict: d.verdict, tier: d.tier, code: d.code, amount: d.amount };
      if (d.verdict === 'deny') {
        step.result = { ok: false, denied: true, code: d.code };
        o.record(Object.assign({ kind: 'tool' }, step));
        await o.refuse(call, d, state);
      } else if (step.brain !== 'rules' && CONFIRM.includes(call.tool) && o.hold) {
        step.held = true; step.result = { ok: false, held: true };
        o.record(Object.assign({ kind: 'tool' }, step));
        await o.hold(call, d, state);
      } else {
        let go = true;
        if (d.verdict === 'approve') {
          o.record(Object.assign({ kind: 'tool', waiting: true }, step));
          go = await o.approve(call, d, state);
          if (!o.alive()) return { steps, stopped: true };
          step.approved = !!go;
        }
        let broke = null;
        if (!go) step.result = { ok: false, declined: true };
        else {
          try { step.result = await o.run(call.tool, d.args, d, { first: n === 0, steps }); }
          catch (e) { broke = e; step.result = { ok: false, error: true }; }      // a tool that throws is one failed step, not a broken turn
        }
        if (!step.result) step.result = { ok: false };
        o.record(Object.assign({ kind: 'tool' }, step));
        if (broke && o.failed) await o.failed(call, d, broke);
        if (!go && o.declined) await o.declined(call, d, state);
      }
      steps.push(step);
      if (!o.alive()) return { steps, stopped: true };
    }
    if (n >= MAX_STEPS) o.record({ kind: 'limit', n });
    return { steps, stopped: false, limit: n >= MAX_STEPS };
  }

  SILA.agent = Object.freeze({ turn, MAX_STEPS, CONFIRM: Object.freeze(CONFIRM.slice()) });
})(typeof window !== 'undefined' ? window : globalThis);
