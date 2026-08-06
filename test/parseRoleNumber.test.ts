import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRoleNumber } from '../src/domain/parseRoleNumber.js';

test('acepta números positivos con espacios alrededor', () => {
  assert.equal(parseRoleNumber('7'), 7);
  assert.equal(parseRoleNumber('  20  '), 20);
  assert.equal(parseRoleNumber('001'), 1);
});

test('rechaza contenido que no sea únicamente un número', () => {
  assert.equal(parseRoleNumber('rol 7'), null);
  assert.equal(parseRoleNumber('7a'), null);
  assert.equal(parseRoleNumber('-1'), null);
  assert.equal(parseRoleNumber('0'), null);
  assert.equal(parseRoleNumber('1000'), null);
  assert.equal(parseRoleNumber(''), null);
});
