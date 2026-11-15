import test from 'node:test';
import assert from 'node:assert/strict';
import { state, on, off, emit } from '../src/shared/state.js';

test('estado inicial', () => {
  assert.equal(state.mode, 'intro');
});

test('on y emit entregan el payload a todos los handlers', () => {
  const seen = [];
  const a = (p) => seen.push(['a', p]);
  const b = (p) => seen.push(['b', p]);
  on('evt', a);
  on('evt', b);
  emit('evt', 7);
  assert.deepEqual(seen, [['a', 7], ['b', 7]]);
  off('evt', a);
  off('evt', b);
});

test('off da de baja y emit sin handlers no falla', () => {
  let count = 0;
  const h = () => count++;
  on('x', h);
  emit('x');
  off('x', h);
  emit('x');
  emit('nadie_escucha');
  off('nadie_escucha', h);
  assert.equal(count, 1);
});

test('un handler puede darse de baja durante emit', () => {
  let count = 0;
  const once = () => { count++; off('y', once); };
  on('y', once);
  emit('y');
  emit('y');
  assert.equal(count, 1);
});
