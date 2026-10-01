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
    const { bedroom: _bedroom, ...open } = DEFAULT_LAYOUT;
    const noBeds = (desks: OfficeLayout['desks']): OfficeLayout => ({ ...open, desks, beds: [] });
    expect(validateLayout(noBeds([{ ...slot, rotationY: 0 }]))).toEqual([]);
    expect(validateLayout(noBeds([slot]))).toContain('slot "r" is outside the room');
  });

  it('checks beds for bounds, overlaps, and duplicate ids', () => {
    const bed = DEFAULT_LAYOUT.beds[0]!;
    expect(validateLayout({ ...DEFAULT_LAYOUT, beds: [bed, { ...bed, id: 'bed-x', z: bed.z + 0.5 }] })).toContain(
      'slots "bed-1" and "bed-x" overlap',
    );
    expect(validateLayout({ ...DEFAULT_LAYOUT, beds: [{ ...bed, x: -6.5 }] })).toContain('slot "bed-1" is outside the room');
    expect(validateLayout({ ...DEFAULT_LAYOUT, beds: [{ ...bed, id: 'desk-1' }] })).toContain('duplicate slot id "desk-1"');
  });

  it('has one bed per desk in the default layout', () => {
    expect(DEFAULT_LAYOUT.beds).toHaveLength(DEFAULT_LAYOUT.desks.length);
  });

  it('checks the bedroom partition and its furniture', () => {
    const bedroom = DEFAULT_LAYOUT.bedroom!;
    const desk = DEFAULT_LAYOUT.desks[0]!;
    const halfD = DEFAULT_LAYOUT.room.depth / 2;
    expect(validateLayout(withDesks([{ ...desk, x: bedroom.partitionX }]))).toContain(`slot "${desk.id}" crosses the partition`);
    expect(validateLayout({ ...DEFAULT_LAYOUT, bedroom: { ...bedroom, doorZ: halfD } })).toContain(
      'bedroom doorway is outside the room',
    );
    expect(validateLayout({ ...DEFAULT_LAYOUT, bedroom: { ...bedroom, partitionX: 100 } })).toContain(
      'bedroom partition is outside the room',
    );
    const stand = bedroom.nightstands[0]!;
    expect(
      validateLayout({ ...DEFAULT_LAYOUT, bedroom: { ...bedroom, nightstands: [{ ...stand, z: DEFAULT_LAYOUT.beds[0]!.z }] } }),
    ).toContain(`slots "bed-1" and "${stand.id}" overlap`);
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
