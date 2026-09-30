import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, validateLayout, type OfficeLayout } from '../src/scene/layout';

function withDesks(desks: OfficeLayout['desks']): OfficeLayout {
  return { ...DEFAULT_LAYOUT, desks };
}

describe('validateLayout', () => {
  it('accepts the default layout', () => {
    expect(validateLayout(DEFAULT_LAYOUT)).toEqual([]);
  });

  it('rejects duplicate slot ids', () => {
    const errors = validateLayout(
      withDesks([
        { id: 'a', x: -3, z: 0, rotationY: 0 },
        { id: 'a', x: 3, z: 0, rotationY: 0 },
      ]),
    );
    expect(errors).toContain('duplicate slot id "a"');
  });

  it('rejects slots outside the room', () => {
    const errors = validateLayout(withDesks([{ id: 'far', x: 100, z: 0, rotationY: 0 }]));
    expect(errors).toContain('slot "far" is outside the room');
  });

  it('rejects overlapping slots', () => {
    const errors = validateLayout(
      withDesks([
        { id: 'a', x: 0, z: 0, rotationY: 0 },
        { id: 'b', x: 0.5, z: 0, rotationY: 0 },
      ]),
    );
    expect(errors).toContain('slots "a" and "b" overlap');
  });

  it('accounts for rotation when checking bounds', () => {
    // Rotated 90°, the desk's depth runs along X and pokes past the side wall.
    const halfW = DEFAULT_LAYOUT.room.width / 2;
    const slot = { id: 'r', x: -halfW + 1.05, z: 0, rotationY: Math.PI / 2 };
    expect(validateLayout(withDesks([{ ...slot, rotationY: 0 }]))).toEqual([]);
    expect(validateLayout(withDesks([slot]))).toContain('slot "r" is outside the room');
  });

  it('rejects non-finite coordinates and bad room sizes', () => {
    expect(validateLayout(withDesks([{ id: 'n', x: Number.NaN, z: 0, rotationY: 0 }]))).toEqual([
      'slot coordinates must be finite numbers',
    ]);
    expect(validateLayout({ ...DEFAULT_LAYOUT, room: { ...DEFAULT_LAYOUT.room, width: 0 } })).toEqual([
      'room dimensions must be positive',
    ]);
  });
});
