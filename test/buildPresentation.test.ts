import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlbionBuild } from '../src/domain/build.js';
import { createBuildPresentation } from '../src/discord/buildPresentation.js';

const bearPawsBuild: AlbionBuild = {
  number: 5,
  name: 'Bear Paws (x2) - Brawl - Small Scale',
  category: 'DPS cuerpo a cuerpo',
  enabled: true,
  discordRole: {
    id: '',
    name: 'Bear Paws (x2)',
  },
  equipment: {
    weapon: {
      name: 'Bear Paws',
      q: 'Rending Rage',
      w: 'Adrenaline Boost',
      e: 'Razor Cut',
      passive: 'Increased Defense',
    },
    offhand: null,
    head: {
      name: 'Soldier Helmet',
      ability: 'Block',
      passive: 'Toughness',
    },
    chest: {
      name: 'Mistwalker Jacket',
      ability: 'Mist Cloud',
      passive: 'Balanced Mind',
    },
    shoes: {
      name: 'Stalker Shoes',
      ability: 'Raging Blink',
      passive: 'Balanced Mind',
    },
    cape: 'Smuggler Cape',
  },
  consumables: {
    potion: 'Major Gigantify Potion',
    food: 'Deadwater Eel Stew',
  },
  alternatives: null,
  sourceUrl: null,
  imagePath: null,
};

test('la build número 5 adjunta y referencia su imagen física', () => {
  const presentation = createBuildPresentation(bearPawsBuild);

  assert.equal(presentation.files.length, 1);
  assert.equal(
    presentation.embeds[0]?.toJSON().image?.url,
    'attachment://05-bear-paws-x2.webp',
  );
});
