import type { AgentConfig } from '../config';

/**
 * Agents to show in real mode: every discovered profile, in config order
 * first (with config display names), then the rest in discovery order.
 * Profiles marked hidden in the config are left out. Config entries for
 * profiles that do not exist are ignored.
 */
export function resolveRoster(discovered: readonly string[], overrides: readonly AgentConfig[]): AgentConfig[] {
  const present = new Set(discovered);
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const out: AgentConfig[] = [];
  const used = new Set<string>();

  for (const o of overrides) {
    if (!present.has(o.id) || used.has(o.id)) continue;
    used.add(o.id);
    if (!o.hidden) out.push({ id: o.id, displayName: o.displayName });
  }
  for (const id of discovered) {
    if (used.has(id)) continue;
    used.add(id);
    const o = byId.get(id);
    if (!o?.hidden) out.push({ id, displayName: o?.displayName ?? id });
  }
  return out;
}
