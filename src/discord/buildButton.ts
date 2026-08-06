import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

const BUILD_BUTTON_PREFIX = 'build:view:v1';

export interface BuildButtonData {
  buildNumber: number;
  assigneeUserId: string;
}

export function createBuildButtonCustomId(
  buildNumber: number,
  assigneeUserId: string,
): string {
  return `${BUILD_BUTTON_PREFIX}:${buildNumber}:${assigneeUserId}`;
}

export function parseBuildButtonCustomId(customId: string): BuildButtonData | null {
  const match = /^build:view:v1:(\d{1,3}):(\d{17,20})$/.exec(customId);
  if (!match) {
    return null;
  }

  const buildNumber = Number.parseInt(match[1]!, 10);
  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
    return null;
  }

  return {
    buildNumber,
    assigneeUserId: match[2]!,
  };
}

export function createBuildButtonRow(
  buildNumber: number,
  assigneeUserId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(createBuildButtonCustomId(buildNumber, assigneeUserId))
      .setLabel('Ver Build')
      .setEmoji('🧰')
      .setStyle(ButtonStyle.Primary),
  );
}
