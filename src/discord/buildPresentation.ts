import { EmbedBuilder } from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';

const EMBED_FIELD_LIMIT = 1_024;

/**
 * URL pública de la imagen obligatoria para cada rol de composición.
 *
 * Las imágenes se sirven como PNG optimizados desde una URL pública directa.
 * Cada archivo se valida por estructura y decodificación antes de integrarse,
 * para impedir que una imagen truncada llegue al embed de Discord.
 */
export const BUILD_IMAGE_URL_BY_ROLE: Readonly<Record<string, string>> = Object.freeze({
  'Bear Paws (x2)':
    'https://cdn.discordapp.com/attachments/1534778382636814486/1534810694166249542/image.png?ex=6a757b58&is=6a7429d8&hm=b975c2c5156c04df6cf5286721abef4a055be4f82eae9a5bfbacfc9fa3b003ac&',
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
