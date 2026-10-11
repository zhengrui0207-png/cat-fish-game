import assert from 'node:assert/strict';
import { DIFFICULTIES, ITEM_TYPES, TARGET_FISH, generateTypeTriples, insertTray, resolveMatches, seededRandom } from '../src/game-logic.js';

const grouped = insertTray(['carp', 'loach', 'carp'], 'carp');
assert.deepEqual(grouped, ['carp', 'loach', 'carp', 'carp'], '同类物品应自动相邻插入');

const match = resolveMatches(grouped);
assert.equal(match.matched, 'carp', '三个同类应匹配');
assert.deepEqual(match.tray, ['loach'], '匹配后应仅移除三个同类');

const noMatch = resolveMatches(['carp', 'loach', 'garlic']);
assert.equal(noMatch.matched, null, '不同物品不应误消除');

for (const count of [27, 45, 72, 99]) {
  const items = generateTypeTriples(count, 0.1, seededRandom(count));
  assert.equal(items.length, count, `应生成 ${count} 个物品`);
  const counts = items.reduce((acc, type) => ({ ...acc, [type]: (acc[type] || 0) + 1 }), {});
  assert.ok(Object.values(counts).every((value) => value % 3 === 0), '物品池应保持三消可解');
}

assert.equal(new Set(Object.values(DIFFICULTIES).map((difficulty) => difficulty.bowl)).size, 4, '四档难度应使用四种可辨认的鱼盆');
assert.ok(Object.values(ITEM_TYPES).every((item) => item.name && item.effect && typeof item.edible === 'boolean'), '每个物品都应在图鉴中说明名称、作用与是否可食用');
assert.match(TARGET_FISH.effect, /始终藏在盆底/, '盆底大鱼应从开局起存在，而不是最后生成');

console.log('✓ 三消逻辑、槽位排序、四种盆型、物品图鉴与盆底大鱼测试通过');
