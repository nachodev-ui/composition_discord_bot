import assert from 'node:assert/strict';
import test from 'node:test';
import { BuildCatalog } from '../src/services/buildCatalog.js';

test('carga las veinte builds iniciales sin números duplicados', () => {
  const catalog = BuildCatalog.load('config/builds.json');
  const numbers = catalog.all.map((build) => build.number);

  assert.equal(catalog.all.length, 20);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.deepEqual(numbers, Array.from({ length: 20 }, (_, index) => index + 1));
});

test('incluye equipo obligatorio y rol resoluble en cada build', () => {
  const catalog = BuildCatalog.load('config/builds.json');

  for (const build of catalog.all) {
    assert.ok(build.discordRole.name.length > 0);
    assert.ok(build.equipment.weapon.name.length > 0);
    assert.ok(build.equipment.head.name.length > 0);
    assert.ok(build.equipment.chest.name.length > 0);
    assert.ok(build.equipment.shoes.name.length > 0);
    assert.ok(build.equipment.cape.length > 0);
  }
});
