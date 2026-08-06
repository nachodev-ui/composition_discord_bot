# Imágenes de builds

Las imágenes se publican mediante URLs web directas y el embed las muestra con `EmbedBuilder#setImage(url)`. El bot ya no adjunta archivos locales ni utiliza referencias `attachment://`.

El mapa `BUILD_IMAGE_URL_BY_ROLE` está en:

```text
src/discord/buildPresentation.ts
```

La imagen inicial incluida en GitHub es:

- `05-bear-paws-x2.webp`: imagen original entregada para el rol `Bear Paws (x2)`.

Su URL pública utiliza `raw.githubusercontent.com`. Para agregar otra build, sube una imagen PNG/JPG/WebP a GitHub, Discord CDN o Imgur y registra la URL directa en `BUILD_IMAGE_URL_BY_ROLE` usando exactamente el nombre del rol como clave.

Si un rol no tiene URL registrada, el bot responde con un error explícito en vez de enviar un embed sin imagen.
