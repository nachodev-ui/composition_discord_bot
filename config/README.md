# Catálogo histórico de builds

`builds.json` ya no es la fuente de verdad del bot.

Se conserva temporalmente para importar las 20 builds existentes a PostgreSQL/Neon mediante:

```powershell
pnpm run db:import-legacy
```

El runtime nuevo obtiene el catálogo desde `/api/v1/builds`, respaldado por PostgreSQL.

Los campos `imagePath` presentes en este JSON pertenecen al enfoque anterior y son ignorados por el importador. Las imágenes nuevas se generan desde el panel y se almacenan en `build_images`.

Una vez validada la migración de producción, este archivo podrá retirarse en un cambio posterior.
