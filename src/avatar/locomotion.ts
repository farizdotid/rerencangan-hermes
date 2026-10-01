import type { BedPlaces, DeskPlaces, Placement } from './route';
import { WALK_Y } from './route';

/** How long an agent stays idle at its desk before walking off for a nap. */
export const SLEEP_AFTER_IDLE_SECONDS = 180;

export const WALK_SPEED = 1.3;
const TURN_RATE = 7;
const STEP_RATE = Math.PI * 2 * 1.8;

/** Blend weights for the three body postures; they always sum to 1. */
export interface Posture {
  seated: number;
  walk: number;
  lie: number;
}

const SEATED: Posture = { seated: 1, walk: 0, lie: 0 };
const WALKING: Posture = { seated: 0, walk: 1, lie: 0 };
const LYING: Posture = { seated: 0, walk: 0, lie: 1 };

type Step =
  | { kind: 'move'; to: Placement; posture: Posture; duration: number; t: number; from: Snapshot | null }
  | { kind: 'walk'; to: Placement };

interface Snapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  posture: Posture;
}

export type Destination = 'desk' | 'bed';

function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Signed shortest turn from angle a to angle b, in (-pi, pi]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Moves an avatar between its chair and its bed: stand up, walk, turn, lie
 * down (and the reverse). Changing the destination mid-way re-plans from
 * wherever the avatar is, so it never jumps. Pure numbers, no three.js.
 */
export class Locomotion {
  x: number;
  y: number;
  z: number;
  yaw: number;
  posture: Posture = { ...SEATED };
  /** Walk cycle phase in radians; drives arm and foot swing. */
  stepPhase = 0;

  private destination: Destination = 'desk';
  private plan: Step[] = [];

  /**
   * @param via waypoints (x/z) on the way from the desk to the bed; walked in
   *   reverse on the way back.
   */
  constructor(
    private readonly desk: DeskPlaces,
    private readonly bed: BedPlaces | null,
    private readonly via: readonly { x: number; z: number }[] = [],
  ) {
    ({ x: this.x, y: this.y, z: this.z, yaw: this.yaw } = desk.seat);
  }

  /** Where the avatar is going (or already is). */
  get heading(): Destination {
    return this.destination;
  }

  get moving(): boolean {
    return this.plan.length > 0;
  }

  goTo(destination: Destination): void {
    if (destination === 'bed' && !this.bed) return;
    if (destination === this.destination) return;
    this.destination = destination;
    this.plan = destination === 'bed' ? this.planToBed(this.bed!) : this.planToDesk();
  }

  update(dtSeconds: number): void {
    const dt = Number.isFinite(dtSeconds) && dtSeconds > 0 ? dtSeconds : 0;
    const step = this.plan[0];
    if (!step || dt === 0) return;
    this.stepPhase = (this.stepPhase + STEP_RATE * dt * this.posture.walk) % (Math.PI * 2);
    if (step.kind === 'move') this.move(step, dt);
    else this.walk(step, dt);
  }

  private planToBed(bed: BedPlaces): Step[] {
    if (this.posture.lie > 0) return [this.moveTo(bed.lie, LYING, 0.9 * (1 - this.posture.lie) + 0.15)];
    const steps: Step[] = [];
    if (this.posture.seated > 0) steps.push(this.moveTo(this.desk.standOut, WALKING, 0.5));
    for (const p of this.via) steps.push(this.walkTo(p));
    steps.push({ kind: 'walk', to: bed.approach });
    steps.push(this.moveTo(bed.lie, LYING, 1.0));
    return steps;
  }

  private planToDesk(): Step[] {
    const p = this.posture;
    if (p.seated > 0 && p.lie === 0) return [this.moveTo(this.desk.seat, SEATED, 0.5 * (1 - p.seated) + 0.15)];
    const steps: Step[] = [];
    if (p.lie > 0 && this.bed) steps.push(this.moveTo(this.bed.approach, WALKING, 0.9));
    for (const v of [...this.via].reverse()) steps.push(this.walkTo(v));
    steps.push({ kind: 'walk', to: this.desk.standOut });
    steps.push(this.moveTo(this.desk.seat, SEATED, 0.5));
    return steps;
  }

  private walkTo(p: { x: number; z: number }): Step {
    return { kind: 'walk', to: { x: p.x, y: WALK_Y, z: p.z, yaw: 0 } };
  }

  private moveTo(to: Placement, posture: Posture, duration: number): Step {
    return { kind: 'move', to, posture, duration, t: 0, from: null };
  }

  private move(step: Extract<Step, { kind: 'move' }>, dt: number): void {
    step.from ??= { x: this.x, y: this.y, z: this.z, yaw: this.yaw, posture: { ...this.posture } };
    const f = step.from;
    step.t = Math.min(1, step.t + dt / step.duration);
    const e = smoothstep(step.t);
    this.x = f.x + (step.to.x - f.x) * e;
    this.y = f.y + (step.to.y - f.y) * e;
    this.z = f.z + (step.to.z - f.z) * e;
    this.yaw = f.yaw + angleDelta(f.yaw, step.to.yaw) * e;
    this.posture = {
      seated: f.posture.seated + (step.posture.seated - f.posture.seated) * e,
      walk: f.posture.walk + (step.posture.walk - f.posture.walk) * e,
      lie: f.posture.lie + (step.posture.lie - f.posture.lie) * e,
    };
    if (step.t >= 1) {
      this.posture = { ...step.posture };
      this.plan.shift();
    }
  }

  private walk(step: Extract<Step, { kind: 'walk' }>, dt: number): void {
    const dx = step.to.x - this.x;
    const dz = step.to.z - this.z;
    const dist = Math.hypot(dx, dz);

    // Turn towards the target, and slow down while facing away from it.
    const want = dist > 1e-6 ? Math.atan2(-dx, -dz) : this.yaw;
    const err = angleDelta(this.yaw, want);
    const turn = Math.sign(err) * Math.min(Math.abs(err), TURN_RATE * dt);
    this.yaw += turn;
    const pace = Math.max(0.15, Math.cos(err - turn));
    const travel = WALK_SPEED * dt * pace;

    this.y += (step.to.y - this.y) * Math.min(1, dt * 8);
    this.posture = { ...WALKING };
    if (dist <= travel) {
      this.x = step.to.x;
      this.z = step.to.z;
      this.y = step.to.y;
      this.plan.shift();
      return;
    }
    this.x += (dx / dist) * travel;
    this.z += (dz / dist) * travel;
  }
}
