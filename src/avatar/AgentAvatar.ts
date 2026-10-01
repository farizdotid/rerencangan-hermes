import * as THREE from 'three';
import type { AgentState } from '../data/types';
import type { Bed } from '../scene/bed';
import type { Desk } from '../scene/desk';
import { PALETTE } from '../scene/palette';
import { Locomotion, SLEEP_AFTER_IDLE_SECONDS } from './locomotion';
import { applyPosture, blendPose, emptyPose, type Pose } from './pose';
import { bedPlaces, deskPlaces } from './route';
import { AvatarStateMachine, type StateWeights } from './stateMachine';
import { createGlowSprite, createTextSprite, disposeSprite } from './sprites';

export interface AgentAvatarOptions {
  id: string;
  displayName: string;
  color: THREE.ColorRepresentation;
  desk: Desk;
  /** Where this agent naps after a long idle; without one it stays at the desk. */
  bed?: Bed | null;
  /** Waypoints on the walk from desk to bed (office space). */
  walkVia?: readonly { x: number; z: number }[];
  initialState?: AgentState;
}

const SCREEN_GLOW = new THREE.Color(0x8fbaff);
const SCREEN_ALERT = new THREE.Color(0xff6b6b);
const SCREEN_CHEER = new THREE.Color(0x6fe3a1);
const HEAD_Y = 0.78;
const MAX_LOOK_YAW = 1.0;
/** Label height above the avatar origin while upright, and above the head while lying. */
const LABEL_Y_UPRIGHT = 1.7;
const LABEL_Y_LYING = 0.95;

/** Head turn (local to the desk) that points the face roughly at the iso camera. */
function lookYawFor(deskRotationY: number): number {
  // Camera sits towards world (+X, +Z). Express that direction in desk space.
  const a = Math.PI / 4 - deskRotationY;
  const dx = Math.sin(a);
  const dz = Math.cos(a);
  // Avatar forward is -Z; yaw θ turns it to (-sin θ, -cos θ).
  const yaw = Math.atan2(-dx, -dz);
  return THREE.MathUtils.clamp(yaw, -MAX_LOOK_YAW, MAX_LOOK_YAW);
}

/**
 * One agent as a character built from primitives. It sits at its desk, and
 * after a long idle walks to its bed for a nap, coming back when work shows
 * up. Every part is created once; states only change numbers (pose), so
 * switching state never allocates GPU resources.
 */
export class AgentAvatar {
  readonly id: string;
  readonly group = new THREE.Group();

  private readonly machine: AvatarStateMachine;
  private readonly weights = {} as StateWeights;
  private readonly pose: Pose = emptyPose();
  private readonly finalPose: Pose = emptyPose();
  private readonly loco: Locomotion;
  private readonly hasBed: boolean;
  private idleSeconds = 0;
  private readonly headPos = new THREE.Vector3();
  private readonly phase: number;
  private readonly lookYaw: number;
  private readonly desk: Desk;

  private readonly pivot = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly body: THREE.Mesh;
  private readonly head = new THREE.Group();
  private readonly handL: THREE.Mesh;
  private readonly handR: THREE.Mesh;
  private readonly footL: THREE.Mesh;
  private readonly footR: THREE.Mesh;
  private readonly eyes: THREE.Mesh[] = [];
  private readonly beacon: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly zzz: THREE.Sprite;
  private readonly label: THREE.Sprite;
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private selected = false;

  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly bodyColor: THREE.Color;
  private readonly skinColor: THREE.Color;
  private readonly geometries: THREE.BufferGeometry[] = [];

  constructor(opts: AgentAvatarOptions) {
    this.id = opts.id;
    this.desk = opts.desk;
    this.machine = new AvatarStateMachine(opts.initialState ?? 'idle');
    this.phase = hashPhase(opts.id);
    this.lookYaw = lookYawFor(opts.desk.slot.rotationY);

    this.bodyColor = new THREE.Color(opts.color);
    this.skinColor = this.bodyColor.clone().lerp(new THREE.Color(0xffffff), 0.6);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: this.bodyColor, roughness: 0.7 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: this.skinColor, roughness: 0.6 });
    this.eyeMat = new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.4 });
    this.beaconMat = new THREE.MeshBasicMaterial({ color: PALETTE.ledError, transparent: true });

    this.group.name = `avatar:${opts.id}`;
    this.group.userData.agentId = opts.id;
    // Lives in office space (next to the desks), so it can walk around.
    (opts.desk.group.parent ?? opts.desk.group).add(this.group);
    this.hasBed = Boolean(opts.bed);
    this.loco = new Locomotion(
      deskPlaces(opts.desk.slot, opts.desk.seatPosition),
      opts.bed ? bedPlaces(opts.bed.slot) : null,
      opts.walkVia ?? [],
    );

    // Body
    const bodyGeo = this.track(new THREE.CapsuleGeometry(0.2, 0.26, 6, 16));
    this.body = this.mesh(bodyGeo, this.bodyMat);
    this.body.position.y = 0.33;
    this.torso.add(this.body);

    // Head with eyes, facing -Z
    const headGeo = this.track(new THREE.SphereGeometry(0.2, 20, 16));
    const eyeGeo = this.track(new THREE.SphereGeometry(0.028, 10, 8));
    this.head.position.y = HEAD_Y;
    this.head.add(this.mesh(headGeo, this.skinMat));
    for (const x of [-0.075, 0.075]) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(x, 0.03, -0.185);
      this.head.add(eye);
      this.eyes.push(eye);
    }
    this.torso.add(this.head);

    // Hands float Rayman-style, so they can reach the keyboard or the sky.
    const handGeo = this.track(new THREE.SphereGeometry(0.065, 12, 10));
    this.handL = this.mesh(handGeo, this.skinMat);
    this.handR = this.mesh(handGeo, this.skinMat);

    // Little feet, only visible while standing or walking.
    const footGeo = this.track(new THREE.SphereGeometry(0.075, 12, 8));
    this.footL = this.mesh(footGeo, this.bodyMat);
    this.footR = this.mesh(footGeo, this.bodyMat);

    // Alarm beacon above the head
    const beaconGeo = this.track(new THREE.CylinderGeometry(0.06, 0.08, 0.1, 12));
    this.beacon = new THREE.Mesh(beaconGeo, this.beaconMat);
    this.beacon.position.y = 0.3;
    this.halo = createGlowSprite(PALETTE.ledError, 0.7);
    this.halo.position.y = 0.3;
    this.head.add(this.beacon, this.halo);

    // Sleeping icon; follows the head but always floats upwards.
    this.zzz = createTextSprite('z z z', { worldHeight: 0.2, color: '#6b7a99', italic: true });
    this.group.add(this.zzz);

    this.pivot.add(this.torso, this.handL, this.handR, this.footL, this.footR);
    this.group.add(this.pivot);

    // Name label stays put while the body moves.
    this.label = createTextSprite(opts.displayName, {
      worldHeight: 0.2,
      color: '#1f2a44',
      background: 'rgba(255,255,255,0.88)',
    });
    this.label.position.y = LABEL_Y_UPRIGHT;
    this.label.renderOrder = 10;
    this.label.material.depthTest = false;
    this.group.add(this.label);

    // Selection ring on the floor around the chair; hidden until selected.
    this.ringMat = new THREE.MeshBasicMaterial({ color: PALETTE.chairSeat, transparent: true, depthWrite: false });
    this.ring = new THREE.Mesh(this.track(new THREE.RingGeometry(0.46, 0.56, 40)), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.group.add(this.ring);

    this.update(0, 0);
  }

  get state(): AgentState {
    return this.machine.state;
  }

  setState(state: AgentState): void {
    this.machine.set(state);
  }

  /** Lying in bed (or most of the way there). */
  get sleeping(): boolean {
    return this.loco.posture.lie > 0.5;
  }

  /** Skip the idle wait and head to bed now (dev shortcut). */
  napNow(): void {
    this.idleSeconds = SLEEP_AFTER_IDLE_SECONDS;
  }

  setSelected(selected: boolean): void {
    this.selected = selected;
    this.ring.visible = selected;
  }

  update(dtSeconds: number, timeSeconds: number): void {
    this.machine.update(dtSeconds);

    // Nap after a long idle; stay in bed through idle or offline; wake up for anything else.
    const state = this.machine.state;
    this.idleSeconds = state === 'idle' ? this.idleSeconds + Math.max(0, dtSeconds) : 0;
    const resting = state === 'idle' || state === 'offline';
    const wantBed =
      this.hasBed &&
      ((state === 'idle' && this.idleSeconds >= SLEEP_AFTER_IDLE_SECONDS) || (resting && this.loco.heading === 'bed'));
    this.loco.goTo(wantBed ? 'bed' : 'desk');
    this.loco.update(dtSeconds);
    this.group.position.set(this.loco.x, this.loco.y, this.loco.z);
    this.group.rotation.y = this.loco.yaw;

    const statePose = blendPose(this.machine.weights(this.weights), timeSeconds, this.phase, this.lookYaw, this.pose);
    const p = applyPosture(statePose, this.loco.posture, this.loco.stepPhase, timeSeconds, this.phase, this.finalPose);
    const lie = this.loco.posture.lie;

    this.pivot.position.set(p.shakeX, p.rootY, 0);
    this.pivot.rotation.y = p.yaw;
    this.torso.rotation.x = -p.lean;
    this.body.scale.y = p.breathe;
    this.head.rotation.set(-p.headPitch, p.headYaw, 0, 'YXZ');
    this.handL.position.set(p.handLX, p.handLY, p.handLZ);
    this.handR.position.set(p.handRX, p.handRY, p.handRZ);
    this.footL.visible = this.footR.visible = p.feet > 0.05;
    this.footL.position.set(-0.09, 0.03 + p.footLLift - p.rootY, p.footLZ);
    this.footR.position.set(0.09, 0.03 + p.footRLift - p.rootY, p.footRZ);
    this.footL.scale.set(p.feet, 0.6 * p.feet, 1.4 * p.feet);
    this.footR.scale.copy(this.footL.scale);
    for (const eye of this.eyes) eye.scale.y = Math.max(0.1, p.eyes);

    // Where the head is, in this group's space, for things that float above it.
    this.group.updateMatrixWorld(true);
    this.group.worldToLocal(this.head.getWorldPosition(this.headPos));

    this.bodyMat.color.copy(this.bodyColor).multiplyScalar(p.dim);
    this.skinMat.color.copy(this.skinColor).multiplyScalar(p.dim);

    const pulse = 0.6 + 0.4 * Math.sin(timeSeconds * 9);
    this.beacon.visible = p.alarm > 0.01;
    this.beaconMat.opacity = p.alarm;
    this.halo.visible = this.beacon.visible;
    this.halo.material.opacity = p.alarm * pulse;

    // "zzz" drifts up and fades, on a loop.
    const drift = (timeSeconds * 0.45 + this.phase) % 1;
    this.zzz.visible = p.zzz > 0.01;
    this.zzz.position.set(this.headPos.x + 0.22 + drift * 0.08, this.headPos.y + 0.28 + drift * 0.22, this.headPos.z);
    this.zzz.material.opacity = p.zzz * Math.min(1, (1 - drift) * 2.5);

    this.label.material.opacity = 0.55 + 0.45 * ((p.dim - 0.45) / 0.55);
    this.label.position.set(
      this.headPos.x * lie,
      LABEL_Y_UPRIGHT * (1 - lie) + (this.headPos.y + LABEL_Y_LYING) * lie,
      this.headPos.z * lie,
    );

    // The ring lies on the floor, or on the mattress while in bed.
    this.ring.position.y = 0.02 + 0.45 * lie - this.loco.y;
    if (this.selected) this.ringMat.opacity = 0.65 + 0.3 * Math.sin(timeSeconds * 3);

    const screen = this.desk.screen;
    screen.emissive
      .copy(SCREEN_GLOW)
      .lerp(SCREEN_CHEER, p.cheer)
      .lerp(SCREEN_ALERT, p.alarm)
      .multiplyScalar(p.screen);
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of [this.bodyMat, this.skinMat, this.eyeMat, this.beaconMat, this.ringMat]) m.dispose();
    for (const s of [this.halo, this.zzz, this.label]) disposeSprite(s);
    this.desk.screen.emissive.setRGB(0, 0, 0);
  }

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    return m;
  }
}

/** Stable per-agent animation offset so avatars do not move in sync. */
function hashPhase(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 100;
}
