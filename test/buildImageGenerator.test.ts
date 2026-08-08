import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlbionBuild } from '../src/domain/build.js';
import { BuildImageGenerator } from '../src/services/buildImageGenerator.js';

const build: AlbionBuild = {
  id: '00000000-0000-4000-8000-000000000005',
  number: 5,
  name: 'Bear Paws (x2) - Brawl - Small Scale',
  category: 'DPS cuerpo a cuerpo',
  status: 'ready',
  enabled: true,
  version: 1,
  discordRole: { id: '', name: 'Bear Paws (x2)' },
  equipment: {
    weapon: { name: 'Bear Paws', q: 'Rending Rage', w: 'Adrenaline Boost', e: 'Razor Cut', passive: 'Increased Defense' },
    offhand: null,
    head: { name: 'Soldier Helmet', ability: 'Block', passive: 'Toughness' },
    chest: { name: 'Mistwalker Jacket', ability: 'Mist Cloud', passive: 'Balanced Mind' },
    shoes: { name: 'Stalker Shoes', ability: 'Raging Blink', passive: 'Balanced Mind' },
    cape: 'Smuggler Cape',
  },
  consumables: { potion: 'Major Gigantify Potion', food: 'Deadwater Eel Stew' },
  itemIds: { weapon: 'T8_2H_DUALAXE_KEEPER' },
  alternatives: null,
  sourceUrl: null,
  imageUrl: null,
  imageVersion: 0,
  imagePath: null,
};

const generator = new BuildImageGenerator('https://render.albiononline.com/v1/item/');

test('prioriza el item ID cuando existe', () => {
  assert.equal(generator.resolveItemIdentifier(build, 'weapon'), 'T8_2H_DUALAXE_KEEPER');
});

test('usa el nombre de Albion como fallback cuando no hay item ID', () => {
  assert.equal(generator.resolveItemIdentifier(build, 'head'), 'Soldier Helmet');
  assert.equal(generator.resolveItemIdentifier(build, 'potion'), 'Major Gigantify Potion');
  assert.equal(generator.resolveItemIdentifier(build, 'offhand'), null);
});

test('genera una URL directa y codificada para el renderer de Albion', () => {
  assert.equal(
    generator.itemImageUrl('Soldier Helmet'),
    'https://render.albiononline.com/v1/item/Soldier%20Helmet.png?quality=1&size=217&locale=en',
  );
});
