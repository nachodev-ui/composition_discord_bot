# Albion Composition Platform

Plataforma en **TypeScript + discord.js + Fastify + PostgreSQL** para administrar builds y composiciones de Albion Online desde una interfaz web y sincronizarlas con un bot de Discord.

El objetivo de esta versión es que crear o modificar una build **no requiera editar TypeScript, mapas hardcodeados ni subir imágenes al repositorio**.

## Arquitectura

```text
┌──────────────────────────────┐
│       Panel /admin           │
│ CRUD builds/composiciones    │
│ generar PNG / publicar       │
└──────────────┬───────────────┘
               │ Bearer ADMIN_TOKEN
               ▼
┌──────────────────────────────┐
│        Fastify API           │
│ /api/admin/*                 │
│ /api/v1/builds               │
│ /media/builds/:id.png        │
└──────────┬──────────┬────────┘
           │          │
           │          └──────────────┐
           ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐
│ PostgreSQL / Neon   │   │ Albion item render  │
│ fuente de verdad    │   │ sprites de objetos  │
└──────────┬──────────┘   └──────────┬──────────┘
           │                         │
           │                  Sharp genera PNG
           │                         │
           └──────────────┬──────────┘
                          ▼
                 ┌──────────────────┐
                 │   Discord Bot    │
                 │ consume la API   │
                 │ roles / signup   │
                 │ Ver Build        │
                 │ publicaciones    │
                 └──────────────────┘
```

### Fuente única de verdad

PostgreSQL almacena:

- builds;
- equipamiento, habilidades, consumibles e Item IDs;
- estados `draft`, `ready`, `published`, `archived`;
- imágenes PNG generadas;
- versiones históricas de cada build;
- composiciones y sus puestos;
- publicaciones de Discord;
- asignaciones del signup;
- ID del mensaje persistente del panel de signup;
- auditoría administrativa.

El runtime ya no depende de `data/signup-state.json` ni de imágenes guardadas en `assets/builds`.

`config/builds.json` se conserva temporalmente **solo como fuente de migración** de las 20 builds históricas. El bot nuevo no lo usa como catálogo en producción.

## Panel administrativo

Con la aplicación iniciada:

```text
http://localhost:3000/admin
```

El panel permite:

- crear, editar y archivar builds;
- definir número, categoría y estado;
- asociar nombre e ID del rol de Discord;
- configurar arma, offhand, cabeza, pecho, pies, capa, comida y poción;
- registrar Q, W, E y pasivas;
- guardar Item IDs de Albion opcionales;
- generar automáticamente el PNG de la build;
- publicar una build en un canal de Discord;
- crear y editar composiciones;
- asociar builds a puestos de una composición;
- publicar una composición completa en Discord.

El panel no inserta los nombres o descripciones guardados mediante `innerHTML`; usa nodos de texto para evitar HTML persistente inyectado desde los datos.

## Generación automática de imágenes

`BuildImageGenerator` obtiene los sprites desde el renderer de Albion y genera un **PNG indexado y optimizado** con Sharp.

Para cada slot se sigue esta regla:

1. si existe un Item ID, se utiliza como identificador exacto;
2. si no existe, se intenta usar el nombre del objeto registrado en la build;
3. si el slot está vacío, se dibuja un placeholder.

Esto permite migrar las builds actuales sin tener que completar todos los Item IDs inmediatamente. Para tier o encantamiento específicos conviene guardar el identificador interno exacto.

Las imágenes finales no se commitean al repositorio. Se guardan en `build_images` y se publican mediante:

```text
GET /media/builds/:id.png
```

Cada regeneración incrementa `imageVersion` y la URL pública incorpora `?v=N` para evitar imágenes antiguas en caché de Discord.

## API

### Pública / consumida por el bot

```text
GET /api/v1/builds
GET /api/v1/builds/:number
GET /media/builds/:id.png
GET /healthz
GET /readyz
```

Solo se exponen al catálogo del bot las builds habilitadas con estado `ready` o `published`.

### Administrativa

Requiere:

```http
Authorization: Bearer <ADMIN_TOKEN>
```

Rutas principales:

```text
GET    /api/admin/builds
POST   /api/admin/builds
PUT    /api/admin/builds/:id
DELETE /api/admin/builds/:id
POST   /api/admin/builds/:id/generate-image
POST   /api/admin/builds/:id/publish

GET    /api/admin/compositions
POST   /api/admin/compositions
PUT    /api/admin/compositions/:id
DELETE /api/admin/compositions/:id
POST   /api/admin/compositions/:id/publish
```

`ADMIN_TOKEN` es la primera capa de autenticación administrativa. No debe reutilizar el token del bot ni guardarse en Git.

## Sincronización con Discord

El bot consume su propio endpoint `/api/v1/builds` mediante `BuildApiClient`.

Flujo:

```text
PostgreSQL
   ↓
Fastify API
   ↓
BuildApiClient
   ↓
BuildCatalog en memoria
   ↓
Signup / roles / Ver Build
```

El catálogo se refresca periódicamente según `BUILD_SYNC_SECONDS`. Además, una modificación hecha desde el panel provoca una actualización inmediata del catálogo y del mensaje de signup cuando Discord ya está conectado.

No existe `BUILD_IMAGE_URL_BY_ROLE`: la URL pertenece a la build persistida en PostgreSQL.

## Composiciones

Una composición es independiente de una build. Puede reutilizar builds existentes en distintos puestos:

```text
Brawl 20
├── 1 · Oathkeepers
├── 2 · Stillgaze Staff
├── 3 · Battle Bracers
├── 4 · Hallowfall
└── 5 · Bear Paws
```

`composition_slots` conserva posición, build, etiqueta opcional y cantidad requerida. El panel puede publicar la composición al canal almacenado en `discord_channel_id`.

## PostgreSQL / Neon

La migración inicial está versionada en:

```text
db/migrations/001_build_platform.sql
```

Tablas principales:

```text
builds
build_images
build_versions
compositions
composition_slots
build_publications
signup_assignments
bot_runtime_state
admin_audit_log
```

Después de aplicar la migración, las builds históricas pueden importarse una sola vez con:

```powershell
pnpm run db:import-legacy
```

El importador es idempotente por número: las builds que ya existan se omiten.

## Variables de entorno

Copia `.env.example` a `.env`:

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
ROLE_SELECTION_CHANNEL_ID=

DATABASE_URL=

ADMIN_TOKEN=
PUBLIC_BASE_URL=http://localhost:3000
INTERNAL_API_URL=http://127.0.0.1:3000
ALBION_RENDER_BASE_URL=https://render.albiononline.com/v1/item
LEGACY_BUILD_CONFIG_PATH=config/builds.json

ROLE_REPLACEMENT_ENABLED=true
AUTO_CREATE_MISSING_ROLES=false
AUTO_PUBLISH_PANEL=true
SELECTION_COOLDOWN_SECONDS=3
BUILD_SYNC_SECONDS=15

PORT=3000
LOG_LEVEL=info
```

### `PUBLIC_BASE_URL`

En producción debe ser una URL HTTPS accesible por Internet, porque Discord necesita descargar las imágenes del embed. Por ejemplo:

```text
https://bot.example.com
```

`localhost` solo sirve durante desarrollo local.

### `INTERNAL_API_URL`

Cuando API y bot corren en el mismo proceso puede mantenerse:

```text
http://127.0.0.1:3000
```

## Desarrollo local

Requisitos:

- Node.js 24+;
- pnpm 11;
- PostgreSQL compatible o Neon;
- `Message Content Intent` y `Server Members Intent` habilitados para el bot.

PowerShell:

```powershell
Copy-Item .env.example .env
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm run config:validate
pnpm run check
pnpm run commands:register
pnpm run dev
```

El `config:validate` solo comprueba que el catálogo histórico siga siendo importable; no lo convierte en fuente de verdad del runtime.

## Flujo de migración recomendado

1. Aplicar `db/migrations/001_build_platform.sql` a Neon.
2. Configurar `DATABASE_URL` y un `ADMIN_TOKEN` nuevo.
3. Ejecutar `pnpm run db:import-legacy` una vez.
4. Iniciar la aplicación.
5. Abrir `/admin` y comprobar las 20 builds.
6. Completar Item IDs exactos cuando sean necesarios.
7. Generar PNG desde el panel.
8. Marcar una build como `ready`.
9. Publicarla en un canal de prueba de Discord.
10. Una vez validado el flujo, retirar definitivamente el catálogo histórico en una migración posterior.

## Discord

Permisos recomendados:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Add Reactions
- Manage Roles
- Use Application Commands

Comandos existentes:

- `/panel`
- `/sincronizar-roles`
- `/rol numero`
- `/build numero`

El flujo normal sigue siendo: el jugador escribe el número del puesto, el bot asigna el rol, actualiza el signup y entrega el botón privado **Ver Build**.

## Pruebas y CI

```powershell
pnpm run check
```

Ejecuta:

- TypeScript sin emitir;
- pruebas unitarias;
- build de producción.

Las pruebas cubren, entre otras cosas:

- catálogo histórico de migración;
- parser de números;
- custom IDs de botones;
- exclusividad de puestos;
- presentación del panel;
- embeds de builds;
- UTF-8;
- URL/identificador del renderer de Albion.

GitHub Actions ejecuta el mismo flujo en pull requests y en `develop`/`main`.

## Limpieza realizada en esta arquitectura

Se retiraron del runtime:

- el mapa hardcodeado `rol → URL`;
- las imágenes de build almacenadas en el repositorio;
- el validador específico del PNG estático;
- el health server anterior, reemplazado por Fastify;
- el directorio de estado local `data/`;
- el volumen local de datos del contenedor.

El adaptador `SignupStateStore` de archivo se conserva por ahora únicamente para pruebas/compatibilidad histórica; producción utiliza `PostgresSignupStateStore`.
