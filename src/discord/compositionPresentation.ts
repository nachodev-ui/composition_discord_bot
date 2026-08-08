import { EmbedBuilder } from 'discord.js';
import type { CompositionRecord } from '../db/postgresBuildRepository.js';

export function createCompositionPresentation(composition: CompositionRecord): EmbedBuilder {
  const lines = composition.slots.map((slot) => {
    const count = slot.requiredCount > 1 ? ` ×${slot.requiredCount}` : '';
    const label = slot.label ? ` — ${slot.label}` : '';
    return `**${slot.position}.** #${slot.buildNumber} · ${slot.buildName}${count}${label}`;
  });

  return new EmbedBuilder()
    .setColor(0xf2c94c)
    .setTitle(composition.name)
    .setDescription([
      composition.description ?? 'Composición obligatoria.',
      '',
      lines.length > 0 ? lines.join('\n') : '_Todavía no hay puestos configurados._',
    ].join('\n'))
    .setFooter({ text: `Categoría: ${composition.category} · Versión ${composition.version}` })
    .setTimestamp();
}
