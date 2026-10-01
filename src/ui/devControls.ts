import { AGENT_STATES, type AgentState } from '../data/types';

export type DevCommand = { kind: 'force'; state: AgentState } | { kind: 'nap' } | { kind: 'demo' };

/** Keys 1-5 force a state on every agent, 6 sends everyone to bed, 0 hands control back to the data. */
export function commandForKey(key: string): DevCommand | null {
  if (key === '0') return { kind: 'demo' };
  if (key === '6') return { kind: 'nap' };
  const n = Number.parseInt(key, 10);
  if (String(n) === key && n >= 1 && n <= AGENT_STATES.length) {
    return { kind: 'force', state: AGENT_STATES[n - 1]! };
  }
  return null;
}

/** Installs the keyboard shortcuts and a small hint. Returns a cleanup function. */
export function installDevControls(parent: HTMLElement, onCommand: (cmd: DevCommand) => void): () => void {
  const hint = document.createElement('div');
  hint.className = 'dev-hint';
  const items = AGENT_STATES.map((s, i) => `${i + 1} ${s}`).concat('6 nap', '0 data');
  hint.textContent = items.join(' · ');
  parent.appendChild(hint);

  const onKey = (e: KeyboardEvent): void => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const cmd = commandForKey(e.key);
    if (cmd) onCommand(cmd);
  };
  window.addEventListener('keydown', onKey);
  return () => {
    window.removeEventListener('keydown', onKey);
    hint.remove();
  };
}
