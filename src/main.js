import * as THREE from 'three';
import './style.css';
import { DIFFICULTIES, ITEM_TYPES, TARGET_FISH, generateTypeTriples, insertTray, resolveMatches, seededRandom } from './game-logic.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  canvas: $('#game-canvas'), home: $('#home-screen'), hud: $('#game-hud'), difficulty: $('#difficulty-grid'),
  tray: $('#tray'), shake: $('#shake-btn'), shakeCount: $('#shake-count'), timer: $('#timer'), toast: $('#toast'),
  patrol: $('#patrol-alert'), patrolStatus: $('#patrol-status'), tutorial: $('#tutorial'), tutorialText: $('#tutorial-text'),
  tutorialStep: $('#tutorial-step'), tutorialHint: $('#tutorial-hint'), tutorialSkip: $('#tutorial-skip'), coachArrow: $('#coach-arrow'),
  reaction: $('#cat-reaction'), reactionImage: $('.reaction-image'), reactionTitle: $('#reaction-title'), reactionCopy: $('#reaction-copy'), modal: $('#modal'),
  modalCat: $('#modal-cat'), modalKicker: $('#modal-kicker'), modalTitle: $('#modal-title'), modalCopy: $('#modal-copy'),
  modalReward: $('#modal-reward'), primary: $('#primary-action'), revive: $('#revive-action'), secondary: $('#secondary-action'),
  homeBtn: $('#home-btn'), bookBtn: $('#book-btn'), soundBtn: $('#sound-btn'), collection: $('#collection'),
  closeBook: $('#close-book'), fishGrid: $('#fish-grid'), itemGrid: $('#item-grid'), fishBones: $('#fish-bones'), collectionCount: $('#collection-count'),
  skinGrid: $('#skin-grid'), pause: $('#pause-cover'), confetti: $('#confetti')
};

const STORAGE_KEY = 'cat-fishing-3d-v1';
const defaultSave = { fishBones: 0, wins: { easy: 0, normal: 0, hard: 0, feast: 0 }, fish: ['鲫鱼'], seenItems: [], skin: 'orange', sound: true, tutorialDone: false, tutorialVersion: 0 };
let save = loadSave();

const fishCatalog = [
  ['鲫鱼', '普通'], ['黄辣丁', '普通'], ['麦穗鱼', '普通'], ['泥鳅', '普通'],
  ['金鱼', '稀有'], ['鲈鱼', '稀有'], ['武昌鱼', '稀有'], ['黄花鱼', '稀有'],
  ['多宝鱼', '史诗'], ['石斑鱼', '史诗'], ['金龙鱼', '史诗'], ['银龙鱼', '史诗'],
  ['锦鲤', '传说'], ['臭鳜鱼', '传说'], ['红龙鱼', '传说'], ['年年有余鱼', '传说']
];

const skinCatalog = [
  { id: 'orange', name: '橘猫', icon: '😺', color: 0xe48b3f, unlock: () => true },
  { id: 'tabby', name: '狸花猫', icon: '🐱', color: 0x8a765a, unlock: () => save.fish.filter((f) => fishCatalog.find((x) => x[0] === f)?.[1] === '普通').length >= 4 },
  { id: 'blue', name: '蓝猫', icon: '😼', color: 0x768d9f, unlock: () => save.fish.filter((f) => fishCatalog.find((x) => x[0] === f)?.[1] === '稀有').length >= 3 },
  { id: 'ragdoll', name: '布偶猫', icon: '😽', color: 0xd5c5aa, unlock: () => totalWins() >= 7 },
  { id: 'drunk', name: '醉猫', icon: '🙀', color: 0xba7855, unlock: () => save.fish.filter((f) => fishCatalog.find((x) => x[0] === f)?.[1] === '史诗').length >= 3 }
];

const state = {
  mode: 'home', difficulty: DIFFICULTIES.easy, items: [], tray: [], shakeLeft: 5, busy: false,
  patrol: false, patrolHandled: false, elapsed: 0, startedAt: 0, pausedAt: 0, pauseTotal: 0,
  combo: 0, lastMatchAt: 0, revived: false, tutorialStep: 0, matches: 0, itemSeq: 0, lowPower: false,
  newPlayerProtection: false, patrolAt: 24, patrolTraining: false, activeReaction: null
};

let renderer, scene, camera, raycaster, pointer, bowlGroup, itemGroup, targetFish, waterSurface, cat, catHead, catPaw, catTail;
let catParts = {};
let catBasePosition = new THREE.Vector3(-4.15, .42, -1.5);
let lastFrame = performance.now();
let toastTimer = 0;
let patrolTimer = 0;
let reactionTimer = 0;
const tweens = [];
const effects = [];

init();

function init() {
  state.lowPower = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
  createRenderer();
  createWorld();
  createUI();
  bindEvents();
  resize();
  renderHomeScene();
  requestAnimationFrame(loop);
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas: els.canvas, antialias: !state.lowPower, alpha: true, powerPreference: state.lowPower ? 'low-power' : 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.lowPower ? 1.25 : 2));
  renderer.shadowMap.enabled = !state.lowPower;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
}

function createWorld() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(37, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 8.5, 12.5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff7df, 0x769b91, 2.25));
  const key = new THREE.DirectionalLight(0xfff1cb, 3.4);
  key.position.set(-5, 9, 6);
  key.castShadow = !state.lowPower;
  key.shadow.mapSize.set(state.lowPower ? 512 : 1024, state.lowPower ? 512 : 1024);
  scene.add(key);
  const fill = new THREE.PointLight(0x8bd7d4, 18, 22);
  fill.position.set(6, 4, 3);
  scene.add(fill);

  const counter = new THREE.Mesh(new THREE.BoxGeometry(18, .58, 11), new THREE.MeshStandardMaterial({ color: 0x9d6338, roughness: .72, metalness: 0 }));
  counter.position.y = -1.8;
  counter.receiveShadow = true;
  scene.add(counter);
  createKitchenProps();
  bowlGroup = createBowl(DIFFICULTIES.easy);
  scene.add(bowlGroup);
  itemGroup = new THREE.Group();
  bowlGroup.add(itemGroup);
  cat = createCat();
  scene.add(cat);
}

function createKitchenProps() {
  const back = new THREE.Group();
  const bottleMat = new THREE.MeshStandardMaterial({ color: 0x5d2e1c, roughness: .65 });
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, 1.7, 16), bottleMat);
  bottle.position.set(-5.2, -.65, -2.9);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, .65, 14), bottleMat);
  neck.position.set(-5.2, .52, -2.9);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .2, 14), new THREE.MeshStandardMaterial({ color: 0xd34d35 }));
  cap.position.set(-5.2, .94, -2.9);
  back.add(bottle, neck, cap);
  for (let i = 0; i < 3; i += 1) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(.27, 12, 8), new THREE.MeshStandardMaterial({ color: 0xeee0ba, roughness: .9 }));
    bulb.scale.y = .72;
    bulb.position.set(4.7 + i * .5, -1.28, -2.3 + (i % 2) * .2);
    back.add(bulb);
  }
  scene.add(back);
}

function createBowl(diff = DIFFICULTIES.easy) {
  const variants = {
    porcelain: { top: 3.12, bottom: 2.38, height: 1.52, outer: 0xfff9e8, rim: 0x3f7e9b, stripe: 0x5b93aa, water: 0x6dc1cd },
    enamel: { top: 3.7, bottom: 3.02, height: 1.4, outer: 0xf7f1d8, rim: 0x397b88, stripe: 0x6a9c9f, water: 0x66bdc8 },
    bath: { top: 4.05, bottom: 3.62, height: 1.2, outer: 0xd9e7d4, rim: 0x5e8e7a, stripe: 0x87a98e, water: 0x73bfc0 },
    feast: { top: 4.38, bottom: 3.72, height: 1.5, outer: 0xffeed0, rim: 0xb84438, stripe: 0xd36a53, water: 0x70bbc5 }
  };
  const v = variants[diff.bowl] || variants.porcelain;
  const group = new THREE.Group();
  group.name = 'bowl';
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(v.top, v.bottom, v.height, state.lowPower ? 36 : 72, 1, true),
    new THREE.MeshPhysicalMaterial({ color: v.outer, roughness: .42, clearcoat: .42, clearcoatRoughness: .38, side: THREE.DoubleSide })
  );
  outer.position.y = -1.0;
  outer.castShadow = true;
  outer.receiveShadow = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(v.bottom, v.bottom, .14, 56), new THREE.MeshStandardMaterial({ color: v.outer, roughness: .62 }));
  base.position.y = -1 - v.height / 2 + .03;
  base.receiveShadow = true;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(v.top, diff.bowl === 'porcelain' ? .12 : .17, 12, 72), new THREE.MeshPhysicalMaterial({ color: v.rim, roughness: .33, clearcoat: .55 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -1 + v.height / 2;
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(v.top - .24, .045, 8, 72), new THREE.MeshStandardMaterial({ color: v.stripe, roughness: .48 }));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.y = rim.position.y - .37;
  waterSurface = new THREE.Mesh(
    new THREE.CircleGeometry(v.top * .89, state.lowPower ? 40 : 80),
    new THREE.MeshPhysicalMaterial({ color: v.water, transparent: true, opacity: .46, roughness: .12, metalness: 0, clearcoat: 1, clearcoatRoughness: .08, transmission: .08, depthWrite: false, side: THREE.DoubleSide })
  );
  waterSurface.name = 'water-surface';
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.position.y = rim.position.y - .2;
  waterSurface.renderOrder = 4;
  const waterGlow = new THREE.Mesh(new THREE.CircleGeometry(v.top * .84, 64), new THREE.MeshBasicMaterial({ color: 0x8fdce0, transparent: true, opacity: .24, depthWrite: false }));
  waterGlow.rotation.x = -Math.PI / 2;
  waterGlow.position.y = waterSurface.position.y - .04;
  waterGlow.renderOrder = 3;
  group.add(outer, base, rim, stripe, waterGlow, waterSurface);
  for (let i = 0; i < 3; i += 1) {
    const ripple = new THREE.Mesh(new THREE.RingGeometry(.28 + i * .48, .31 + i * .48, 40), new THREE.MeshBasicMaterial({ color: 0xd8ffff, transparent: true, opacity: .18 - i * .035, depthWrite: false, side: THREE.DoubleSide }));
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.set((i - 1) * .72, waterSurface.position.y + .018, i % 2 ? .55 : -.48);
    ripple.renderOrder = 5;
    group.add(ripple);
  }
  const decorCount = diff.bowl === 'porcelain' ? 8 : diff.bowl === 'enamel' ? 20 : 12;
  for (let i = 0; i < decorCount; i += 1) {
    const angle = i / decorCount * Math.PI * 2;
    const mark = new THREE.Mesh(new THREE.SphereGeometry(diff.bowl === 'enamel' ? .025 : .055, 7, 5), new THREE.MeshStandardMaterial({ color: diff.bowl === 'feast' ? 0xc95742 : v.rim, roughness: .65 }));
    mark.scale.set(diff.bowl === 'enamel' ? 1 : .8, diff.bowl === 'enamel' ? 1 : 2.2, .35);
    mark.position.set(Math.cos(angle) * (v.top - .06), stripe.position.y - .2 + (i % 3) * .13, Math.sin(angle) * (v.top - .06));
    mark.rotation.y = -angle;
    group.add(mark);
  }
  return group;
}

function replaceBowl(diff) {
  if (bowlGroup) {
    scene.remove(bowlGroup);
    bowlGroup.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose());
      else child.material?.dispose?.();
    });
  }
  bowlGroup = createBowl(diff);
  itemGroup = new THREE.Group();
  bowlGroup.add(itemGroup);
  scene.add(bowlGroup);
  resize();
}

function createCat() {
  const group = new THREE.Group();
  group.name = 'cat';
  group.position.set(-4.15, .42, -1.5);
  group.rotation.y = -.22;
  const skin = skinCatalog.find((x) => x.id === save.skin) || skinCatalog[0];
  const furColor = new THREE.Color(skin.color);
  const stripeColor = furColor.clone().multiplyScalar(.62);
  const fur = new THREE.MeshStandardMaterial({ color: furColor, roughness: .88 });
  const stripe = new THREE.MeshStandardMaterial({ color: stripeColor, roughness: .9 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xffecd0, roughness: .86 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xf19b96, roughness: .72 });
  const sclera = new THREE.MeshPhysicalMaterial({ color: 0xfff8e9, roughness: .22, clearcoat: .7 });
  const iris = new THREE.MeshPhysicalMaterial({ color: 0x6d3d1e, roughness: .2, clearcoat: .85 });
  const pupil = new THREE.MeshStandardMaterial({ color: 0x241915, roughness: .35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.12, 32, 24), fur);
  body.scale.set(1.05, 1.18, .86);
  body.position.y = .22;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.66, 24, 18), cream);
  chest.scale.set(.72, 1.12, .3);
  chest.position.set(.1, .23, .79);
  chest.castShadow = true;
  catHead = new THREE.Group();
  catHead.position.set(.18, 1.43, .22);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.98, 32, 24), fur);
  head.scale.set(1.04, .94, .96);
  head.castShadow = true;
  [-.48, .48].forEach((x) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.36, .76, 3), fur);
    ear.position.set(x, .69, -.02);
    ear.rotation.set(0, 0, x < 0 ? -.12 : .12);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(.21, .48, 3), pink);
    inner.position.set(x, .7, .16);
    inner.rotation.set(0, 0, x < 0 ? -.12 : .12);
    catHead.add(ear, inner);
  });
  [-.18, .18].forEach((x) => {
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 14), cream);
    muzzle.scale.set(1.05, .8, .56);
    muzzle.position.set(x, -.17, .8);
    catHead.add(muzzle);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc85b5b }));
  nose.scale.set(1.25, .72, .6);
  nose.position.set(0, -.08, 1.03);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 6, 18, Math.PI), pupil);
  mouth.position.set(0, -.27, .99);
  mouth.rotation.z = Math.PI;
  catHead.add(head, nose, mouth);
  const eyes = [];
  [-.31, .31].forEach((x) => {
    const white = new THREE.Mesh(new THREE.SphereGeometry(.22, 20, 16), sclera);
    white.scale.set(.9, 1.18, .42);
    white.position.set(x, .16, .82);
    const colored = new THREE.Mesh(new THREE.SphereGeometry(.115, 18, 12), iris);
    colored.scale.set(.92, 1.12, .42);
    colored.position.set(x, .13, .995);
    const black = new THREE.Mesh(new THREE.SphereGeometry(.065, 14, 10), pupil);
    black.scale.set(.85, 1.18, .4);
    black.position.set(x, .13, 1.075);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(.027, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    shine.position.set(x - .028, .19, 1.115);
    eyes.push(colored);
    catHead.add(white, colored, black, shine);
  });
  [-.18, 0, .18].forEach((x, index) => {
    const mark = new THREE.Mesh(new THREE.CapsuleGeometry(.035, .3 - index * .045, 4, 8), stripe);
    mark.position.set(x, .52 - Math.abs(x) * .45, .82);
    mark.rotation.z = x * 1.5;
    catHead.add(mark);
  });
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 2; i += 1) {
      const cheek = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .22, 4, 7), stripe);
      cheek.position.set(side * (.68 + i * .035), .02 - i * .16, .55);
      cheek.rotation.z = side * (1.02 + i * .12);
      catHead.add(cheek);
    }
    const whiskerPoints = [];
    for (let i = 0; i < 3; i += 1) {
      whiskerPoints.push(new THREE.Vector3(side * .2, -.15 - i * .07, .99), new THREE.Vector3(side * (1.0 + i * .08), -.1 - i * .11, .92));
    }
    catHead.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(whiskerPoints), new THREE.LineBasicMaterial({ color: 0xfff5e5, transparent: true, opacity: .8 })));
  });
  catPaw = new THREE.Group();
  const foreleg = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .55, 8, 14), fur);
  foreleg.rotation.z = -.35;
  const pawTip = new THREE.Mesh(new THREE.SphereGeometry(.29, 18, 12), cream);
  pawTip.scale.set(1.05, .72, .9);
  pawTip.position.set(.1, -.42, .08);
  catPaw.add(foreleg, pawTip);
  catPaw.position.set(.88, .65, .62);
  const otherPaw = catPaw.clone(true);
  otherPaw.position.set(-.58, .62, .6);
  otherPaw.rotation.y = .1;
  [-.58, .6].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.SphereGeometry(.44, 20, 16), fur);
    leg.scale.set(.92, .72, 1.05);
    leg.position.set(x, -.65, .02);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.34, 18, 14), cream);
    foot.scale.set(1.05, .62, 1.15);
    foot.position.set(x, -.83, .48);
    group.add(leg, foot);
  });
  catTail = new THREE.Group();
  const tailPositions = [[-1.05,-.05,-.22],[-1.32,.1,-.16],[-1.48,.38,-.08],[-1.42,.68,.02],[-1.2,.88,.12],[-.96,.98,.18]];
  tailPositions.forEach((position, index) => {
    const segment = new THREE.Mesh(new THREE.SphereGeometry(.29 - index * .009, 18, 12), index % 2 === 1 ? stripe : fur);
    segment.scale.set(1.28, 1, .9);
    segment.position.set(...position);
    catTail.add(segment);
  });
  const tongue = new THREE.Mesh(new THREE.CapsuleGeometry(.055, .17, 5, 10), pink);
  tongue.position.set(0, -.31, 1.02);
  tongue.rotation.x = .12;
  tongue.visible = false;
  const drool = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .2, 5, 8), new THREE.MeshPhysicalMaterial({ color: 0xcceff5, transparent: true, opacity: .75, roughness: .1 }));
  drool.position.set(.18, -.4, 1.03);
  drool.visible = false;
  catHead.add(tongue, drool);
  group.add(body, chest, catHead, catPaw, otherPaw, catTail);
  const furMaterials = [fur, stripe];
  catParts = { body, chest, eyes, tongue, drool, furMaterials, originalColors: furMaterials.map((material) => material.color.clone()), otherPaw };
  return group;
}

function createUI() {
  renderDifficultyCards();
  renderTray();
  renderCollection();
  updatePersistentUI();
}

function renderDifficultyCards() {
  const unlockLevel = unlockProgress();
  els.difficulty.innerHTML = Object.values(DIFFICULTIES).map((diff) => {
    const locked = unlockLevel < diff.unlock;
    const unlockText = diff.id === 'normal' ? '通关 1 次小瓷碗' : diff.id === 'hard' ? '通关 3 次搪瓷盆' : diff.id === 'feast' ? '累计通关 6 次' : '';
    return `<button class="difficulty-card ${locked ? 'locked' : ''}" data-difficulty="${diff.id}" style="--card-color:${diff.color}" ${locked ? 'disabled' : ''}>
      <span class="bowl-mark">${diff.short} · ${diff.count} 件</span>${locked ? '<span class="lock-mark">未解锁</span>' : ''}
      <div class="bowl-preview bowl-${diff.bowl}" aria-hidden="true"></div>
      <strong>${diff.name}</strong><small>${locked ? unlockText : `${diff.layers} 层 · 奖励 ${diff.reward} 小鱼干`}</small>
    </button>`;
  }).join('');
}

function bindEvents() {
  addEventListener('resize', resize, { passive: true });
  els.difficulty.addEventListener('click', (event) => {
    const button = event.target.closest('[data-difficulty]');
    if (button && !button.disabled) startGame(button.dataset.difficulty);
  });
  els.canvas.addEventListener('pointerdown', onCanvasPointer);
  els.shake.addEventListener('click', shakeBowl);
  els.tutorialSkip.addEventListener('click', finishTutorial);
  els.homeBtn.addEventListener('click', () => state.mode === 'home' ? showToast('已经在厨房啦') : goHome());
  els.bookBtn.addEventListener('click', openCollection);
  els.closeBook.addEventListener('click', closeCollection);
  els.collection.addEventListener('click', (event) => { if (event.target === els.collection) closeCollection(); });
  els.soundBtn.addEventListener('click', toggleSound);
  els.primary.addEventListener('click', () => { hideModal(); startGame(state.difficulty.id); });
  els.secondary.addEventListener('click', () => { hideModal(); goHome(); });
  els.revive.addEventListener('click', reviveGame);
  els.skinGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-skin]');
    if (!button || button.disabled) return;
    save.skin = button.dataset.skin;
    persist();
    rebuildCat();
    renderCollection();
    playSound('click');
  });
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('pagehide', persist);
}

function startGame(id = 'easy') {
  audio.ensure();
  audio.startBgm();
  clearGameItems();
  state.activeReaction = null;
  resetCatPose();
  els.reaction.classList.remove('show');
  state.mode = 'playing';
  state.difficulty = DIFFICULTIES[id];
  replaceBowl(state.difficulty);
  state.tray = [];
  state.shakeLeft = save.skin === 'ragdoll' ? 6 : 5;
  state.busy = false;
  state.patrol = false;
  state.patrolHandled = false;
  state.elapsed = 0;
  state.startedAt = performance.now();
  state.pauseTotal = 0;
  state.combo = 0;
  state.matches = 0;
  state.revived = false;
  state.newPlayerProtection = state.difficulty.id === 'easy' && (save.wins.easy || 0) < 3;
  state.patrolTraining = state.newPlayerProtection;
  state.patrolAt = new URLSearchParams(location.search).get('patrol') === '1' ? 3 : state.newPlayerProtection ? 24 : 18 + Math.random() * 14;
  state.tutorialStep = (save.tutorialVersion || 0) >= 2 ? 99 : 0;
  bowlGroup.rotation.set(0, 0, 0);
  buildBoard(state.difficulty);
  els.home.classList.remove('active');
  els.hud.classList.add('active');
  els.shake.disabled = false;
  els.patrol.classList.remove('active');
  hideModal();
  updateGameUI();
  if (state.tutorialStep === 0) showTutorial(0);
  playSound('start');
}

function buildBoard(diff) {
  const seed = new URLSearchParams(location.search).has('test') ? 20260718 + diff.count : Math.floor(Math.random() * 1e9);
  const rng = seededRandom(seed);
  let types = generateTypeTriples(diff.count, diff.special, rng);
  if (state.newPlayerProtection) {
    const donor = types[0];
    let removed = 0;
    types = types.filter((type) => type !== donor || removed++ >= 3);
    types.unshift('driedFish', 'driedFish', 'driedFish');
  }
  types.forEach((type, index) => {
    const layer = index % diff.layers;
    const protectedItem = state.newPlayerProtection && index < 3;
    const radius = protectedItem ? .72 : Math.sqrt(rng()) * diff.spread;
    const theta = protectedItem ? (index - 1) * .85 : rng() * Math.PI * 2;
    const item = createGameItem(type, {
      x: protectedItem ? (index - 1) * .78 : Math.cos(theta) * radius,
      y: protectedItem ? -.29 : -.9 + layer * .19 + rng() * .06,
      z: protectedItem ? 1.25 : Math.sin(theta) * radius * .67,
      rot: [rng() * .5 - .25, rng() * Math.PI * 2, rng() * .6 - .3],
      layer
    });
    state.items.push(item);
    itemGroup.add(item.object);
  });
  targetFish = createTargetFish();
  targetFish.visible = true;
  itemGroup.add(targetFish);
}

function createGameItem(type, config) {
  const id = ++state.itemSeq;
  const object = createItemVisual(type);
  object.position.set(config.x, config.y, config.z);
  object.rotation.set(...config.rot);
  object.scale.multiplyScalar(.72 + Math.random() * .13);
  object.traverse((child) => {
    child.userData.itemId = id;
    child.castShadow = !state.lowPower;
    child.receiveShadow = true;
  });
  object.userData.itemId = id;
  return { id, type, object, active: true, layer: config.layer };
}

function createItemVisual(type) {
  const meta = ITEM_TYPES[type];
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color: meta.color, roughness: type === 'cap' ? .3 : .56, metalness: type === 'cap' ? .42 : 0, clearcoat: type === 'cap' ? .5 : .15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x49372d, roughness: .7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfff5d8, roughness: .8 });
  if (['carp', 'loach', 'yellowfish', 'minnow', 'driedFish'].includes(type)) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.55, 24, 16), mat);
    const bodyScale = type === 'loach' ? [1.58,.34,.43] : type === 'minnow' ? [1.05,.42,.52] : [1.32,.5,.62];
    body.scale.set(...bodyScale);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(.48, 20, 12), new THREE.MeshStandardMaterial({ color: type === 'loach' ? 0xb6956e : 0xf0d899, roughness: .66, transparent: true, opacity: .85 }));
    belly.scale.set(bodyScale[0] * .9, bodyScale[1] * .48, bodyScale[2] * .9);
    belly.position.y = -.11;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(type === 'minnow' ? .26 : .36, type === 'loach' ? .42 : .58, 3), mat);
    tail.rotation.z = -Math.PI / 2;
    tail.position.x = type === 'loach' ? -.94 : -.82;
    const dorsal = new THREE.Mesh(new THREE.ConeGeometry(.19, .38, 3), mat);
    dorsal.position.set(-.05, .32, 0);
    dorsal.rotation.z = -.18;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(.13, .3, 3), mat);
    fin.position.set(.05, -.02, .36);
    fin.rotation.set(Math.PI / 2, 0, -.45);
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(.082, 12, 9), white);
    eyeWhite.position.set(.46, .13, .32);
    eyeWhite.scale.set(1,.95,.55);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), dark);
    eye.position.set(.47, .13, .37);
    const gill = new THREE.Mesh(new THREE.TorusGeometry(.15, .018, 5, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x9f6646, roughness: .7 }));
    gill.position.set(.3, -.01, .35);
    gill.rotation.z = Math.PI / 2;
    group.add(body, belly, tail, dorsal, fin, eyeWhite, eye, gill);
    if (type === 'yellowfish') {
      const whiskerPoints = [new THREE.Vector3(.55,-.08,.23),new THREE.Vector3(.92,-.25,.35),new THREE.Vector3(.55,-.08,-.23),new THREE.Vector3(.92,-.25,-.35)];
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(whiskerPoints), new THREE.LineBasicMaterial({ color: 0x6b4a31 })));
    }
    if (type === 'driedFish') {
      group.scale.set(.72,.48,.72);
      for (let i = 0; i < 4; i += 1) {
        const rib = new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.32,6), white);
        rib.position.set(-.25 + i * .16,0,.34);
        rib.rotation.z = .95;
        group.add(rib);
      }
    }
  } else if (type === 'ginger') {
    for (let i = 0; i < 3; i += 1) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(.36, 18, 12), mat);
      bulb.position.x = (i - 1) * .3;
      bulb.position.y = i === 1 ? .12 : 0;
      group.add(bulb);
    }
  } else if (type === 'garlic') {
    for (let i = 0; i < 5; i += 1) {
      const clove = new THREE.Mesh(new THREE.SphereGeometry(.27, 18, 12), mat);
      clove.scale.set(.72, 1.2, .75);
      clove.position.set(Math.cos(i * 1.256) * .28, 0, Math.sin(i * 1.256) * .28);
      group.add(clove);
    }
    const stem = new THREE.Mesh(new THREE.ConeGeometry(.08,.28,8), new THREE.MeshStandardMaterial({ color: 0xbba777 }));
    stem.position.y = .35;
    group.add(stem);
  } else if (type === 'chopsticks') {
    [-.16, .16].forEach((z) => {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.055, .075, 1.7, 8), mat);
      stick.rotation.z = Math.PI / 2;
      stick.position.z = z;
      group.add(stick);
    });
  } else if (type === 'cap') {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.47, .47, .18, 18), mat);
    cap.rotation.x = Math.PI / 2;
    group.add(cap);
    for (let i = 0; i < 18; i += 1) {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(.035,.18,.06), dark);
      const angle = i / 18 * Math.PI * 2;
      ridge.position.set(Math.cos(angle)*.47,Math.sin(angle)*.47,0);
      ridge.rotation.z = angle;
      group.add(ridge);
    }
  } else if (type === 'egg') {
    const egg = new THREE.Mesh(new THREE.SphereGeometry(.48,24,18), mat);
    egg.scale.set(.78,1.08,.78);
    group.add(egg);
    for (let i = 0; i < 5; i += 1) {
      const speck = new THREE.Mesh(new THREE.SphereGeometry(.025,6,5), new THREE.MeshStandardMaterial({ color: 0xb99862 }));
      speck.position.set((i%2 ? .2 : -.18),.2-i*.11,.38);
      group.add(speck);
    }
  } else if (type === 'crab') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(.45, 24, 14), mat);
    body.scale.set(1.2, .55, .85);
    group.add(body);
    [-1, 1].forEach((side) => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.07,.3,5,8), mat);
      arm.position.set(side*.54,.04,0);
      arm.rotation.z = side*.9;
      const claw = new THREE.Mesh(new THREE.SphereGeometry(.24, 14, 10), mat);
      claw.position.set(side * .76, .18, 0);
      const cut = new THREE.Mesh(new THREE.ConeGeometry(.12,.25,3), dark);
      cut.position.set(side*.88,.2,.02);
      cut.rotation.z = side*Math.PI/2;
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.22,8), mat);
      stalk.position.set(side*.2,.29,.25);
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(.075,10,8), white);
      eyeWhite.position.set(side*.2,.4,.27);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.035,8,6), dark);
      eye.position.set(side*.2,.4,.335);
      group.add(arm,claw,cut,stalk,eyeWhite,eye);
      for (let i = 0; i < 3; i += 1) {
        const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.035,.32,4,7), mat);
        leg.position.set(side*(.38+i*.09),-.18,-.03+i*.02);
        leg.rotation.z = side*(1.05+i*.14);
        group.add(leg);
      }
    });
  } else if (type === 'chili') {
    const pepper = new THREE.Mesh(new THREE.CapsuleGeometry(.17, 1.05, 5, 10), mat);
    pepper.rotation.z = Math.PI / 2;
    pepper.rotation.y = .25;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.05, .08, .28, 8), new THREE.MeshStandardMaterial({ color: 0x4f8348 }));
    stem.rotation.z = Math.PI / 2;
    stem.position.x = -.72;
    group.add(pepper, stem);
  } else if (type === 'sock') {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.38, .85, .23), mat);
    leg.position.y = .2;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.7, .34, .23), mat);
    foot.position.set(.17, -.35, 0);
    group.add(leg, foot);
  } else if (type === 'yarn') {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(.52, 2), mat);
    group.add(ball);
    for (let i = 0; i < 3; i += 1) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.54, .025, 6, 24), white);
      ring.rotation.set(i * .7, i * 1.1, i * .5);
      group.add(ring);
    }
  } else if (type === 'bomb') {
    const bomb = new THREE.Mesh(new THREE.SphereGeometry(.5,24,18), mat);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(.12,.18,.18,10), new THREE.MeshStandardMaterial({ color: 0x6f6258, metalness: .35, roughness: .4 }));
    collar.position.y = .5;
    const fuse = new THREE.Mesh(new THREE.TorusGeometry(.24,.035,7,16,Math.PI*.75), new THREE.MeshStandardMaterial({ color: 0x7b5639, roughness: .9 }));
    fuse.position.set(.12,.64,0);
    fuse.rotation.z = .55;
    const spark = new THREE.Mesh(new THREE.IcosahedronGeometry(.11,1), new THREE.MeshBasicMaterial({ color: 0xffa834 }));
    spark.position.set(.3,.82,0);
    group.add(bomb,collar,fuse,spark);
  }
  return group;
}

function createTargetFish() {
  const group = createItemVisual('minnow');
  group.name = 'target-fish';
  group.position.set(.1, -1.2, .15);
  group.rotation.set(.08, -.6, -.03);
  group.scale.set(2.15, 2.15, 2.15);
  group.traverse((child) => { child.userData.targetFish = true; child.castShadow = true; });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.95, .045, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffd46c, transparent: true, opacity: .34, depthWrite: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -.05;
  group.add(ring);
  return group;
}

function onCanvasPointer(event) {
  if (state.mode !== 'playing' || state.busy) return;
  if (state.patrol) {
    if (state.patrolTraining) {
      state.patrolTraining = false;
      showToast('第一次放你一马：主人来时不要动！');
      return;
    }
    finishGame(false, 'patrol');
    return;
  }
  const rect = els.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(itemGroup.children, true);
  const hit = hits.find((entry) => entry.object.visible && (entry.object.userData.targetFish || entry.object.userData.itemId));
  if (!hit) {
    catReact('curious');
    showToast('盆里没有摸到东西');
    return;
  }
  if (hit.object.userData.targetFish) {
    catchTargetFish();
    return;
  }
  const item = state.items.find((entry) => entry.id === hit.object.userData.itemId);
  if (!item?.active) return;
  if (!isReachable(item)) {
    catReact('curious');
    showToast('够不到，先捞上面的');
    playSound('blocked');
    return;
  }
  pickItem(item);
}

function isReachable(item) {
  const point = item.object.position;
  const blockers = activeItems().filter((other) => other.id !== item.id && other.object.position.y > point.y + .13 && distance2D(other.object.position, point) < .58);
  return blockers.length === 0;
}

function catchTargetFish() {
  if (!targetFish?.visible || state.mode !== 'playing') return false;
  const remaining = activeItems().length;
  state.busy = true;
  save.seenItems = [...new Set([...(save.seenItems || []), 'target'])];
  persist();
  spawnWaterSplash(targetFish.position.clone(), 1.7);
  catReact('drool');
  showCatReaction(5, '这条也太大了！', '小猫口水都流下来啦，抱紧大鱼准备开饭。', 1100);
  setTimeout(() => finishGame(true, remaining === 0 ? 'perfect' : 'normal'), 760);
  return true;
}

function pickItem(item, options = {}) {
  if (!item.active) return;
  const splashPosition = item.object.position.clone();
  item.active = false;
  save.seenItems = [...new Set([...(save.seenItems || []), item.type])];
  persist();
  spawnWaterSplash(splashPosition, options.swept ? .55 : 1);
  animateOut(item.object, options.swept ? .22 : .34);
  if (options.swept) playSound('sweep');
  catReact(item.type === 'crab' ? 'shock' : 'pick');
  if (state.tutorialStep === 0) showTutorial(1);

  if (item.type === 'sock') {
    showToast('臭袜子！顺便叼走一个', 'reward');
    showCatReaction(1, '这味道不对劲…', '小猫捏着鼻子把袜子扔出厨房。');
    const neighbor = nearestActive(item.object.position);
    if (neighbor) { neighbor.active = false; animateOut(neighbor.object, .28); }
    afterBoardChange();
    return;
  }
  if (item.type === 'yarn') {
    showToast('毛线球缠住一组三条鱼', 'reward');
    catReact('chase');
    showCatReaction(2, '先玩球，再抓鱼', '毛线滚过水面，顺手缠走三条相同的鱼。');
    sweepTripleFish();
    afterBoardChange();
    return;
  }
  if (item.type === 'bomb') {
    catReact('bomb');
    showCatReaction(4, '砰！小猫变黑炭', '只是卡通烟灰，没有受伤；附近的鱼也被炸飞了。', 1500);
    spawnExplosion(splashPosition);
    explodeNearbyFish(splashPosition, 4 + Math.floor(Math.random() * 3));
    afterBoardChange();
    return;
  }
  if (item.type === 'chili') {
    catReact('roll');
    showCatReaction(3, '辣得满地打滚！', '小米辣不能吃，凑齐三个还能喷火清空半槽。', 1450);
  } else if (item.type === 'egg') {
    catReact('bat');
    showToast('鸡蛋滚起来了，小猫一爪按住');
  } else if (item.type === 'ginger') {
    catReact('sneeze');
    showToast('阿嚏！这是姜，不是鱼');
  } else if (item.type === 'garlic') {
    catReact('curious');
    showToast('蒜味太冲，小猫眯起了眼');
  }

  state.tray = insertTray(state.tray, item.type);
  renderTray();
  if (item.type === 'crab') {
    showToast('螃蟹夹爪！小猫扫飞一片', 'reward');
    showCatReaction(2, '嗷呜！夹到爪啦', '小猫猛地甩爪，把水面上的东西扫飞一片。');
    setTimeout(() => sweepTopItems(3 + Math.floor(Math.random() * 3)), 180);
  }
  window.setTimeout(resolveTray, 190);
  afterBoardChange();
}

function resolveTray() {
  const result = resolveMatches(state.tray);
  if (result.matched) {
    state.tray = result.tray;
    const now = performance.now();
    state.combo = now - state.lastMatchAt < 3400 ? state.combo + 1 : 1;
    state.lastMatchAt = now;
    state.matches += 1;
    const reward = state.combo >= 4 ? 20 : state.combo === 3 ? 10 : state.combo === 2 ? 5 : 0;
    save.fishBones += reward;
    if (state.combo >= 4) {
      state.shakeLeft += 1;
      confetti(22);
      showToast(`${state.combo} 连消！+1 次扒盆 · +20 小鱼干`, 'reward');
    } else if (state.combo === 3) showToast('3 连消！猫爪连击 · +10', 'reward');
    else if (state.combo === 2) showToast('好耶！2 连消 · +5', 'reward');
    else {
      const meta = ITEM_TYPES[result.matched];
      showToast(meta.edible ? `${meta.name} × 3，小猫吃掉啦` : `${meta.name} × 3，清出槽位啦`, 'reward');
    }
    if (result.matched === 'driedFish') sweepRandomTriple();
    if (result.matched === 'chili') {
      const clearCount = Math.ceil(state.tray.length / 2);
      state.tray.splice(0, clearCount);
      catReact('fire');
      showToast('辣到喷火！清空半槽', 'reward');
    }
    playSound('match');
    persist();
    renderTray(true);
    if (state.tutorialStep === 1) showTutorial(2);
  }
  if (state.tray.length >= 7) {
    if (state.newPlayerProtection) {
      state.tray.splice(0, 3);
      renderTray();
      showToast('新手保护：小猫偷偷腾出 3 格', 'reward');
    } else finishGame(false, 'tray');
  }
  updateGameUI();
}

function afterBoardChange() {
  settleItems();
  const remaining = activeItems().length;
  if (remaining === 0 && targetFish) {
    showToast('盆底大鱼完全露出来啦！', 'reward');
  }
}

function settleItems() {
  const items = activeItems().sort((a, b) => a.object.position.y - b.object.position.y);
  items.forEach((item, index) => {
    const targetY = -.9 + (index % Math.max(2, state.difficulty.layers)) * .18;
    const pull = .96;
    tween(item.object, { x: item.object.position.x * pull, y: targetY, z: item.object.position.z * pull }, .38 + Math.random() * .15);
  });
}

function shakeBowl() {
  if (state.mode !== 'playing' || state.busy || state.patrol || state.shakeLeft <= 0) return;
  state.shakeLeft -= 1;
  state.busy = true;
  els.shake.disabled = true;
  updateGameUI();
  playSound('shake');
  spawnWaterSplash(new THREE.Vector3(0, waterSurface.position.y, 0), 1.8);
  catReact('shake');
  if (state.tutorialStep === 2) showTutorial(3);
  const start = performance.now();
  activeItems().forEach((item) => {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.min(state.difficulty.spread, Math.hypot(item.object.position.x, item.object.position.z) + (Math.random() - .45) * 1.1);
    tween(item.object, { x: Math.cos(angle) * radius, y: item.object.position.y + (Math.random() < .3 ? .5 : .1), z: Math.sin(angle) * radius * .68 }, 1.2);
  });
  const shakeTick = () => {
    const t = (performance.now() - start) / 1500;
    if (t < 1) {
      bowlGroup.rotation.z = Math.sin(t * Math.PI * 8) * .15 * (1 - t);
      bowlGroup.rotation.x = Math.sin(t * Math.PI * 4) * .05;
      requestAnimationFrame(shakeTick);
    } else {
      bowlGroup.rotation.set(0, 0, 0);
      state.busy = false;
      els.shake.disabled = state.shakeLeft <= 0;
      settleItems();
    }
  };
  shakeTick();
}

function triggerPatrol() {
  if (state.mode !== 'playing' || state.patrol || state.busy) return;
  state.patrol = true;
  state.busy = false;
  els.patrol.classList.add('active');
  els.shake.disabled = true;
  catReact('hide');
  showCatReaction(1, state.patrolTraining ? '巡逻教学：先别动' : '糟糕，主人来了！', '两秒内不要点击任何物品，小猫正在假装舔爪子。', 1950);
  playSound('patrol');
  clearTimeout(patrolTimer);
  patrolTimer = setTimeout(() => {
    if (state.mode !== 'playing') return;
    state.patrol = false;
    state.patrolTraining = false;
    els.patrol.classList.remove('active');
    els.shake.disabled = state.shakeLeft <= 0;
    showToast('主人走了，继续捞！');
  }, 2000);
}

function finishGame(won, reason) {
  if (state.mode !== 'playing') return;
  state.mode = won ? 'won' : 'failed';
  state.busy = true;
  state.patrol = false;
  clearTimeout(patrolTimer);
  els.patrol.classList.remove('active');
  els.tutorial.classList.remove('active');
  els.coachArrow.classList.remove('active');
  if (won) {
    const perfect = reason === 'perfect';
    const reward = state.difficulty.reward + (perfect ? 20 : 0);
    save.fishBones += reward;
    save.wins[state.difficulty.id] += 1;
    const fish = rewardFish(perfect);
    if (!save.fish.includes(fish)) save.fish.push(fish);
    persist();
    renderDifficultyCards();
    updatePersistentUI();
    catReact('win');
    confetti(perfect ? 80 : 48);
    playSound('win');
    showModal({ cat: '😻', kicker: perfect ? '完美偷鱼' : '偷鱼成功', title: perfect ? '连盆都掀干净啦' : '抓到大鱼啦', copy: `用时 ${formatTime(state.elapsed)}，完成 ${state.matches} 次三消。`, reward: `+${reward} 小鱼干 · 获得「${fish}」`, revive: false });
  } else {
    catReact('fail');
    playSound('fail');
    const caught = reason === 'patrol';
    showModal({ cat: caught ? '🙀' : '😿', kicker: caught ? '被主人抓包' : '槽位放满了', title: caught ? '手太快，被发现啦' : '啪叽！没装下', copy: '没有惩罚，立刻再试一次。也可以免费复活，清空两个槽位继续。', reward: '', revive: !state.revived });
  }
}

function showModal(config) {
  els.modalCat.textContent = config.cat;
  els.modalKicker.textContent = config.kicker;
  els.modalTitle.textContent = config.title;
  els.modalCopy.textContent = config.copy;
  els.modalReward.textContent = config.reward;
  els.revive.hidden = !config.revive;
  els.modal.classList.add('active');
  setTimeout(() => els.primary.focus(), 260);
}

function hideModal() { els.modal.classList.remove('active'); }

function reviveGame() {
  if (state.revived) return;
  state.revived = true;
  state.tray.splice(0, Math.min(2, state.tray.length));
  state.mode = 'playing';
  state.busy = false;
  state.startedAt = performance.now() - state.elapsed * 1000;
  renderTray();
  hideModal();
  catReact('curious');
  showToast('免费复活：清空 2 个槽位', 'reward');
  playSound('start');
}

function goHome() {
  state.mode = 'home';
  state.busy = false;
  state.activeReaction = null;
  resetCatPose();
  clearTimeout(patrolTimer);
  els.hud.classList.remove('active');
  els.home.classList.add('active');
  els.patrol.classList.remove('active');
  els.tutorial.classList.remove('active');
  hideModal();
  clearGameItems();
  replaceBowl(DIFFICULTIES.easy);
  renderHomeScene();
}

function renderHomeScene() {
  const demoTypes = ['carp', 'yellowfish', 'crab', 'yarn', 'garlic'];
  demoTypes.forEach((type, index) => {
    const angle = index / demoTypes.length * Math.PI * 2;
    const item = createGameItem(type, { x: Math.cos(angle) * 1.8, y: -.7 + index * .08, z: Math.sin(angle) * 1.2, rot: [0, angle, 0], layer: index });
    state.items.push(item);
    itemGroup.add(item.object);
  });
}

function clearGameItems() {
  state.items = [];
  tweens.length = 0;
  for (let index = effects.length - 1; index >= 0; index -= 1) removeEffect(index, effects[index]);
  if (!itemGroup) return;
  while (itemGroup.children.length) {
    const object = itemGroup.children.pop();
    object.traverse((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose?.();
    });
  }
  targetFish = null;
}

function rebuildCat() {
  scene.remove(cat);
  cat.traverse((child) => { child.geometry?.dispose?.(); child.material?.dispose?.(); });
  cat = createCat();
  scene.add(cat);
  resize();
}

function renderTray(removing = false) {
  const cells = Array.from({ length: 7 }, (_, index) => {
    const type = state.tray[index];
    const meta = type ? ITEM_TYPES[type] : null;
    return `<div class="tray-slot ${type ? 'filled' : ''} ${removing && index >= state.tray.length ? 'removing' : ''}" ${meta ? `style="--item-color:${meta.color}"` : ''}>${meta ? `<span title="${meta.name}">${meta.icon}</span>` : ''}</div>`;
  });
  els.tray.innerHTML = cells.join('');
}

function updateGameUI() {
  els.shakeCount.textContent = state.shakeLeft;
  els.shake.disabled = state.busy || state.shakeLeft <= 0;
  els.fishBones.textContent = save.fishBones;
}

function updatePersistentUI() {
  els.fishBones.textContent = save.fishBones;
  els.soundBtn.textContent = save.sound ? '♪' : '∕';
  els.soundBtn.setAttribute('aria-label', save.sound ? '关闭声音' : '打开声音');
}

function renderCollection() {
  const entries = [...Object.entries(ITEM_TYPES), ['target', TARGET_FISH]];
  const seen = new Set(save.seenItems || []);
  els.collectionCount.textContent = `${entries.filter(([id]) => seen.has(id)).length} / ${entries.length} 件已发现`;
  els.itemGrid.innerHTML = entries.map(([id, meta]) => {
    const discovered = seen.has(id);
    return `<article class="item-card ${discovered ? '' : 'unseen'}" style="--item-color:${meta.color}">
      <span class="item-icon">${meta.icon}</span><div><strong>${meta.name}</strong><span>${meta.effect}</span></div><em>${discovered ? '已捞到' : '未遇见'}</em>
    </article>`;
  }).join('');
  els.fishGrid.innerHTML = fishCatalog.map(([name, rarity]) => {
    const unlocked = save.fish.includes(name);
    const icon = rarity === '传说' ? '🐠' : rarity === '史诗' ? '🐡' : '🐟';
    return `<div class="fish-card ${unlocked ? '' : 'locked'}"><span class="fish-shape">${icon}</span><strong>${unlocked ? name : '???'}</strong><small>${rarity}</small></div>`;
  }).join('');
  els.skinGrid.innerHTML = skinCatalog.map((skin) => {
    const unlocked = skin.unlock();
    return `<button class="skin-card ${save.skin === skin.id ? 'selected' : ''}" data-skin="${skin.id}" ${unlocked ? '' : 'disabled'}><span>${skin.icon}</span><small>${unlocked ? skin.name : '待解锁'}</small></button>`;
  }).join('');
}

function openCollection() {
  renderCollection();
  els.collection.classList.add('active');
  els.closeBook.focus();
  playSound('click');
}

function closeCollection() { els.collection.classList.remove('active'); }

function showTutorial(step) {
  state.tutorialStep = step;
  const steps = [
    { message: '先捞水面上闪光的小鱼干', hint: '新手局已经把 3 个小鱼干放在最上层' },
    { message: '继续找两个一样的小鱼干', hint: '相同物品会自动排在一起，凑齐 3 个就消除' },
    { message: '现在点右下角「晃一晃」', hint: '物品会在真水里重新翻动，藏在下面的鱼更容易露出' },
    { message: '最后：主人来时一定别动', hint: '巡逻倒计时结束会现场示范；第一次误点不会失败' }
  ];
  const current = steps[step] || steps[steps.length - 1];
  els.tutorialStep.textContent = `新手教学 · ${Math.min(step + 1, 4)}/4`;
  els.tutorialText.textContent = current.message;
  els.tutorialHint.textContent = current.hint;
  els.tutorial.querySelectorAll('.tutorial-progress i').forEach((bar, index) => bar.classList.toggle('done', index <= step));
  els.coachArrow.classList.toggle('active', step === 2);
  els.tutorial.classList.add('active');
  if (step === 3) setTimeout(() => { if (state.tutorialStep === 3) finishTutorial(true); }, 5200);
}

function finishTutorial(silent = false) {
  state.tutorialStep = 99;
  save.tutorialDone = true;
  save.tutorialVersion = 2;
  persist();
  els.tutorial.classList.remove('active');
  els.coachArrow.classList.remove('active');
  if (!silent) showToast('会玩啦，尽情捞鱼！');
}

function showToast(message, type = '') {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`;
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 1800);
}

function activeItems() { return state.items.filter((item) => item.active); }
function distance2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function nearestActive(position) { return activeItems().sort((a, b) => distance2D(a.object.position, position) - distance2D(b.object.position, position))[0]; }

function showCatReaction(index, title, copy, duration = 1250) {
  const positions = [[0,0],[50,0],[100,0],[0,100],[50,100],[100,100]];
  const [x,y] = positions[index] || positions[0];
  els.reactionImage.style.setProperty('--reaction-x', `${x}%`);
  els.reactionImage.style.setProperty('--reaction-y', `${y}%`);
  els.reactionTitle.textContent = title;
  els.reactionCopy.textContent = copy;
  els.reaction.classList.add('show');
  clearTimeout(reactionTimer);
  reactionTimer = setTimeout(() => els.reaction.classList.remove('show'), duration);
}

function spawnWaterSplash(position, intensity = 1) {
  if (!waterSurface || !bowlGroup) return;
  audio.splash(intensity);
  const waterY = waterSurface.position.y + .03;
  for (let i = 0; i < Math.max(1, Math.round(intensity)); i += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(.07 + i * .06, .105 + i * .07, 28),
      new THREE.MeshBasicMaterial({ color: 0xc5f5f4, transparent: true, opacity: .72, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(position.x, waterY + i * .01, position.z);
    ring.renderOrder = 6;
    bowlGroup.add(ring);
    effects.push({ type: 'ring', object: ring, start: performance.now(), duration: 650 + i * 120 });
  }
  const count = state.lowPower ? Math.round(5 * intensity) : Math.round(10 * intensity);
  for (let i = 0; i < count; i += 1) {
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(.035 + Math.random() * .035, 8, 6),
      new THREE.MeshPhysicalMaterial({ color: 0xa7edf0, transparent: true, opacity: .82, roughness: .08, transmission: .35, depthWrite: false })
    );
    const angle = Math.random() * Math.PI * 2;
    const speed = (.75 + Math.random() * .95) * intensity;
    drop.position.set(position.x, waterY + .04, position.z);
    bowlGroup.add(drop);
    effects.push({ type: 'particle', object: drop, velocity: new THREE.Vector3(Math.cos(angle) * speed, 1.2 + Math.random() * 1.35, Math.sin(angle) * speed), life: .72 + Math.random() * .35 });
  }
}

function spawnExplosion(position) {
  playSound('bomb');
  for (let i = 0; i < (state.lowPower ? 7 : 14); i += 1) {
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(.08 + Math.random() * .11, 8, 6), new THREE.MeshBasicMaterial({ color: i % 3 === 0 ? 0xffa12d : 0x373634, transparent: true, opacity: .85 }));
    const angle = Math.random() * Math.PI * 2;
    smoke.position.set(position.x, waterSurface.position.y + .08, position.z);
    bowlGroup.add(smoke);
    effects.push({ type: 'particle', object: smoke, velocity: new THREE.Vector3(Math.cos(angle) * (1 + Math.random()), 1.4 + Math.random() * 1.8, Math.sin(angle) * (1 + Math.random())), life: .85 + Math.random() * .45 });
  }
}

function explodeNearbyFish(position, count) {
  const fish = activeItems().filter((item) => ITEM_TYPES[item.type].kind === 'fish').sort((a,b) => distance2D(a.object.position, position) - distance2D(b.object.position, position)).slice(0,count);
  fish.forEach((item) => { item.active = false; spawnWaterSplash(item.object.position.clone(), .35); animateOut(item.object,.3, false); });
  showToast(`炸弹带走了 ${fish.length} 条附近的鱼`, 'reward');
}

function updateEffects(now, delta) {
  for (let i = effects.length - 1; i >= 0; i -= 1) {
    const effect = effects[i];
    if (effect.type === 'ring') {
      const progress = Math.min(1, (now - effect.start) / effect.duration);
      effect.object.scale.setScalar(1 + progress * 6);
      effect.object.material.opacity = (1 - progress) * .7;
      if (progress >= 1) removeEffect(i,effect);
    } else {
      effect.life -= delta;
      effect.velocity.y -= 3.1 * delta;
      effect.object.position.addScaledVector(effect.velocity, delta);
      effect.object.material.opacity = Math.max(0, Math.min(.85, effect.life));
      if (effect.life <= 0) removeEffect(i,effect);
    }
  }
}

function removeEffect(index, effect) {
  effect.object.parent?.remove(effect.object);
  effect.object.geometry?.dispose?.();
  effect.object.material?.dispose?.();
  effects.splice(index,1);
}

function sweepTopItems(count) {
  activeItems().sort((a, b) => b.object.position.y - a.object.position.y).slice(0, count).forEach((item) => {
    item.active = false;
    spawnWaterSplash(item.object.position.clone(), .32);
    animateOut(item.object, .3, false);
  });
  playSound('sweep');
  afterBoardChange();
}

function sweepTripleFish() {
  const fishTypes = ['carp', 'loach', 'yellowfish', 'minnow'];
  const grouped = fishTypes.map((type) => activeItems().filter((item) => item.type === type)).find((items) => items.length >= 3);
  (grouped || activeItems()).slice(0, 3).forEach((item) => { item.active = false; spawnWaterSplash(item.object.position.clone(), .28); animateOut(item.object, .34, false); });
}

function sweepRandomTriple() {
  const grouped = Object.keys(ITEM_TYPES).map((type) => activeItems().filter((item) => item.type === type)).find((items) => items.length >= 3);
  if (grouped) {
    grouped.slice(0, 3).forEach((item) => { item.active = false; spawnWaterSplash(item.object.position.clone(), .28); animateOut(item.object, .32, false); });
    showToast('小鱼干吃嗨了！再消一组', 'reward');
    afterBoardChange();
  }
}

function animateOut(object, duration, towardCat = true) {
  let target;
  if (towardCat && cat && bowlGroup) {
    const pawWorld = cat.localToWorld(new THREE.Vector3(1.08, 1.08, .58));
    target = bowlGroup.worldToLocal(pawWorld.clone());
  } else {
    const angle = Math.atan2(object.position.z, object.position.x) + (Math.random() - .5) * .7;
    target = new THREE.Vector3(Math.cos(angle) * (state.difficulty.spread + 1.5), object.position.y + 1.05, Math.sin(angle) * (state.difficulty.spread + 1.5));
  }
  tween(object, { x: target.x, y: target.y, z: target.z, scale: .05, arc: towardCat ? 1.55 : 1.05 }, duration, () => { object.visible = false; });
}

function tween(object, target, duration = .35, onDone) {
  tweens.push({ object, start: performance.now(), duration: duration * 1000, from: { x: object.position.x, y: object.position.y, z: object.position.z, scale: object.scale.x }, target, onDone });
}

function updateTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i -= 1) {
    const tw = tweens[i];
    const t = Math.min(1, (now - tw.start) / tw.duration);
    const ease = 1 - Math.pow(1 - t, 3);
    if (tw.target.x !== undefined) tw.object.position.x = THREE.MathUtils.lerp(tw.from.x, tw.target.x, ease);
    if (tw.target.y !== undefined) tw.object.position.y = THREE.MathUtils.lerp(tw.from.y, tw.target.y, ease) + Math.sin(t * Math.PI) * (tw.target.arc || 0);
    if (tw.target.z !== undefined) tw.object.position.z = THREE.MathUtils.lerp(tw.from.z, tw.target.z, ease);
    if (tw.target.scale !== undefined) tw.object.scale.setScalar(THREE.MathUtils.lerp(tw.from.scale, tw.target.scale, ease));
    if (t >= 1) { tweens.splice(i, 1); tw.onDone?.(); }
  }
}

function resetCatPose() {
  if (!cat || !catHead || !catPaw) return;
  cat.position.copy(catBasePosition);
  cat.rotation.set(0, -.22, 0);
  cat.scale.copy(cat.userData.baseScale || new THREE.Vector3(1, 1, 1));
  catHead.rotation.set(0, 0, 0);
  catPaw.position.set(.88, .65, .62);
  catPaw.rotation.set(0, 0, 0);
  catParts.otherPaw?.rotation.set(0, .1, 0);
  catParts.tongue.visible = false;
  catParts.drool.visible = false;
  catParts.furMaterials.forEach((material, index) => material.color.copy(catParts.originalColors[index]));
}

function catReact(kind) {
  if (!catHead || !catPaw) return;
  resetCatPose();
  const durations = { curious: 700, pick: 470, shock: 720, shake: 1450, hide: 2050, fire: 900, roll: 1550, chase: 1250, bomb: 1750, bat: 850, sneeze: 850, drool: 1700 };
  state.activeReaction = { kind, start: performance.now(), duration: durations[kind] || Infinity };
  if (kind === 'bomb') catParts.furMaterials.forEach((material) => material.color.set(0x36312e));
  if (kind === 'drool') { catParts.tongue.visible = true; catParts.drool.visible = true; }
}

function updateCatReaction(now) {
  const reaction = state.activeReaction;
  if (!reaction || !cat) return;
  const raw = (now - reaction.start) / reaction.duration;
  const p = Number.isFinite(raw) ? Math.min(1, raw) : 0;
  const pulse = Math.sin(p * Math.PI);
  if (reaction.kind === 'curious') catHead.rotation.z = -.3 * pulse;
  else if (reaction.kind === 'pick') { catPaw.position.x = .88 + 1.28 * pulse; catPaw.position.y = .65 - .48 * pulse; catHead.rotation.z = .08 * pulse; }
  else if (reaction.kind === 'shock') { catHead.rotation.z = .23 * Math.sin(p * Math.PI * 4); cat.scale.copy(cat.userData.baseScale).multiplyScalar(1 + .08 * pulse); }
  else if (reaction.kind === 'shake') catPaw.rotation.z = -.78 * Math.sin(p * Math.PI * 6) * (1 - p);
  else if (reaction.kind === 'hide') { cat.position.y = catBasePosition.y - .36 * pulse; catHead.rotation.x = .48 * pulse; }
  else if (reaction.kind === 'fire') { catHead.rotation.x = -.28 * pulse; cat.position.y = catBasePosition.y + .16 * Math.abs(Math.sin(p * Math.PI * 4)); }
  else if (reaction.kind === 'roll') { cat.rotation.z = Math.sin(p * Math.PI * 4) * .72; cat.position.x = catBasePosition.x + Math.sin(p * Math.PI * 2) * .55; cat.position.y = catBasePosition.y + Math.abs(Math.sin(p * Math.PI * 4)) * .22; }
  else if (reaction.kind === 'chase') { cat.position.x = catBasePosition.x + Math.sin(p * Math.PI * 3) * .75; catPaw.rotation.z = -pulse * .65; }
  else if (reaction.kind === 'bomb') { cat.scale.copy(cat.userData.baseScale).multiplyScalar(1 + .1 * Math.sin(p * Math.PI * 8) * (1 - p)); catHead.rotation.z = .12 * Math.sin(p * Math.PI * 10); }
  else if (reaction.kind === 'bat') { catPaw.rotation.z = -.85 * Math.sin(p * Math.PI * 5); catHead.rotation.z = -.12 * pulse; }
  else if (reaction.kind === 'sneeze') { catHead.rotation.x = -.35 * Math.sin(p * Math.PI * 5) * (1 - p); cat.position.x = catBasePosition.x - .18 * pulse; }
  else if (reaction.kind === 'drool') { catHead.rotation.z = -.12 * pulse; catParts.drool.scale.y = .8 + .45 * Math.sin(p * Math.PI * 4) ** 2; }
  else if (reaction.kind === 'win') { cat.rotation.z = -.16; cat.position.y = catBasePosition.y + .14 * Math.abs(Math.sin(now * .006)); }
  else if (reaction.kind === 'fail') { catHead.rotation.x = .58; cat.position.y = catBasePosition.y - .3; }
  if (p >= 1 && Number.isFinite(raw)) {
    state.activeReaction = null;
    resetCatPose();
  }
}

function rewardFish(perfect) {
  const roll = Math.random();
  let rarity = '普通';
  if (perfect ? roll < .5 : roll < .01) rarity = '传说';
  else if (roll < .08 || state.difficulty.id === 'hard' || state.difficulty.id === 'feast') rarity = '史诗';
  else if (roll < .3 || state.difficulty.id === 'normal') rarity = '稀有';
  const pool = fishCatalog.filter((fish) => fish[1] === rarity);
  const unowned = pool.filter((fish) => !save.fish.includes(fish[0]));
  return (unowned.length ? unowned : pool)[Math.floor(Math.random() * (unowned.length || pool.length))][0];
}

function unlockProgress() {
  if (totalWins() >= 6) return 6;
  if ((save.wins.normal || 0) >= 3) return 3;
  if ((save.wins.easy || 0) >= 1) return 1;
  return 0;
}

function totalWins() { return Object.values(save.wins).reduce((sum, count) => sum + count, 0); }

function confetti(count) {
  const colors = ['#ef7c36', '#59afb4', '#f2c34f', '#b66fa5', '#6aa276'];
  els.confetti.innerHTML = Array.from({ length: state.lowPower ? Math.min(count, 30) : count }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${colors[i % colors.length]};--drift:${(Math.random() - .5) * 220}px;animation-delay:${Math.random() * .45}s"></i>`).join('');
  setTimeout(() => { els.confetti.innerHTML = ''; }, 2500);
}

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  const portrait = height > width;
  camera.fov = portrait ? 42 : 35;
  camera.position.set(0, portrait ? 9.6 : 8.5, portrait ? 14.8 : 12.5);
  camera.lookAt(0, -.1, 0);
  camera.updateProjectionMatrix();
  const bowlScale = portrait
    ? ({ porcelain: .88, enamel: .8, bath: .72, feast: .66 }[state.difficulty.bowl] || .88)
    : ({ porcelain: 1, enamel: .96, bath: .9, feast: .84 }[state.difficulty.bowl] || 1);
  bowlGroup.scale.setScalar(bowlScale);
  bowlGroup.position.y = portrait ? -.15 : 0;
  catBasePosition.set(portrait ? -1.62 : -4.15, portrait ? .82 : .42, portrait ? -1.78 : -1.5);
  cat.userData.baseScale = new THREE.Vector3().setScalar(portrait ? .79 : 1);
  if (!state.activeReaction) resetCatPose();
}

function loop(now) {
  const delta = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  updateTweens(now);
  updateEffects(now, delta);
  updateCatReaction(now);
  if (waterSurface) {
    waterSurface.material.opacity = .44 + Math.sin(now * .0017) * .035;
    waterSurface.rotation.z = Math.sin(now * .00055) * .035;
    waterSurface.scale.setScalar(1 + Math.sin(now * .0011) * .008);
  }
  if (state.mode === 'playing' && !document.hidden) {
    state.elapsed = (now - state.startedAt - state.pauseTotal) / 1000;
    els.timer.textContent = formatTime(state.elapsed);
    const untilPatrol = Math.max(0, Math.ceil(state.patrolAt - state.elapsed));
    els.patrolStatus.innerHTML = untilPatrol > 0 ? `<span></span>主人巡逻倒计时 ${untilPatrol} 秒` : '<span></span>主人正在附近';
    if (!state.patrolHandled && !state.busy && state.elapsed >= state.patrolAt) {
      state.patrolHandled = true;
      triggerPatrol();
    }
  }
  if (catTail && !matchMedia('(prefers-reduced-motion: reduce)').matches) catTail.rotation.y = .5 + Math.sin(now * .003) * .12;
  if (state.mode === 'home') itemGroup.rotation.y += delta * .08;
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function onVisibility() {
  if (document.hidden && state.mode === 'playing') {
    state.pausedAt = performance.now();
    els.pause.classList.add('active');
  } else if (state.pausedAt) {
    state.pauseTotal += performance.now() - state.pausedAt;
    state.pausedAt = 0;
    els.pause.classList.remove('active');
  }
}

function toggleSound() {
  save.sound = !save.sound;
  persist();
  updatePersistentUI();
  if (save.sound) { audio.ensure(); audio.startBgm(); playSound('click'); } else audio.stopBgm();
}

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...structuredClone(defaultSave), ...data, wins: { ...defaultSave.wins, ...(data.wins || {}) }, fish: Array.isArray(data.fish) ? data.fish : ['鲫鱼'], seenItems: Array.isArray(data.seenItems) ? data.seenItems : [] };
  } catch { return structuredClone(defaultSave); }
}

function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); }

const audio = {
  context: null,
  bgmTimer: 0,
  ensure() {
    if (!save.sound) return;
    if (!this.context) this.context = new (window.AudioContext || window.webkitAudioContext)();
    if (this.context.state === 'suspended') this.context.resume();
  },
  tone(frequency, duration = .1, type = 'sine', gain = .05, delay = 0) {
    if (!save.sound) return;
    this.ensure();
    const ctx = this.context;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    amp.gain.setValueAtTime(0, ctx.currentTime + delay);
    amp.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + .01);
    amp.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + delay + duration);
    osc.connect(amp).connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + .02);
  },
  splash(intensity = 1) {
    if (!save.sound) return;
    this.ensure();
    const ctx = this.context;
    const length = Math.floor(ctx.sampleRate * .22);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length * .24));
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1050 + intensity * 260;
    filter.Q.value = .72;
    amp.gain.setValueAtTime(Math.min(.095, .038 * intensity), ctx.currentTime);
    amp.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .23);
    source.buffer = buffer;
    source.connect(filter).connect(amp).connect(ctx.destination);
    source.start();
    this.tone(145 + intensity * 18, .15, 'sine', Math.min(.045, .018 * intensity), .025);
  },
  startBgm() {
    if (!save.sound || this.bgmTimer) return;
    this.ensure();
    const phrase = () => {
      if (!save.sound) return;
      [262, 330, 392, 440, 392, 330, 294, 330].forEach((note, index) => {
        this.tone(note, .55, 'sine', .011, index * .48);
        if (index % 2 === 0) this.tone(note / 2, .72, 'triangle', .006, index * .48);
      });
    };
    phrase();
    this.bgmTimer = window.setInterval(phrase, 5200);
  },
  stopBgm() {
    if (this.bgmTimer) window.clearInterval(this.bgmTimer);
    this.bgmTimer = 0;
  }
};

function playSound(kind) {
  if (!save.sound) return;
  const map = {
    click: [[320,.06,'sine',.035]], start: [[392,.09,'sine',.04],[523,.13,'sine',.04,.08]],
    pick: [[260,.06,'triangle',.045],[420,.08,'sine',.03,.04]], blocked: [[190,.11,'sine',.03]],
    match: [[523,.08,'sine',.05],[659,.1,'sine',.05,.07],[784,.14,'sine',.04,.14]],
    shake: [[110,.45,'sine',.025],[145,.35,'triangle',.02,.2]], sweep: [[420,.16,'triangle',.035],[650,.12,'sine',.03,.08]],
    patrol: [[95,.2,'sine',.06],[80,.25,'sine',.06,.33]], bomb: [[72,.3,'sawtooth',.075],[45,.55,'sine',.065,.05]], fail: [[220,.12,'triangle',.05],[110,.25,'sine',.05,.1]],
    win: [[392,.12,'sine',.045],[523,.12,'sine',.045,.09],[659,.18,'sine',.05,.18]]
  };
  (map[kind] || map.click).forEach((args) => audio.tone(...args));
}

function getClickableScreen(type) {
  const item = activeItems().filter((entry) => !type || entry.type === type).find(isReachable);
  if (!item) return null;
  const pos = item.object.getWorldPosition(new THREE.Vector3()).project(camera);
  return { x: (pos.x + 1) * .5 * innerWidth, y: (-pos.y + 1) * .5 * innerHeight, id: item.id, type: item.type };
}

if (new URLSearchParams(location.search).has('test')) {
  window.__CATFISH_DEBUG__ = {
    start: (id) => startGame(id),
    snapshot: () => ({ mode: state.mode, difficulty: state.difficulty.id, tray: [...state.tray], active: activeItems().length, shakeLeft: state.shakeLeft, patrol: state.patrol, patrolHandled: state.patrolHandled, tutorialStep: state.tutorialStep, reaction: state.activeReaction?.kind || null, targetVisible: Boolean(targetFish?.visible), effects: effects.length, seenItems: [...(save.seenItems || [])], bgmActive: Boolean(audio.bgmTimer), audioState: audio.context?.state || 'idle', revived: state.revived }),
    getClickableScreen,
    pickType: (type) => { const item = activeItems().filter((entry) => entry.type === type).find(isReachable); if (item) pickItem(item); return Boolean(item); },
    spawnAndPick: (type) => { const item = createGameItem(type, { x: 0, y: .72, z: 1.15, rot: [0, 0, 0], layer: 99 }); state.items.push(item); itemGroup.add(item.object); pickItem(item); return state.activeReaction?.kind || null; },
    react: (kind) => { catReact(kind); return state.activeReaction?.kind || null; },
    triggerPatrol,
    catchTarget: catchTargetFish,
    fillToFail: () => { state.tray = ['carp','loach','yellowfish','ginger','garlic','chopsticks','cap']; renderTray(); resolveTray(); },
    clearToWin: () => { activeItems().forEach((item) => { item.active = false; item.object.visible = false; }); afterBoardChange(); finishGame(true, 'perfect'); },
    revive: reviveGame,
    shake: shakeBowl,
    measureFps: (duration = 1000) => new Promise((resolve) => {
      let frames = 0;
      const started = performance.now();
      const sample = (now) => {
        frames += 1;
        if (now - started >= duration) resolve(Math.round(frames * 1000 / (now - started)));
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }),
    resetSave: () => { save = structuredClone(defaultSave); persist(); location.reload(); }
  };
}
