// Sackboy as a plain R3F group, like DollModel: feet on y = 0, about 2 units tall,
// facing +z. The model (src/assets/models/sackboy.glb, CC BY 4.0, see the README
// credits) is six rigid pieces (head, torso, two arms, two legs) with no skeleton,
// so one is built once it loads: each piece follows its own bone, the arms bend at
// elbow and wrist, the legs at knee and ankle. It is driven by the knitted doll's
// poses ('dance', 'cockpit', 'control', ...). Two-bone IK keeps the feet planted
// (so knee bounces bend the knees) and, in the rocket, both mitts on the joystick.
import { use, useEffect, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import sackboyUrl from '../assets/models/sackboy.glb?url';
import { blobCanvas, makeDollPoseValues, makePoseMixer, stepPoseMixer, type StageFigureProps } from './StitchDoll';

/* =========================================================
   Proportions, measured on the model (8.06 units tall). Joints
   are in its units: x sideways, h up, d towards the front.
   ========================================================= */
const MODEL_H = 8.06;
const S = 2 / MODEL_H; // scene units per model unit
const PELVIS_H = 1.75; // torso pivot
const HIP_X = 0.8; // thigh pivots
const HIP_H = 1.7;
const KNEE_H = 0.85;
const ANKLE_H = 0.32;
const SHOULDER = { x: 0.8, h: 3.72, d: -0.15 }; // where each arm piece is tucked into the torso
/** The right arm's direction in the model, shoulder to mitt (slightly down and forward). */
const ARM_DIR = new THREE.Vector3(2.45, -0.67, 0.55).normalize();
const ELBOW_U = 1.25; // distances along the arm
const HAND_U = 2.2;
const GRIP_U = 2.6; // middle of the mitt
const NECK_H = 4.22;
/** The doll's knee bounce is deep for these short legs. */
const BOB_SCALE = 0.75;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const x = clamp(v, 0, 1);
  return x * x * (3 - 2 * x);
};

const BONES = [
  'rig', 'hips', 'torso',
  'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR',
  'neck', 'eyeL', 'eyeR',
] as const;
type BoneName = (typeof BONES)[number];
const B = Object.fromEntries(BONES.map((n, i) => [n, i])) as Record<BoneName, number>;

/* =========================================================
   Loading: one shared copy of the geometry (with skin weights)
   and materials; every SackboyModel gets its own skeleton.
   ========================================================= */
export interface SackboySource {
  body: THREE.BufferGeometry;
  zipper: THREE.BufferGeometry;
  eyes: THREE.BufferGeometry;
  mats: { body: THREE.Material; zipper: THREE.Material; eyes: THREE.Material };
  /** Eye centres in scene units (blinks scale around them). */
  eyeL: THREE.Vector3;
  eyeR: THREE.Vector3;
}

/** Writes up to four (bone, weight) pairs per vertex, normalised. */
function setSkin(geo: THREE.BufferGeometry, weigh: (i: number, x: number, h: number, d: number, out: number[]) => void) {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const index = new Uint16Array(n * 4);
  const weight = new Float32Array(n * 4);
  const w = new Array<number>(BONES.length);
  for (let i = 0; i < n; i++) {
    w.fill(0);
    weigh(i, pos.getX(i) / S, pos.getY(i) / S, pos.getZ(i) / S, w);
    const top = w
      .map((v, b) => [v, b] as const)
      .filter(([v]) => v > 1e-4)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 4);
    const sum = top.reduce((a, [v]) => a + v, 0) || 1;
    top.forEach(([v, b], k) => {
      index[i * 4 + k] = b;
      weight[i * 4 + k] = v / sum;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
}

type Piece = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';

/** Which rigid piece each vertex belongs to (connected parts of the mesh, sorted by where they sit). */
function piecesOf(geo: THREE.BufferGeometry): Piece[] {
  const pos = geo.getAttribute('position');
  const n = pos.count;
  // Weld UV seams by position, then join the vertices of every triangle.
  const weld = new Map<string, number>();
  const id = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos.getX(i) / S * 500)},${Math.round(pos.getY(i) / S * 500)},${Math.round(pos.getZ(i) / S * 500)}`;
    let k = weld.get(key);
    if (k === undefined) {
      k = weld.size;
      weld.set(key, k);
    }
    id[i] = k;
  }
  const parent = Array.from({ length: weld.size }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const index = geo.getIndex();
  const tri = index ? index.count : n;
  for (let t = 0; t < tri; t += 3) {
    const v = (k: number) => id[index ? index.getX(t + k) : t + k];
    const a = find(v(0));
    parent[find(v(1))] = a;
    parent[find(v(2))] = a;
  }
  const boxes = new Map<number, THREE.Box3>();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const root = find(id[i]);
    let box = boxes.get(root);
    if (!box) boxes.set(root, (box = new THREE.Box3()));
    box.expandByPoint(p.fromBufferAttribute(pos, i).divideScalar(S));
  }
  const kind = new Map<number, Piece>();
  const c = new THREE.Vector3();
  for (const [root, box] of boxes) {
    box.getCenter(c);
    kind.set(
      root,
      c.y > 5 ? 'head' : box.max.y < 2.1 ? (c.x < 0 ? 'legL' : 'legR') : Math.abs(c.x) > 1.4 ? (c.x < 0 ? 'armL' : 'armR') : 'torso',
    );
  }
  return Array.from(id, (k) => kind.get(find(k)) ?? 'torso');
}

function weighBody(pieces: Piece[]) {
  return (i: number, x: number, h: number, d: number, w: number[]) => {
    const piece = pieces[i];
    if (piece === 'head') {
      w[B.neck] = 1;
    } else if (piece === 'torso') {
      w[B.torso] = 1;
    } else if (piece === 'armL' || piece === 'armR') {
      const L = piece === 'armL';
      const u = (Math.abs(x) - SHOULDER.x) * ARM_DIR.x + (h - SHOULDER.h) * ARM_DIR.y + (d - SHOULDER.d) * ARM_DIR.z;
      const fore = smooth((u - (ELBOW_U - 0.2)) / 0.4);
      const hand = smooth((u - (HAND_U - 0.1)) / 0.2);
      w[L ? B.shoulderL : B.shoulderR] = 1 - fore;
      w[L ? B.elbowL : B.elbowR] = fore * (1 - hand);
      w[L ? B.handL : B.handR] = fore * hand;
    } else {
      const L = piece === 'legL';
      const shin = 1 - smooth((h - 0.75) / 0.3);
      const foot = 1 - smooth((h - ANKLE_H + 0.04) / 0.18);
      w[L ? B.thighL : B.thighR] = 1 - shin;
      w[L ? B.kneeL : B.kneeR] = shin * (1 - foot);
      w[L ? B.footL : B.footR] = shin * foot;
    }
  };
}

function eyeCentre(geo: THREE.BufferGeometry, left: boolean) {
  const pos = geo.getAttribute('position');
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.x < 0 === left) box.expandByPoint(v);
  }
  return box.getCenter(new THREE.Vector3());
}

function buildSource(gltf: GLTF): SackboySource {
  gltf.scene.updateMatrixWorld(true);
  const fit = new THREE.Matrix4().makeScale(S, S, S);
  const found: Record<string, { geo: THREE.BufferGeometry; map: THREE.Texture | null }> = {};
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    // Sketchfab's root node turns the Z-up model Y-up; bake that and the scale in.
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(fit);
    if (mat.map) mat.map.anisotropy = 4;
    found[mat.name] = { geo, map: mat.map };
  });
  const body = found.Body;
  const eyes = found.Eyes;
  const zipper = found.material;
  if (!body || !eyes || !zipper) throw new Error('Unexpected Sackboy model');

  setSkin(body.geo, weighBody(piecesOf(body.geo)));
  setSkin(zipper.geo, (_i, _x, _h, _d, w) => {
    w[B.torso] = 1;
  });
  setSkin(eyes.geo, (_i, x, _h, _d, w) => {
    w[x < 0 ? B.eyeL : B.eyeR] = 1;
  });

  return {
    body: body.geo,
    zipper: zipper.geo,
    eyes: eyes.geo,
    mats: {
      // Burlap: the knit photo doubles as a bump map, with a soft fabric sheen.
      body: new THREE.MeshPhysicalMaterial({
        map: body.map,
        bumpMap: body.map,
        bumpScale: 1.6,
        roughness: 0.95,
        metalness: 0,
        sheen: 0.6,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color('#e8c7a4'),
      }),
      zipper: new THREE.MeshStandardMaterial({ map: zipper.map, roughness: 0.45, metalness: 0.35 }),
      eyes: new THREE.MeshPhysicalMaterial({ map: eyes.map, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    },
    eyeL: eyeCentre(eyes.geo, true),
    eyeR: eyeCentre(eyes.geo, false),
  };
}

let loading: Promise<SackboySource> | null = null;

/** Loads and prepares the model once (shared by every SackboyModel). */
export function loadSackboy(): Promise<SackboySource> {
  if (!loading) loading = new GLTFLoader().loadAsync(sackboyUrl).then(buildSource);
  return loading;
}

/** Starts loading the model now, so SackboyModel need not suspend later. */
export function preloadSackboy() {
  loadSackboy().catch(() => undefined);
}

/* =========================================================
   One rigged copy: bones, skeleton and skinned meshes
   ========================================================= */
type Rig = ReturnType<typeof buildRig>;

/** Bind rotation of an arm: local -y along the arm, local +z (the thumb side) towards the front. */
function armBind(side: 1 | -1) {
  const y = new THREE.Vector3(-side * ARM_DIR.x, -ARM_DIR.y, -ARM_DIR.z);
  const z = new THREE.Vector3(0, 0, 1).addScaledVector(y, -y.z).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function buildRig(src: SackboySource) {
  const bones = {} as Record<BoneName, THREE.Bone>;
  const bone = (name: BoneName, parent: THREE.Object3D | null, x: number, y: number, z: number) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent?.add(b);
    bones[name] = b;
    return b;
  };
  const rig = bone('rig', null, 0, 0, 0);
  const hips = bone('hips', rig, 0, PELVIS_H * S, 0);
  bone('torso', hips, 0, 0, 0);
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const thigh = bone(L ? 'thighL' : 'thighR', hips, side * HIP_X * S, (HIP_H - PELVIS_H) * S, 0);
    const knee = bone(L ? 'kneeL' : 'kneeR', thigh, 0, -(HIP_H - KNEE_H) * S, 0);
    bone(L ? 'footL' : 'footR', knee, 0, -(KNEE_H - ANKLE_H) * S, 0);

    const shoulder = bone(L ? 'shoulderL' : 'shoulderR', hips, side * SHOULDER.x * S, (SHOULDER.h - PELVIS_H) * S, SHOULDER.d * S);
    shoulder.quaternion.copy(armBind(side));
    const elbow = bone(L ? 'elbowL' : 'elbowR', shoulder, 0, -ELBOW_U * S, 0);
    bone(L ? 'handL' : 'handR', elbow, 0, -(HAND_U - ELBOW_U) * S, 0);
  }
  const neck = bone('neck', hips, 0, (NECK_H - PELVIS_H) * S, 0);
  const neckAt = new THREE.Vector3(0, NECK_H * S, 0);
  bone('eyeL', neck, ...src.eyeL.clone().sub(neckAt).toArray());
  bone('eyeR', neck, ...src.eyeR.clone().sub(neckAt).toArray());

  const root = new THREE.Group();
  root.add(rig);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));
  for (const [geo, mat] of [
    [src.body, src.mats.body],
    [src.zipper, src.mats.zipper],
    [src.eyes, src.mats.eyes],
  ] as const) {
    const mesh = new THREE.SkinnedMesh(geo, mat);
    // The pose moves him well outside his bind-pose bounds; he is tiny anyway.
    mesh.frustumCulled = false;
    root.add(mesh);
    mesh.bind(skeleton, new THREE.Matrix4());
  }
  return {
    root,
    bones,
    dispose() {
      skeleton.dispose();
    },
  };
}

/** A rigged copy for compiling Sackboy's shader programs ahead of time (see craftWarmup.ts). */
export function makeSackboyWarmup(src: SackboySource) {
  const rig = buildRig(src);
  return { objects: [rig.root] as THREE.Object3D[], dispose: rig.dispose };
}

/* =========================================================
   Two-bone IK (world space), for the legs and the mitts
   ========================================================= */
const V_A = new THREE.Vector3();
const V_B = new THREE.Vector3();
const V_C = new THREE.Vector3();
const V_U = new THREE.Vector3();
const V_V = new THREE.Vector3();
const V_E = new THREE.Vector3();
const V_T = new THREE.Vector3();
const V_X = new THREE.Vector3();
const V_Y = new THREE.Vector3();
const V_Z = new THREE.Vector3();
const V_P = new THREE.Vector3();
const V_S = new THREE.Vector3();
const Q_W = new THREE.Quaternion();
const Q_P = new THREE.Quaternion();
const M_B = new THREE.Matrix4();

/** Turns `bone` so its world axes are (x, y, z), whatever its parents are doing. */
function setWorldBasis(bone: THREE.Object3D, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  Q_W.setFromRotationMatrix(M_B.makeBasis(x, y, z));
  bone.parent?.matrixWorld.decompose(V_P, Q_P, V_S);
  bone.quaternion.copy(Q_P.invert().multiply(Q_W));
  bone.updateMatrixWorld(true);
}

/**
 * Aims upper -> lower (both point down their local -y) so the point `reach` below
 * `lower` lands on `target`, bending towards `pole`. bendZ = 1 turns the upper
 * bone's local +z towards the pole (legs: knee forward); -1 away from it (arms).
 */
function solveTwoBone(upper: THREE.Bone, lower: THREE.Bone, reach: number, target: THREE.Vector3, pole: THREE.Vector3, bendZ: 1 | -1) {
  const A = upper.getWorldPosition(V_A);
  const Bp = lower.getWorldPosition(V_B);
  const C = lower.localToWorld(V_C.set(0, -reach, 0));
  const a = A.distanceTo(Bp);
  const b = Bp.distanceTo(C);
  V_U.subVectors(target, A);
  const full = V_U.length();
  if (full < 1e-6 || a < 1e-6 || b < 1e-6) return;
  V_U.divideScalar(full);
  const d = clamp(full, Math.abs(a - b) + 1e-5, a + b - 1e-5);
  V_V.copy(pole).addScaledVector(V_U, -pole.dot(V_U));
  if (V_V.lengthSq() < 1e-10) return;
  V_V.normalize();
  const cos = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  V_E.copy(A).addScaledVector(V_U, a * cos).addScaledVector(V_V, a * Math.sqrt(1 - cos * cos));
  V_T.copy(A).addScaledVector(V_U, d);

  V_Y.subVectors(A, V_E).normalize(); // upper's local +y points back up the bone
  V_Z.copy(V_V).multiplyScalar(bendZ).addScaledVector(V_Y, -bendZ * V_V.dot(V_Y)).normalize();
  V_X.crossVectors(V_Y, V_Z);
  setWorldBasis(upper, V_X, V_Y, V_Z);
  V_Y.subVectors(V_E, V_T).normalize(); // same hinge axis for the lower bone
  V_Z.crossVectors(V_X, V_Y);
  setWorldBasis(lower, V_X, V_Y, V_Z);
}

/* =========================================================
   The animated figure
   ========================================================= */
const OUT = makeDollPoseValues();
const SHOULDER_Y = (SHOULDER.h - PELVIS_H) * S;
const NECK_Y = (NECK_H - PELVIS_H) * S;
const Q_RIG = new THREE.Quaternion();
const V_UP = new THREE.Vector3();
const V_SIDE = new THREE.Vector3();
const V_POLE = new THREE.Vector3();
const V_GOAL = new THREE.Vector3();
const V_KNOB = new THREE.Vector3();

function applyPose(rig: Rig, lid: number) {
  const P = rig.bones;
  P.rig.position.set(OUT.x, OUT.hop, 0);
  P.rig.rotation.y = OUT.spin;
  P.hips.position.y = PELVIS_H * S + OUT.bob * BOB_SCALE;
  P.hips.rotation.set(OUT.lean, OUT.twist, OUT.hipZ);
  const sy = 1 - OUT.squash;
  const sx = 1 + OUT.squash * 0.6;
  P.torso.scale.set(sx, sy, sx);
  P.shoulderL.position.set(-SHOULDER.x * S * sx, SHOULDER_Y * sy, SHOULDER.d * S);
  P.shoulderL.rotation.set(-OUT.lFwd, 0, -OUT.lOut);
  P.shoulderR.position.set(SHOULDER.x * S * sx, SHOULDER_Y * sy, SHOULDER.d * S);
  P.shoulderR.rotation.set(-OUT.rFwd, 0, OUT.rOut);
  P.elbowL.rotation.set(-OUT.lBend, 0, -OUT.lLift);
  P.elbowR.rotation.set(-OUT.rBend, 0, OUT.rLift);
  P.handL.rotation.set(0, 0, (-OUT.lWrist * Math.PI) / 2);
  P.handR.rotation.set(0, 0, (OUT.rWrist * Math.PI) / 2);
  // No separate thumb: a slightly bigger mitt still reads as the thumbs-up.
  P.handL.scale.setScalar(1 + 0.2 * OUT.lThumb);
  P.handR.scale.setScalar(1 + 0.2 * OUT.rThumb);
  P.neck.position.y = NECK_Y * sy;
  P.neck.rotation.set(OUT.headX, OUT.headY, OUT.headZ);
  P.eyeL.scale.y = lid;
  P.eyeR.scale.y = lid;
  P.rig.updateWorldMatrix(true, true);
}

/** Feet stay planted (knees bend when the hips drop); a foot lift raises the ankle. */
function plantFeet(rig: Rig) {
  const P = rig.bones;
  const rigM = P.rig.matrixWorld;
  rigM.decompose(V_P, Q_RIG, V_S);
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const lift = L ? OUT.lFoot : OUT.rFoot;
    V_GOAL.set(side * HIP_X * S, ANKLE_H * S + lift, 0.4 * lift).applyMatrix4(rigM);
    V_POLE.set(side * 0.15, 0, 1).transformDirection(rigM);
    solveTwoBone(L ? P.thighL : P.thighR, L ? P.kneeL : P.kneeR, (KNEE_H - ANKLE_H) * S, V_GOAL, V_POLE, 1);
    // Feet stay level with the ground.
    const foot = L ? P.footL : P.footR;
    foot.parent?.matrixWorld.decompose(V_P, Q_P, V_S);
    foot.quaternion.copy(Q_P.invert().multiply(Q_RIG));
    foot.updateMatrixWorld(true);
  }
}

const FK = [new THREE.Quaternion(), new THREE.Quaternion(), new THREE.Quaternion()];

/**
 * Both mitts on the knob, one each side of it, thumbs up. A hand the pose sets
 * free (lFree / rFree) blends back to its posed arm, e.g. to wave.
 */
function gripStick(rig: Rig, knob: THREE.Object3D, halfWidth: number) {
  const P = rig.bones;
  const rigM = P.rig.matrixWorld;
  rigM.decompose(V_P, Q_RIG, V_S);
  knob.updateWorldMatrix(true, false);
  knob.getWorldPosition(V_KNOB);
  V_SIDE.set(1, 0, 0).transformDirection(rigM);
  V_UP.set(0, 1, 0).transformDirection(rigM);
  for (const side of [-1, 1] as const) {
    const L = side < 0;
    const free = clamp(L ? OUT.lFree : OUT.rFree, 0, 1);
    if (free >= 0.999) continue;
    const shoulder = L ? P.shoulderL : P.shoulderR;
    const elbow = L ? P.elbowL : P.elbowR;
    const hand = L ? P.handL : P.handR;
    const chain = [shoulder, elbow, hand];
    chain.forEach((b, i) => FK[i].copy(b.quaternion));

    V_GOAL.copy(V_KNOB).addScaledVector(V_SIDE, side * halfWidth * V_S.x);
    V_POLE.set(side * 0.9, -1, -0.6).transformDirection(rigM);
    solveTwoBone(shoulder, elbow, (GRIP_U - ELBOW_U) * S, V_GOAL, V_POLE, -1);
    // Wrist roll: the thumb side of the mitt points up.
    V_Y.setFromMatrixColumn(elbow.matrixWorld, 1).normalize();
    V_Z.copy(V_UP).addScaledVector(V_Y, -V_UP.dot(V_Y)).normalize();
    V_X.crossVectors(V_Y, V_Z);
    setWorldBasis(hand, V_X, V_Y, V_Z);

    if (free > 0.001) {
      chain.forEach((b, i) => b.quaternion.slerp(FK[i], free));
      shoulder.updateMatrixWorld(true);
    } else {
      hand.scale.setScalar(1);
    }
  }
}

export interface SackboyModelProps extends StageFigureProps {
  /** Something to hold with both mitts (the rocket's joystick knob). */
  grip?: RefObject<THREE.Object3D | null>;
  /** Distance from the knob's centre to each mitt's centre, in this figure's units. */
  gripHalfWidth?: number;
}

/** Sackboy doing the doll's poses. Suspends while the model loads. */
export function SackboyModel({ pose, reduced = false, shadow = true, shadowY = 0.003, grip, gripHalfWidth = 0.13 }: SackboyModelProps) {
  const src = use(loadSackboy());
  const rig = useMemo(() => buildRig(src), [src]);
  useEffect(() => () => rig.dispose(), [rig]);

  const blob = useMemo(() => {
    const map = new THREE.CanvasTexture(blobCanvas());
    const material = new THREE.MeshBasicMaterial({ color: '#2a1838', transparent: true, opacity: 0.42, alphaMap: map, depthWrite: false });
    return { map, material };
  }, []);
  useEffect(
    () => () => {
      blob.map.dispose();
      blob.material.dispose();
    },
    [blob],
  );
  const shadowRef = useRef<THREE.Mesh>(null);

  const settings = useRef({ pose, reduced, gripHalfWidth });
  useEffect(() => {
    settings.current = { pose, reduced, gripHalfWidth };
  }, [pose, reduced, gripHalfWidth]);
  const sim = useRef({ mix: makePoseMixer(pose), blinkAt: 2.2 });

  useFrame((_, delta) => {
    const s = sim.current;
    const { pose: target, reduced: still, gripHalfWidth: half } = settings.current;
    const dt = clamp(delta, 0, 1 / 20);
    stepPoseMixer(s.mix, target, dt, OUT);
    const t = s.mix.t;

    // Blink now and then (not under reduced motion).
    let lid = 1;
    if (!still) {
      if (t > s.blinkAt + 0.16) s.blinkAt = t + 2.6 + Math.random() * 2.4;
      const k = (t - s.blinkAt) / 0.16;
      if (k > 0 && k < 1) lid = 1 - 0.88 * Math.sin(Math.PI * k);
    }
    applyPose(rig, lid);
    plantFeet(rig);
    const knob = grip?.current;
    if (knob) gripStick(rig, knob, half);

    const sh = shadowRef.current;
    if (sh) {
      const air = clamp(OUT.hop / 0.4, 0, 1);
      sh.position.x = OUT.x;
      sh.scale.setScalar(1 - 0.45 * air);
      blob.material.opacity = 0.42 * (1 - 0.5 * air);
    }
  });

  return (
    <group>
      {shadow ? (
        <mesh ref={shadowRef} material={blob.material} position={[0, shadowY, 0.02]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <circleGeometry args={[0.62, 40]} />
        </mesh>
      ) : null}
      <primitive object={rig.root} />
    </group>
  );
}
