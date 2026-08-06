# Composition Discord Bot — Albion Online

Bot de Discord en **TypeScript + discord.js 14** para administrar una composición mediante números, asignar roles y entregar builds obligatorias sin que el usuario tenga que escribir comandos adicionales.

## Flujo implementado

1. El bot publica un embed de signup con todos los puestos numerados.
2. El jugador escribe únicamente el número, por ejemplo `5`.
3. El bot valida que el puesto esté libre y que pueda administrar al miembro.
4. Retira el rol de composición anterior y asigna el nuevo.
5. Guarda la selección en `data/signup-state.json`.
6. Edita el mismo embed y añade `<@usuario>` al lado del puesto.
7. Reacciona al mensaje numérico con ✅.
8. Responde con un botón **Ver Build**.
9. Al pulsarlo, `interactionCreate` valida que el botón pertenezca al usuario y responde de forma efímera con equipamiento, habilidades e imagen.

Ejemplo del panel actualizado:

```text
5 — Bear Paws (x2): @Jugador
6 — Carving Sword: —
```

## Reglas del signup

- Cada número admite un solo usuario.
- Cada usuario mantiene un solo puesto activo.
- Cambiar de número libera automáticamente el puesto anterior.
- Dos selecciones simultáneas se serializan para impedir que dos usuarios ocupen el mismo número.
- Si el estado indica un ocupante que ya no está en el servidor o perdió el rol, el puesto se libera al intentar ocuparlo.
- Cuando un miembro abandona el servidor, su puesto se elimina del panel.

## Imagen incluida

Se añadió la imagen original entregada para:

```text
assets/builds/05-bear-paws-x2.webp
```

La entrada `#5` de `config/builds.json` ya apunta a esa ruta. Las demás builds continúan mostrando su información textual hasta que se añada el archivo indicado en su `imagePath`.

## Eventos de Discord

### `messageCreate`

`src/discord/messageHandler.ts`:

- filtra servidor y canal;
- interpreta el número;
- llama a `SignupService`;
- actualiza el panel;
- ejecuta `message.react('✅')`;
- responde con el botón **Ver Build**.

No se elimina el mensaje numérico correcto, porque debe conservar la reacción visible.

### Reacción de confirmación

La palomita no necesita un listener `messageReactionAdd`: el bot es quien añade la reacción directamente después de completar la operación. Para ello necesita **Add Reactions** y **Read Message History**.

### `interactionCreate`

`src/discord/interactionHandler.ts` distingue:

- comandos slash administrativos o de respaldo;
- botones cuyo `customId` tiene el formato `build:view:v1:<numero>:<usuario>`.

El botón solo funciona para el jugador al que fue entregado y mientras siga asignado a esa build. La respuesta utiliza `MessageFlags.Ephemeral`.

### `guildMemberRemove`

Libera el puesto persistido y vuelve a renderizar el panel cuando un jugador abandona el servidor.

## Estructura principal

```text
src/
├── config/
│   └── env.ts
├── discord/
│   ├── buildButton.ts
│   ├── buildPresentation.ts
│   ├── interactionHandler.ts
│   ├── messageHandler.ts
│   ├── panelPresentation.ts
│   └── signupPanelService.ts
├── domain/
│   ├── build.ts
│   ├── errors.ts
│   └── signupState.ts
├── services/
│   ├── roleAssignmentService.ts
│   ├── signupService.ts
│   └── signupStateStore.ts
└── index.ts
```

## Requisitos

- Node.js 24 o superior.
- pnpm 11.
- `Message Content Intent` habilitado.
- `Server Members Intent` habilitado.
- Rol del bot por encima de todos los roles de composición.

Permisos recomendados:

- View Channels
- Send Messages
- Embed Links
- Attach Files
- Read Message History
- Add Reactions
- Manage Roles
- Use Application Commands

El propietario del servidor no es administrable por bots; prueba la asignación automática con una cuenta normal.

## Variables de entorno

```dotenv
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
ROLE_SELECTION_CHANNEL_ID=

BUILD_CONFIG_PATH=config/builds.json
SIGNUP_STATE_PATH=data/signup-state.json
ROLE_REPLACEMENT_ENABLED=true
AUTO_CREATE_MISSING_ROLES=false
AUTO_PUBLISH_PANEL=true
SELECTION_COOLDOWN_SECONDS=3
PORT=3000
LOG_LEVEL=info
```

`data/signup-state.json` se crea automáticamente y está ignorado por Git.

## Instalación en Windows

```powershell
Copy-Item .env.example .env
corepack enable
corepack prepare pnpm@11.17.0 --activate
pnpm install
pnpm run config:validate
pnpm run commands:register
pnpm run check
pnpm run dev
```

`pnpm-workspace.yaml` autoriza únicamente el script de instalación de `esbuild`, evitando el error `ERR_PNPM_IGNORED_BUILDS` de pnpm 11.

## Comandos

- `/panel`: publica o actualiza el panel persistente.
- `/sincronizar-roles`: crea y valida roles faltantes.
- `/rol numero`: alternativa al mensaje numérico.
- `/build numero`: consulta de respaldo; el botón es el flujo normal del jugador.

## Pruebas

```powershell
pnpm run check
```

Incluye pruebas para:

- parser de números;
- catálogo de builds;
- identificadores de botones;
- persistencia y exclusividad de puestos;
- renderizado de la mención en el panel.
