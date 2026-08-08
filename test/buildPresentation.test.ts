import assert from 'node:assert/strict';
import test from 'node:test';
import type { AlbionBuild } from '../src/domain/build.js';
import { createBuildPresentation } from '../src/discord/buildPresentation.js';

const bearPawsImageUrl = 'https://bot.example.com/media/builds/00000000-0000-4000-8000-000000000005.png?v=1';

const bearPawsBuild: AlbionBuild = {
  id: '00000000-0000-4000-8000-000000000005',
  number: 5,
  name: 'Bear Paws (x2) - Brawl - Small Scale',
  category: 'DPS cuerpo a cuerpo',
  status: 'ready',
  enabled: true,
  version: 3,
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
  itemIds: {},
  alternatives: null,
  sourceUrl: null,
  imageUrl: bearPawsImageUrl,
  imageVersion: 1,
  imagePath: null,
};

test('usa la URL de imagen persistida en la build', () => {
  const presentation = createBuildPresentation(bearPawsBuild);
  assert.equal(presentation.imageUrl, bearPawsImageUrl);
  assert.equal(presentation.embeds[0]?.toJSON().image?.url, bearPawsImageUrl);
});

test('permite una build sin imagen mientras está siendo configurada', () => {
  const presentation = createBuildPresentation({ ...bearPawsBuild, imageUrl: null });
  assert.equal(presentation.imageUrl, null);
  assert.equal(presentation.embeds[0]?.toJSON().image, undefined);
});

test('preserva emojis y acentos UTF-8 en el embed', () => {
  const embed = createBuildPresentation(bearPawsBuild).embeds[0]?.toJSON();
  assert.equal(embed?.fields?.[0]?.name, '⚔️ Arma');
  assert.equal(embed?.fields?.[1]?.name, '🪖 Cabeza');
  assert.equal(embed?.fields?.[4]?.name, '🧥 Capa');
  assert.equal(embed?.fields?.[5]?.name, '🧪 Consumibles');
  assert.equal(embed?.footer?.text, 'Categoría: DPS cuerpo a cuerpo · Versión 3');
  assert.doesNotMatch(JSON.stringify(embed), /Ã|â€|âš|ï¸|ðŸ|�/u);
});
