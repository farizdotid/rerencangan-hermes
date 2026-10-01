import { AGENT_STATES, type AgentState } from '../data/types';
import type { Posture } from './locomotion';
import type { StateWeights } from './stateMachine';

/**
 * Everything that animates on an avatar, as plain numbers so poses of
 * different states can be blended linearly. Positions are relative to the
 * seat, in the desk's local space (avatar faces -Z, towards the monitor).
 */
export interface Pose {
  /** Vertical offset of the whole body (jumping). */
  rootY: number;
  /** Sideways offset of the whole body (shaking). */
  shakeX: number;
  /** Body turn around Y. */
  yaw: number;
  /** Torso lean; positive leans forward towards the desk. */
  lean: number;
  /** Torso vertical scale (breathing). */
  breathe: number;
  /** Head tilt; positive looks down. */
  headPitch: number;
  /** Head turn around Y; negative turns right. */
  headYaw: number;
  handLX: number;
  handLY: number;
  handLZ: number;
  handRX: number;
  handRY: number;
  handRZ: number;
  /** Feet visibility (0..1); feet only show while standing or walking. */
  feet: number;
  footLZ: number;
  footRZ: number;
  footLLift: number;
  footRLift: number;
  /** Eye openness, 1 = open, near 0 = asleep. */
  eyes: number;
  /** Material brightness, 1 = normal. */
  dim: number;
  /** Visibility of the red alarm light (0..1). */
  alarm: number;
  /** Visibility of the "zzz" icon (0..1). */
  zzz: number;
  /** Monitor glow (0..1). */
  screen: number;
  /** Green "success" tint on the monitor (0..1). */
  cheer: number;
}

export const POSE_KEYS = [
  'rootY', 'shakeX', 'yaw', 'lean', 'breathe', 'headPitch', 'headYaw',
  'handLX', 'handLY', 'handLZ', 'handRX', 'handRY', 'handRZ',
  'feet', 'footLZ', 'footRZ', 'footLLift', 'footRLift', 'eyes',
  'dim', 'alarm', 'zzz', 'screen', 'cheer',
] as const satisfies readonly (keyof Pose)[];

export function emptyPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  return p;
}

const BASE: Pose = {
  rootY: 0, shakeX: 0, yaw: 0, lean: 0, breathe: 1, headPitch: 0, headYaw: 0,
  handLX: -0.27, handLY: 0.22, handLZ: -0.02,
  handRX: 0.27, handRY: 0.22, handRZ: -0.02,
  feet: 0, footLZ: 0, footRZ: 0, footLLift: 0, footRLift: 0, eyes: 1,
  dim: 1, alarm: 0, zzz: 0, screen: 0, cheer: 0,
};

/**
 * Pose for one state at time `t` (seconds).
 * `phase` desynchronizes avatars; `lookYaw` is the head turn that faces the camera.
 */
export function poseFor(state: AgentState, t: number, phase: number, lookYaw: number): Pose {
  const p: Pose = { ...BASE };
  const tp = t + phase;
  switch (state) {
    case 'idle': {
      p.breathe = 1 + 0.02 * Math.sin(tp * 1.6);
      p.lean = -0.08;
      p.headYaw = 0.5 * Math.sin(tp * 0.35);
      p.headPitch = -0.05 + 0.04 * Math.sin(tp * 0.5);
      p.handLY = p.handRY = 0.22 + 0.01 * Math.sin(tp * 1.6);
      p.screen = 0.15;
      break;
    }
    case 'working': {
      p.breathe = 1 + 0.012 * Math.sin(tp * 2);
      p.lean = 0.18;
      p.headPitch = 0.12;
      p.headYaw = 0.06 * Math.sin(tp * 0.7);
      // Hands rest on the keyboard and tap alternately.
      p.handLX = -0.12;
      p.handRX = 0.12;
      p.handLZ = p.handRZ = -0.6;
      p.handLY = 0.33 + 0.04 * Math.max(0, Math.sin(tp * 17));
      p.handRY = 0.33 + 0.04 * Math.max(0, Math.sin(tp * 17 + Math.PI));
      p.screen = 1;
      break;
    }
    case 'error': {
      p.shakeX = 0.035 * Math.sin(tp * 42);
      p.lean = -0.05;
      p.headYaw = lookYaw;
      p.headPitch = -0.1;
      // Hands on the head.
      p.handLX = -0.25;
      p.handRX = 0.25;
      p.handLY = p.handRY = 0.84;
      p.handLZ = p.handRZ = -0.02;
      p.alarm = 1;
      p.screen = 1;
      break;
    }
    case 'celebrating': {
      p.rootY = 0.4 * Math.abs(Math.sin(tp * Math.PI * 1.4));
      p.yaw = 0.25 * Math.sin(tp * 4.4);
      p.lean = -0.1;
      p.headPitch = -0.25;
      p.headYaw = lookYaw * 0.5;
      // Arms up, waving.
      p.handLX = -0.4 + 0.07 * Math.sin(tp * 11);
      p.handRX = 0.4 - 0.07 * Math.sin(tp * 11);
      p.handLY = p.handRY = 1.1;
      p.handLZ = p.handRZ = -0.05;
      p.screen = 0.9;
      p.cheer = 1;
      break;
    }
    case 'offline': {
      p.breathe = 1 + 0.03 * Math.sin(tp * 0.8);
      p.lean = 0.25;
      p.headPitch = 0.45;
      p.handLX = -0.13;
      p.handRX = 0.13;
      p.handLY = p.handRY = 0.2;
      p.handLZ = p.handRZ = -0.2;
      p.dim = 0.45;
      p.zzz = 1;
      p.eyes = 0.2;
      p.screen = 0;
      break;
    }
  }
  return p;
}

/** Weighted blend of the poses of all states with non-zero weight. */
export function blendPose(
  weights: Readonly<StateWeights>,
  t: number,
  phase: number,
  lookYaw: number,
  out: Pose = emptyPose(),
): Pose {
  for (const k of POSE_KEYS) out[k] = 0;
  for (const state of AGENT_STATES) {
    const w = weights[state];
    if (w <= 0) continue;
    const p = poseFor(state, t, phase, lookYaw);
    for (const k of POSE_KEYS) out[k] += p[k] * w;
  }
  return out;
}

/** Keys that describe status (lights, icons, screen) rather than the body. */
const OVERLAY_KEYS = new Set<keyof Pose>(['dim', 'alarm', 'zzz', 'screen', 'cheer']);
const BODY_KEYS = POSE_KEYS.filter((k) => !OVERLAY_KEYS.has(k));

/** Standing and walking; `stepPhase` in radians drives arm and foot swing. */
export function walkPose(stepPhase: number): Pose {
  const p: Pose = { ...BASE };
  const s = Math.sin(stepPhase);
  const c = Math.cos(stepPhase);
  p.rootY = 0.025 * Math.abs(s);
  p.lean = 0.06;
  p.headPitch = 0.02;
  p.handLX = -0.26;
  p.handRX = 0.26;
  p.handLY = p.handRY = 0.3;
  p.handLZ = -0.02 - 0.1 * s;
  p.handRZ = -0.02 + 0.1 * s;
  p.feet = 1;
  p.footLZ = 0.1 * s;
  p.footRZ = -0.1 * s;
  p.footLLift = 0.035 * Math.max(0, c);
  p.footRLift = 0.035 * Math.max(0, -c);
  return p;
}

/** Asleep on the back in bed, hands on the belly. */
export function liePose(t: number, phase: number): Pose {
  const p: Pose = { ...BASE };
  const tp = t + phase;
  // Leaning all the way back: the body lies along +Z behind the pivot, face up.
  p.lean = -Math.PI / 2;
  p.breathe = 1 + 0.035 * Math.sin(tp * 0.9);
  p.headYaw = 0.2 * Math.sin(tp * 0.13);
  p.handLX = -0.13;
  p.handRX = 0.13;
  p.handLY = p.handRY = 0.25;
  p.handLZ = 0.28;
  p.handRZ = 0.36;
  p.eyes = 0.12;
  return p;
}

/**
 * Mixes the seated state pose with walking and lying by posture weights.
 * Status overlays come from the state pose; the monitor only glows while the
 * agent sits at it, and lying down always shows "zzz".
 */
export function applyPosture(
  statePose: Pose,
  posture: Posture,
  stepPhase: number,
  t: number,
  phase: number,
  out: Pose = emptyPose(),
): Pose {
  const walk = posture.walk > 0 ? walkPose(stepPhase) : null;
  const lie = posture.lie > 0 ? liePose(t, phase) : null;
  for (const k of BODY_KEYS) {
    out[k] = statePose[k] * posture.seated + (walk ? walk[k] * posture.walk : 0) + (lie ? lie[k] * posture.lie : 0);
  }
  out.dim = statePose.dim;
  out.alarm = statePose.alarm;
  out.cheer = statePose.cheer;
  out.screen = statePose.screen * posture.seated;
  out.zzz = Math.max(statePose.zzz, posture.lie);
  return out;
}
