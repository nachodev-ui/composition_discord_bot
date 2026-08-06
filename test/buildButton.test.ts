import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBuildButtonCustomId,
  parseBuildButtonCustomId,
} from '../src/discord/buildButton.js';

test('crea y analiza el custom id del botón Ver Build', () => {
  const customId = createBuildButtonCustomId(5, '123456789012345678');

  assert.equal(customId, 'build:view:v1:5:123456789012345678');
  assert.deepEqual(parseBuildButtonCustomId(customId), {
    buildNumber: 5,
    assigneeUserId: '123456789012345678',
  });
});

test('rechaza custom ids ajenos o incompletos', () => {
  assert.equal(parseBuildButtonCustomId('otro:boton'), null);
  assert.equal(parseBuildButtonCustomId('build:view:v1:0:123456789012345678'), null);
  assert.equal(parseBuildButtonCustomId('build:view:v1:5:123'), null);
});
