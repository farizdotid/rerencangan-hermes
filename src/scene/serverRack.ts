import * as THREE from 'three';
import type { Slot } from './layout';
import { ledBrightness } from './ledBlink';
import { PALETTE } from './palette';

const WIDTH = 0.8;
const HEIGHT = 2.0;
const DEPTH = 0.7;
const UNITS = 6;
const LEDS_PER_UNIT = 3;

/** A server rack with blinking status LEDs. Front faces +Z locally. */
export class ServerRack {
  readonly group = new THREE.Group();
  private readonly leds: THREE.InstancedMesh;
  private readonly baseColor = new THREE.Color(PALETTE.ledOk);
  private readonly scratch = new THREE.Color();

  constructor(slot: Slot) {
    this.group.name = 'server-rack';
    this.group.position.set(slot.x, 0, slot.z);
    this.group.rotation.y = slot.rotationY;

    const bodyMat = new THREE.MeshStandardMaterial({ color: PALETTE.rackBody, roughness: 0.6, metalness: 0.2 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH), bodyMat);
    body.position.y = HEIGHT / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Server units as one instanced mesh.
    const unitHeight = (HEIGHT - 0.3) / UNITS;
    const unitMat = new THREE.MeshStandardMaterial({ color: PALETTE.rackPanel, roughness: 0.5 });
    const units = new THREE.InstancedMesh(
      new THREE.BoxGeometry(WIDTH - 0.1, unitHeight - 0.05, 0.02),
      unitMat,
      UNITS,
    );
    const m = new THREE.Matrix4();
    const frontZ = DEPTH / 2 + 0.01;
    for (let i = 0; i < UNITS; i++) {
      m.makeTranslation(0, 0.2 + unitHeight * (i + 0.5), frontZ);
      units.setMatrixAt(i, m);
    }
    this.group.add(units);

    // LEDs: unlit so they read as glowing; brightness via per-instance color.
    const ledCount = UNITS * LEDS_PER_UNIT;
    this.leds = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.045, 0.045, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ledCount,
    );
    this.leds.name = 'rack-leds';
    for (let u = 0; u < UNITS; u++) {
      for (let l = 0; l < LEDS_PER_UNIT; l++) {
        const x = WIDTH / 2 - 0.12 - l * 0.08;
        m.makeTranslation(x, 0.2 + unitHeight * (u + 0.5), frontZ + 0.02);
        this.leds.setMatrixAt(u * LEDS_PER_UNIT + l, m);
      }
    }
    this.group.add(this.leds);
    this.update(0);
  }

  /** Change LED color, e.g. green for a healthy gateway, red when it is down. */
  setLedColor(color: THREE.ColorRepresentation): void {
    this.baseColor.set(color);
  }

  update(timeSeconds: number): void {
    for (let i = 0; i < this.leds.count; i++) {
      this.scratch.copy(this.baseColor).multiplyScalar(ledBrightness(timeSeconds, i));
      this.leds.setColorAt(i, this.scratch);
    }
    if (this.leds.instanceColor) this.leds.instanceColor.needsUpdate = true;
  }
}
