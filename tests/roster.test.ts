import { describe, expect, it } from 'vitest';
import { resolveRoster } from '../server/sources/roster';

describe('resolveRoster', () => {
  const found = ['default', 'writer', 'research', 'planner'];

  it('shows every discovered profile when there is no config', () => {
    expect(resolveRoster(found, [])).toEqual(found.map((id) => ({ id, displayName: id })));
  });

  it('applies display names and order from config, then appends the rest', () => {
    expect(
      resolveRoster(found, [
        { id: 'planner', displayName: 'Planner' },
        { id: 'default', displayName: 'Main' },
      ]),
    ).toEqual([
      { id: 'planner', displayName: 'Planner' },
      { id: 'default', displayName: 'Main' },
      { id: 'writer', displayName: 'writer' },
      { id: 'research', displayName: 'research' },
    ]);
  });

  it('hides profiles marked hidden, and ignores config for profiles that do not exist', () => {
    expect(
      resolveRoster(found, [
        { id: 'writer', displayName: 'writer', hidden: true },
        { id: 'ghost', displayName: 'Ghost' },
      ]).map((a) => a.id),
    ).toEqual(['default', 'research', 'planner']);
  });
});
