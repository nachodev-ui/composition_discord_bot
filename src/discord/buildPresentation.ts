import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';

const EMBED_FIELD_LIMIT = 1_024;

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

export interface BuildPresentation {
  embeds: EmbedBuilder[];
  files: AttachmentBuilder[];
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
        value: truncate(`**Poción:** ${build.consumables.potion}\n**Comida:** ${build.consumables.food}`),
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
  if (build.imagePath) {
    const absoluteImagePath = resolve(process.cwd(), build.imagePath);
    if (existsSync(absoluteImagePath)) {
      const fileName = basename(absoluteImagePath);
      files.push(new AttachmentBuilder(absoluteImagePath, { name: fileName }));
      embed.setImage(`attachment://${fileName}`);
    }
  }

  return { embeds: [embed], files };
}
