import { EmbedBuilder } from 'discord.js';
import type { SignupState } from '../domain/signupState.js';
import type { BuildCatalog } from '../services/buildCatalog.js';

export function createRolePanel(
  catalog: BuildCatalog,
  state: SignupState,
  channelId: string,
): EmbedBuilder {
  const lines = catalog.all.map((build) => {
    const assignment = state.assignments[String(build.number)];
    const assignee = assignment ? `<@${assignment.userId}>` : '—';
    return `**${build.number} — ${build.discordRole.name}:** ${assignee}`;
  });
  const filled = Object.keys(state.assignments).length;

  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('⚔️ Signup de composición y builds obligatorias')
    .setDescription(
      [
        `Escribe **solo el número** del puesto en <#${channelId}>.`,
        'Cuando se procese correctamente, tu mensaje recibirá ✅ y tu nombre aparecerá en esta lista.',
        'Después podrás usar el botón **Ver Build** sin escribir comandos adicionales.',
        '',
        ...lines,
      ].join('\n'),
    )
    .setFooter({
      text: `${filled}/${catalog.all.length} puestos ocupados · Actualización automática`,
    })
    .setTimestamp();
}
