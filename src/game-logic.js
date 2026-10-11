export const DIFFICULTIES = {
  easy: { id: 'easy', name: '小瓷碗', short: '简单', count: 27, layers: 3, special: 0.2, reward: 10, unlock: 0, color: '#4b93a3', spread: 2.35, bowl: 'porcelain' },
  normal: { id: 'normal', name: '搪瓷盆', short: '普通', count: 45, layers: 5, special: 0.14, reward: 20, unlock: 1, color: '#e2773f', spread: 2.9, bowl: 'enamel' },
  hard: { id: 'hard', name: '大澡盆', short: '困难', count: 72, layers: 8, special: 0.11, reward: 50, unlock: 3, color: '#5e8e7a', spread: 3.25, bowl: 'bath' },
  feast: { id: 'feast', name: '年夜饭大盆', short: '地狱', count: 99, layers: 10, special: 0.09, reward: 100, unlock: 6, color: '#bd4b3f', spread: 3.55, bowl: 'feast' }
};

export const ITEM_TYPES = {
  carp: { name: '鲫鱼', icon: '🐟', color: '#d99a48', kind: 'fish', edible: true, effect: '凑齐 3 条，小猫一口吃掉。' },
  loach: { name: '泥鳅', icon: '🐟', color: '#806047', kind: 'fish', edible: true, effect: '身体细滑，凑齐 3 条消除。' },
  yellowfish: { name: '黄辣丁', icon: '🐠', color: '#e1ba3d', kind: 'fish', edible: true, effect: '凑齐 3 条消除，连消可加奖励。' },
  minnow: { name: '麦穗鱼', icon: '🐟', color: '#67a4aa', kind: 'fish', edible: true, effect: '凑齐 3 条消除，水面上最容易捞。' },
  ginger: { name: '姜片', icon: '🫚', color: '#d49a45', kind: 'clutter', edible: false, effect: '不能吃，抓到后小猫会打喷嚏，占 1 格。' },
  garlic: { name: '蒜瓣', icon: '🧄', color: '#eadcb9', kind: 'clutter', edible: false, effect: '不能吃，小猫嫌弃眯眼，占 1 格。' },
  chopsticks: { name: '筷子', icon: '🥢', color: '#a94c36', kind: 'clutter', edible: false, effect: '不能吃，小猫会拨弄它，凑齐 3 双移走。' },
  cap: { name: '瓶盖', icon: '🔵', color: '#477fa5', kind: 'clutter', edible: false, effect: '不能吃，凑齐 3 个才能清出槽位。' },
  egg: { name: '鸡蛋', icon: '🥚', color: '#f0d296', kind: 'clutter', edible: false, effect: '会在盆里滚动，小猫用爪子轻轻拍住它。' },
  driedFish: { name: '小鱼干', icon: '🐟', color: '#efa94c', kind: 'special', edible: true, effect: '凑齐 3 个后，小猫吃嗨并额外消除一组。' },
  crab: { name: '小螃蟹', icon: '🦀', color: '#e85e48', kind: 'special', edible: false, effect: '夹到猫爪，触发甩爪并扫走表层 3–5 件物品。' },
  chili: { name: '小米辣', icon: '🌶️', color: '#d73b31', kind: 'special', edible: false, effect: '抓起就辣得小猫满地打滚；凑齐 3 个清空半槽。' },
  sock: { name: '臭袜子', icon: '🧦', color: '#718d78', kind: 'special', edible: false, effect: '不占槽位，小猫嫌弃地扔掉并带走邻近 1 件物品。' },
  yarn: { name: '毛线球', icon: '🧶', color: '#a65d96', kind: 'special', edible: false, effect: '小猫追着球跑，自动缠走 3 条相同的鱼。' },
  bomb: { name: '小炸弹', icon: '💣', color: '#34383a', kind: 'special', edible: false, effect: '炸黑小猫但不会受伤，同时炸走附近 4–6 条鱼。' }
};

export const TARGET_FISH = { name: '盆底大鱼', icon: '🐠', color: '#5e93a3', kind: 'target', edible: true, effect: '始终藏在盆底；当上层物品被移开后即可捞起通关。' };

export function insertTray(tray, type) {
  const next = [...tray];
  const last = next.lastIndexOf(type);
  next.splice(last >= 0 ? last + 1 : next.length, 0, type);
  return next;
}

export function resolveMatches(tray) {
  const counts = tray.reduce((map, type) => map.set(type, (map.get(type) || 0) + 1), new Map());
  const matched = [...counts].find(([, count]) => count >= 3)?.[0];
  if (!matched) return { tray: [...tray], matched: null };
  let removed = 0;
  return {
    matched,
    tray: tray.filter((type) => type !== matched || ++removed > 3)
  };
}

export function generateTypeTriples(count, specialRate, rng = Math.random) {
  const normal = ['carp', 'loach', 'yellowfish', 'minnow'];
  const clutter = ['ginger', 'garlic', 'chopsticks', 'cap', 'egg'];
  const special = ['driedFish', 'crab', 'chili', 'sock', 'yarn', 'bomb'];
  const result = [];
  for (let i = 0; i < Math.floor(count / 3); i += 1) {
    const roll = rng();
    const pool = roll < specialRate ? special : roll < 0.68 ? normal : clutter;
    const type = pool[Math.floor(rng() * pool.length)];
    result.push(type, type, type);
  }
  while (result.length < count) result.push(normal[Math.floor(rng() * normal.length)]);
  return shuffle(result, rng);
}

export function shuffle(list, rng = Math.random) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
