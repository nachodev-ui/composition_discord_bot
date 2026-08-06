import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Publica o actualiza el signup numerado en el canal configurado.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
  new SlashCommandBuilder()
    .setName('build')
    .setDescription('Consulta una build de forma privada; el botón es el flujo principal.')
    .addIntegerOption((option) =>
      option
        .setName('numero')
        .setDescription('Número de la build que quieres consultar.')
        .setMinValue(1)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('rol')
    .setDescription('Alternativa al mensaje numérico para asignar un puesto.')
    .addIntegerOption((option) =>
      option
        .setName('numero')
        .setDescription('Número del puesto que quieres ocupar.')
        .setMinValue(1)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('sincronizar-roles')
    .setDescription('Crea o valida los roles configurados para todas las builds.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
].map((command) => command.toJSON());
