import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_IMAGE_BYTES = 100_000;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validatePng(filePath) {
  const buffer = readFileSync(filePath);
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`${filePath}: pesa ${buffer.length} bytes; máximo permitido ${MAX_IMAGE_BYTES}.`);
  }
  if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath}: firma PNG inválida.`);
  }

  let offset = PNG_SIGNATURE.length;
  let header = null;
  let sawEnd = false;
  const compressedParts = [];

  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error(`${filePath}: chunk PNG truncado.`);
    }

    const length = buffer.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = typeStart + 4;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) {
      throw new Error(`${filePath}: el chunk declarado excede el tamaño real del archivo.`);
    }

    const typeBuffer = buffer.subarray(typeStart, dataStart);
    const type = typeBuffer.toString('ascii');
    const data = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([typeBuffer, data]));
    if (actualCrc !== expectedCrc) {
      throw new Error(`${filePath}: CRC inválido en el chunk ${type}.`);
    }

    if (type === 'IHDR') {
      if (header !== null || length !== 13) {
        throw new Error(`${filePath}: IHDR inválido o duplicado.`);
      }
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      compressedParts.push(data);
    } else if (type === 'IEND') {
      if (length !== 0) {
        throw new Error(`${filePath}: IEND debe estar vacío.`);
      }
      sawEnd = true;
      offset = chunkEnd;
      break;
    }

    offset = chunkEnd;
  }

  if (header === null || compressedParts.length === 0 || !sawEnd) {
    throw new Error(`${filePath}: faltan IHDR, IDAT o IEND.`);
  }
  if (offset !== buffer.length) {
    throw new Error(`${filePath}: contiene bytes adicionales después de IEND.`);
  }
  if (header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error(`${filePath}: usa parámetros PNG no admitidos por el validador.`);
  }

  const channelsByColorType = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]);
  const channels = channelsByColorType.get(header.colorType);
  if (channels === undefined) {
    throw new Error(`${filePath}: color type PNG ${header.colorType} no admitido.`);
  }

  const rowBytes = Math.ceil((header.width * channels * header.bitDepth) / 8);
  const inflated = inflateSync(Buffer.concat(compressedParts));
  const expectedInflatedBytes = header.height * (rowBytes + 1);
  if (inflated.length !== expectedInflatedBytes) {
    throw new Error(
      `${filePath}: datos de imagen incompletos; se esperaban ${expectedInflatedBytes} bytes y se obtuvieron ${inflated.length}.`,
    );
  }

  for (let row = 0; row < header.height; row += 1) {
    const filterByte = inflated[row * (rowBytes + 1)];
    if (filterByte > 4) {
      throw new Error(`${filePath}: filtro PNG inválido en la fila ${row}.`);
    }
  }

  if (basename(filePath) === '05-bear-paws-x2.png') {
    if (header.width !== 500 || header.height !== 326) {
      throw new Error(
        `${filePath}: dimensiones inesperadas ${header.width}x${header.height}; se esperaban 500x326.`,
      );
    }
  }

  console.log(
    `${filePath}: PNG válido, ${header.width}x${header.height}, ${buffer.length} bytes, decodificación completa.`,
  );
}

const files = process.argv.slice(2);
if (files.length === 0) {
  throw new Error('Uso: node scripts/validateBuildImages.mjs <imagen.png> [...]');
}
for (const filePath of files) {
  validatePng(filePath);
}
