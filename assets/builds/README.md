# Imágenes de builds

Las imágenes se publican mediante URLs web directas y el embed las muestra con `EmbedBuilder#setImage(url)`. El bot no adjunta archivos locales ni utiliza referencias `attachment://`.

El mapa `BUILD_IMAGE_URL_BY_ROLE` está en:

```text
src/discord/buildPresentation.ts
```

La imagen inicial incluida es:

- `05-bear-paws-x2.png`: PNG optimizado de 500×326 para el rol `Bear Paws (x2)`.

Se eligió PNG porque las builds contienen texto pequeño, iconos y bordes que pierden claridad con JPEG. El archivo pesa aproximadamente 26 KB, por lo que no supone una carga relevante para el embed.

Antes de integrarse, cada PNG debe superar `pnpm run images:validate`. La validación comprueba firma, CRC de todos los chunks, descompresión `IDAT` completa, dimensiones y tamaño máximo. Así se detectan archivos truncados aunque el encabezado o el MIME parezcan válidos.

Para agregar otra build, sube un PNG optimizado y registra su URL pública directa en `BUILD_IMAGE_URL_BY_ROLE`, usando exactamente el nombre del rol como clave.
