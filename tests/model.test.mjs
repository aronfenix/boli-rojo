import test from 'node:test';
import assert from 'node:assert/strict';
import { profileKey, cleanProgress, mergeProgress, preserveAchievements } from '../src/model.js';

test('solo and pair profiles have stable, distinct identities', () => {
  assert.equal(profileKey('alba'), 'solo:alba');
  assert.equal(profileKey('alba', 'diego'), 'pair:alba:diego');
  assert.equal(profileKey('diego', 'alba'), 'pair:alba:diego');
  assert.throws(() => profileKey('alba', 'alba'));
});

test('progress rejects malformed and unbounded payloads', () => {
  assert.deepEqual(cleanProgress({ stars: [1, 2, 3, 0, 0, 1], best: {}, rebels: {}, diff: 'normal', seenIntro: true }).stars, [1, 2, 3, 0, 0, 1]);
  assert.throws(() => cleanProgress({ stars: [4, 0, 0, 0, 0, 0] }));
  assert.throws(() => cleanProgress({ stars: [0, 0, 0, 0, 0, 0], rebels: { x: 999 } }));
});

test('concurrent saves keep the highest achievements', () => {
  const a = { stars: [1, 0, 0, 0, 0, 0], best: { c1: 100 }, rebels: { vaca: 2 }, diff: 'normal', seenIntro: false };
  const b = { stars: [0, 2, 0, 0, 0, 0], best: { c1: 200 }, rebels: { vaca: 3 }, diff: 'turbo', seenIntro: true };
  assert.deepEqual(mergeProgress(a, b), { stars: [1, 2, 0, 0, 0, 0], best: { c1: 200 }, rebels: { vaca: 3 }, diff: 'normal', seenIntro: true });
});

test('later saves may reduce practice weight but cannot erase earned stars', () => {
  const newer = { stars: [0, 0, 0, 0, 0, 0], best: { c1: 90 }, rebels: { vaca: 1 }, diff: 'tranqui', seenIntro: false };
  const stored = { stars: [2, 0, 0, 0, 0, 0], best: { c1: 120 }, rebels: { vaca: 5 }, diff: 'normal', seenIntro: true };
  assert.deepEqual(preserveAchievements(newer, stored), { stars: [2, 0, 0, 0, 0, 0], best: { c1: 120 }, rebels: { vaca: 1 }, diff: 'tranqui', seenIntro: true });
});
