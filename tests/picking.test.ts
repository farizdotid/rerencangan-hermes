import { describe, expect, it } from 'vitest';
import { CLICK_MAX_MOVE_PX, CLICK_MAX_MS, isClick } from '../src/ui/picking';

describe('isClick', () => {
  const down = { x: 100, y: 100, t: 0 };

  it('accepts a short, still press', () => {
    expect(isClick(down, { x: 102, y: 101, t: 150 })).toBe(true);
    expect(isClick(down, { x: 100 + CLICK_MAX_MOVE_PX, y: 100, t: CLICK_MAX_MS })).toBe(true);
  });

  it('rejects a camera drag or a long press', () => {
    expect(isClick(down, { x: 140, y: 100, t: 150 })).toBe(false);
    expect(isClick(down, { x: 100, y: 100, t: CLICK_MAX_MS + 1 })).toBe(false);
  });
});
