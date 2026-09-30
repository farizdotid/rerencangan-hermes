import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT } from '../src/scene/layout';
import { buildOffice, disposeTree } from '../src/scene/office';

describe('buildOffice', () => {
  it('creates one desk per layout slot and a rack', () => {
    const office = buildOffice(DEFAULT_LAYOUT);
    expect(office.desks.map((d) => d.slot.id)).toEqual(DEFAULT_LAYOUT.desks.map((s) => s.id));
    expect(office.root.getObjectByName('server-rack')).toBeDefined();
    office.dispose();
  });

  it('gives each desk its own screen material', () => {
    const office = buildOffice(DEFAULT_LAYOUT);
    const screens = new Set(office.desks.map((d) => d.screen));
    expect(screens.size).toBe(office.desks.length);
    office.dispose();
  });

  it('places desks at their slot positions', () => {
    const office = buildOffice(DEFAULT_LAYOUT);
    for (const desk of office.desks) {
      expect(desk.group.position.x).toBe(desk.slot.x);
      expect(desk.group.position.z).toBe(desk.slot.z);
    }
    office.dispose();
  });
});

describe('disposeTree', () => {
  it('disposes shared geometry and materials exactly once', () => {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshBasicMaterial();
    const other = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, [material, other]));

    const g = vi.spyOn(geometry, 'dispose');
    const m = vi.spyOn(material, 'dispose');
    const o = vi.spyOn(other, 'dispose');
    disposeTree(root);

    expect(g).toHaveBeenCalledTimes(1);
    expect(m).toHaveBeenCalledTimes(1);
    expect(o).toHaveBeenCalledTimes(1);
  });

  it('disposes every geometry and material of a built office', () => {
    const office = buildOffice(DEFAULT_LAYOUT);
    const disposed = new Set<unknown>();
    office.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const res of [obj.geometry, ...mats]) {
          res.addEventListener('dispose', () => disposed.add(res));
        }
      }
    });
    const expected = new Set<unknown>();
    office.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        expected.add(obj.geometry);
        const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) expected.add(mat);
      }
    });

    office.dispose();
    expect(disposed).toEqual(expected);
    expect(office.root.parent).toBeNull();
  });
});
