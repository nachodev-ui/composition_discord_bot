import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';

const EMBED_FIELD_LIMIT = 1_024;
const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Imágenes físicas verificadas dentro del repositorio.
 *
 * La build #5 utiliza el archivo local incluido en assets. Discord recibe el
 * archivo mediante AttachmentBuilder y el embed lo referencia con attachment://.
 */
const BUILD_IMAGE_BY_NUMBER: Readonly<Record<number, string>> = Object.freeze({
  5: 'assets/builds/05-bear-paws-x2.webp',
});

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

interface ResolvedBuildImage {
  absolutePath: string;
  fileName: string;
  required: boolean;
}

function resolveBuildImage(build: AlbionBuild): ResolvedBuildImage | null {
  const verifiedPath = BUILD_IMAGE_BY_NUMBER[build.number];
  const configuredPath = verifiedPath ?? build.imagePath;

  if (!configuredPath) {
    return null;
  }

  const absolutePath = resolve(PROJECT_ROOT, configuredPath);
  return {
    absolutePath,
    fileName: basename(absolutePath),
    required: verifiedPath !== undefined,
  };
}

export interface BuildPresentation {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
  attachedImageName: string | null;
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

  const files: AttachmentBuilder[] = [];
  let attachedImageName: string | null = null;
  const resolvedImage = resolveBuildImage(build);

  if (resolvedImage) {
    if (!existsSync(resolvedImage.absolutePath)) {
      if (resolvedImage.required) {
        throw new Error(
          `No se encontró la imagen obligatoria de la build #${build.number}: ` +
            resolvedImage.absolutePath,
        );
      }

      return { embeds: [embed], files, attachedImageName };
    }

    const attachment = new AttachmentBuilder(resolvedImage.absolutePath, {
      name: resolvedImage.fileName,
      description: `Build obligatoria #${build.number} ${build.discordRole.name}`,
    });

    files.push(attachment);
    attachedImageName = resolvedImage.fileName;
    embed.setImage(`attachment://${resolvedImage.fileName}`);
  }

  return { embeds: [embed], files, attachedImageName };
}
