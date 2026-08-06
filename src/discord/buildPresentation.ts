import { EmbedBuilder } from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';

const EMBED_FIELD_LIMIT = 1_024;

/**
 * URL pública de la imagen obligatoria para cada rol de composición.
 *
 * Las imágenes se sirven desde jsDelivr usando una revisión inmutable del
 * repositorio de GitHub. Esto evita depender del filesystem del bot y también
 * evita problemas de caché o de proxy con raw.githubusercontent.com.
 */
export const BUILD_IMAGE_URL_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  'Bear Paws (x2)':
    'https://cdn.jsdelivr.net/gh/nachodev-ui/composition_discord_bot@ec482cdad5308271b5edf09428cc5b00360662fa/assets/builds/05-bear-paws-x2.webp',
});

export class BuildImageUrlNotConfiguredError extends Error {
  public constructor(roleName: string) {
    super(
      `No hay una URL de imagen configurada para el rol "${roleName}". ` +
        'Agrega una entrada en BUILD_IMAGE_URL_BY_ROLE.',
    );
    this.name = 'BuildImageUrlNotConfiguredError';
  }
}

function truncate(value: string, limit = EMBED_FIELD_LIMIT): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}

function formatArmorPiece(piece: {
  name: string;
  ability?: string | null;
  passive?: string | null;
}): string {
  return [
    `**Objeto:** ${piece.name}`,
    piece.ability ? `**Habilidad:** ${piece.ability}` : null,
    piece.passive ? `**Pasiva:** ${piece.passive}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join('\n');
}

function getBuildImageUrl(build: AlbionBuild): string {
  const imageUrl = BUILD_IMAGE_URL_BY_ROLE[build.discordRole.name];
  if (!imageUrl) {
    throw new BuildImageUrlNotConfiguredError(build.discordRole.name);
  }
  return imageUrl;
}

export interface BuildPresentation {
  embeds: EmbedBuilder[];
  imageUrl: string;
}

export function createBuildPresentation(build: AlbionBuild): BuildPresentation {
  const weaponLines = [
    `**Arma:** ${build.equipment.weapon.name}`,
    build.equipment.offhand ? `**Mano secundaria:** ${build.equipment.offhand}` : null,
    `**Q:** ${build.equipment.weapon.q}`,
    `**W:** ${build.equipment.weapon.w}`,
    `**E:** ${build.equipment.weapon.e}`,
    `**Pasiva:** ${build.equipment.weapon.passive}`,
  ].filter((value): value is string => value !== null);

  const imageUrl = getBuildImageUrl(build);
  const embed = new EmbedBuilder()
    .setColor(0xf2c94c)
    .setTitle(`#${build.number} · ${build.discordRole.name}`)
    .setDescription(
      `**Build obligatoria** para el rol **${build.discordRole.name}**. ` +
        'Usa exactamente las piezas y habilidades indicadas.',
    )
    .addFields(
      { name: '⚔️ Arma', value: truncate(weaponLines.join('\n')), inline: false },
      { name: '🪖 Cabeza', value: truncate(formatArmorPiece(build.equipment.head)), inline: true },
      { name: '🛡️ Pecho', value: truncate(formatArmorPiece(build.equipment.chest)), inline: true },
      { name: '🥾 Pies', value: truncate(formatArmorPiece(build.equipment.shoes)), inline: true },
      { name: '🧥 Capa', value: truncate(build.equipment.cape), inline: true },
      {
        name: '🧪 Consumibles',
        value: truncate(
          `**Poción:** ${build.consumables.potion}\n**Comida:** ${build.consumables.food}`,
        ),
        inline: true,
      },
    )
    .setImage(imageUrl)
    .setFooter({ text: `Categoría: ${build.category} · Configuración v1` })
    .setTimestamp();

  if (build.alternatives) {
    embed.addFields({
      name: 'Alternativas registradas',
      value: truncate(build.alternatives),
      inline: false,
    });
  }

  if (build.sourceUrl) {
    embed.setURL(build.sourceUrl);
  }

  return { embeds: [embed], imageUrl };
}
