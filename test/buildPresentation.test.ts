import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlbionBuild } from '../src/domain/build.js';
import {
  BuildImageUrlNotConfiguredError,
  createBuildPresentation,
} from '../src/discord/buildPresentation.js';

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

const bearPawsImageUrl =
  'https://cdn.discordapp.com/attachments/1534778382636814486/1534810694166249542/image.png?ex=6a757b58&is=6a7429d8&hm=b975c2c5156c04df6cf5286721abef4a055be4f82eae9a5bfbacfc9fa3b003ac&';

test('la build número 5 usa una URL PNG directa en el embed', () => {
  const presentation = createBuildPresentation(bearPawsBuild);

  assert.equal(presentation.imageUrl, bearPawsImageUrl);
  assert.equal(presentation.embeds[0]?.toJSON().image?.url, bearPawsImageUrl);
});

test('preserva emojis y acentos UTF-8 en el embed', () => {
  const embed = createBuildPresentation(bearPawsBuild).embeds[0]?.toJSON();

  assert.equal(embed?.fields?.[0]?.name, '⚔️ Arma');
  assert.equal(embed?.fields?.[1]?.name, '🪖 Cabeza');
  assert.equal(embed?.fields?.[4]?.name, '🧥 Capa');
  assert.equal(embed?.fields?.[5]?.name, '🧪 Consumibles');
  assert.equal(embed?.footer?.text, 'Categoría: DPS cuerpo a cuerpo · Configuración v1');

  const serializedEmbed = JSON.stringify(embed);
  assert.doesNotMatch(serializedEmbed, /Ã|â€|âš|ï¸|ðŸ|�/u);
});

test('lanza un error claro cuando el rol no tiene URL asignada', () => {
  const buildWithoutImageUrl: AlbionBuild = {
    ...bearPawsBuild,
    number: 6,
    discordRole: {
      id: '',
      name: 'Carving Sword',
    },
  };

  assert.throws(
    () => createBuildPresentation(buildWithoutImageUrl),
    (error: unknown) => {
      assert.ok(error instanceof BuildImageUrlNotConfiguredError);
      assert.match(error.message, /Carving Sword/);
      return true;
    },
  );
});
