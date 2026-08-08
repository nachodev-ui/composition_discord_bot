import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { AlbionBuild } from '../domain/build.js';
import type { BuildImageRecord } from '../db/postgresBuildRepository.js';

const WIDTH = 540;
const HEIGHT = 540;
const ICON_SIZE = 140;

type ItemSlot = keyof AlbionBuild['itemIds'];

interface Cell {
  key: ItemSlot | 'empty';
  label: string;
  x: number;
  y: number;
}

interface ImageOverlay {
  input: Buffer;
  left: number;
  top: number;
}

const CELLS: readonly Cell[] = [
  { key: 'offhand', label: 'Offhand', x: 20, y: 20 },
  { key: 'head', label: 'Cabeza', x: 200, y: 20 },
  { key: 'cape', label: 'Capa', x: 380, y: 20 },
  { key: 'weapon', label: 'Arma', x: 20, y: 200 },
  { key: 'chest', label: 'Pecho', x: 200, y: 200 },
  { key: 'empty', label: 'Libre', x: 380, y: 200 },
  { key: 'potion', label: 'Poción', x: 20, y: 380 },
  { key: 'shoes', label: 'Pies', x: 200, y: 380 },
  { key: 'food', label: 'Comida', x: 380, y: 380 },
];

function emptyCell(label: string): Buffer {
  const svg = `
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="18" fill="#17191d"/>
      <path d="M42 42 L98 98 M98 42 L42 98" stroke="#7c838d" stroke-width="6" stroke-linecap="round"/>
      <text x="70" y="128" text-anchor="middle" fill="#8d949e" font-family="Arial" font-size="12">${label}</text>
    </svg>`;
  return Buffer.from(svg);
}

function itemNameForSlot(build: AlbionBuild, slot: ItemSlot): string | null {
  switch (slot) {
    case 'weapon': return build.equipment.weapon.name;
    case 'offhand': return build.equipment.offhand ?? null;
    case 'head': return build.equipment.head.name;
    case 'chest': return build.equipment.chest.name;
    case 'shoes': return build.equipment.shoes.name;
    case 'cape': return build.equipment.cape;
    case 'potion': return build.consumables.potion;
    case 'food': return build.consumables.food;
  }
}

export class BuildImageGenerator {
  readonly #renderBaseUrl: string;

  public constructor(renderBaseUrl: string) {
    this.#renderBaseUrl = renderBaseUrl.replace(/\/$/u, '');
  }

  public itemImageUrl(identifier: string): string {
    return `${this.#renderBaseUrl}/${encodeURIComponent(identifier)}.png?quality=1&size=217&locale=en`;
  }

  public resolveItemIdentifier(build: AlbionBuild, slot: ItemSlot): string | null {
    return build.itemIds[slot] ?? itemNameForSlot(build, slot);
  }

  public async generate(build: AlbionBuild): Promise<BuildImageRecord> {
    const background = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: '#15171a' },
    }).png().toBuffer();

    const overlays: ImageOverlay[] = [];
    for (const cell of CELLS) {
      if (cell.key === 'empty') {
        overlays.push({ input: emptyCell(cell.label), left: cell.x, top: cell.y });
        continue;
      }

      const identifier = this.resolveItemIdentifier(build, cell.key);
      if (!identifier) {
        overlays.push({ input: emptyCell(cell.label), left: cell.x, top: cell.y });
        continue;
      }

      const response = await fetch(this.itemImageUrl(identifier), {
        headers: { 'user-agent': 'composition-discord-bot/0.3' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`No se pudo descargar ${cell.label} (${identifier}): HTTP ${response.status}.`);
      }

      const raw = Buffer.from(await response.arrayBuffer());
      const icon = await sharp(raw)
        .resize(ICON_SIZE, ICON_SIZE, { fit: 'contain', withoutEnlargement: false })
        .png({ compressionLevel: 9, palette: true, colours: 128 })
        .toBuffer();
      overlays.push({ input: icon, left: cell.x, top: cell.y });
    }

    const data = await sharp(background)
      .composite(overlays)
      .png({ compressionLevel: 9, palette: true, colours: 128 })
      .toBuffer();

    const metadata = await sharp(data).metadata();
    return {
      data,
      contentType: 'image/png',
      width: metadata.width ?? WIDTH,
      height: metadata.height ?? HEIGHT,
      byteSize: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
    };
  }
}
