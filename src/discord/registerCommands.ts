import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadEnvironment } from '../config/env.js';
import { commandDefinitions } from './commands.js';

const environment = loadEnvironment();
const rest = new REST({ version: '10' }).setToken(environment.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(
    environment.DISCORD_CLIENT_ID,
    environment.DISCORD_GUILD_ID,
  ),
  { body: commandDefinitions },
);

console.log(`Registrados ${commandDefinitions.length} comandos en el servidor configurado.`);
