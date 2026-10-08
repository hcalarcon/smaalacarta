# Imágenes predeterminadas de productos

Ilustraciones que el menú público muestra en un producto sin foto propia, elegidas por coincidencia con su nombre
(tabla `default_images`, ver `docs/SPEC.md`: ADMIN-SUPER-17 a 24 y PUBLICO-51 a 57).

## Atribución

Los archivos `.svg` son de **Noto Emoji** de Google (https://github.com/googlefonts/noto-emoji), licencia
**Apache 2.0** (el texto está en [`LICENSE`](LICENSE)). Se copiaron sin modificar desde `2D/svg/` del repositorio,
con el nombre cambiado de `emoji_u<código>.svg` a un nombre en español:

```bash
curl -O https://raw.githubusercontent.com/googlefonts/noto-emoji/main/2D/svg/emoji_u1f354.svg   # hamburguesa.svg
```

La tabla de correspondencia (nombre -> código Unicode) está en la migración
`admin/supabase/migrations/*_imagenes_predeterminadas.sql`, en los comentarios del seed.

## Dónde se sirven

`landing/` publica esta carpeta en `https://www.smaalacarta.com.ar/assets/defaults/<nombre>.svg`. Esa dirección es la
que guarda `default_images.image_url` en el seed. Más adelante se pueden reemplazar por fotos libres propias desde
`/superadmin/imagenes` (bucket `default-images`).

## Seed ampliado

`admin/scripts/seed-default-images.mjs` baja los emojis que faltan (`node scripts/seed-default-images.mjs` desde
`admin/`) y genera la migración `*_seed_imagenes_predeterminadas_ampliado.sql`. Cuando el nombre `<slug>.svg` ya lo
ocupaba otro emoji, el nuevo se guarda con otro nombre: `ramen.svg` (sopa), `te-taza.svg` (té) y `arroz-curry.svg`
(arroz). Los viejos `te.svg` y `arroz.svg` quedan sin usar.
