/* Loads the agent's browser files (agent/*.js) into Node, exactly as the page runs them, so the evaluation and its stand-in
   use the same loop, permission engine, rules brain, claim checker and model brain as the site. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export function loadAgent() {
  const box = { window: {} };
  vm.createContext(box);
  for (const f of ['tools', 'permissions', 'brain-rules', 'claims', 'facts', 'brain-model', 'loop']) vm.runInContext(readFileSync(path.join(ROOT, 'agent', f + '.js'), 'utf8'), box, { filename: f + '.js' });
  return box.window.SILA;
}
