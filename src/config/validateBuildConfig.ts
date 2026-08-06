import 'dotenv/config';
import { BuildCatalog } from '../services/buildCatalog.js';

const configPath = process.env.BUILD_CONFIG_PATH?.trim() || 'config/builds.json';
const catalog = BuildCatalog.load(configPath);

console.log(
  JSON.stringify(
    {
      valid: true,
      version: catalog.version,
      enabledBuilds: catalog.all.length,
      numbers: catalog.all.map((build) => build.number),
    },
    null,
    2,
  ),
);
