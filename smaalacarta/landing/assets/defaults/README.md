# Imágenes predeterminadas de productos

Fotos que el menú público muestra en un producto sin foto propia, elegidas por coincidencia con su nombre
(tabla `default_images`, ver `docs/SPEC.md`: ADMIN-SUPER-17 a 27 y PUBLICO-51 a 57). Son genéricas, no del
producto del negocio, y por eso el menú las marca como «Imagen ilustrativa».

## Atribución

Los archivos `.jpg` son fotos de [Pexels](https://www.pexels.com), licencia gratuita que permite el uso comercial
sin atribución (https://www.pexels.com/license/). Se bajaron recortadas a 400×400. El archivo se llama como el
emoji que reemplaza (`pizza.jpg`, `hot-dog.jpg`, `te-taza.jpg`…) y varios productos comparten foto. El número es el
id en Pexels (`https://www.pexels.com/photo/<id>`):

| Archivo | Id en Pexels |
| --- | --- |
| agua.jpg | 31012799 |
| anana.jpg | 37284807 |
| arroz.jpg | 19141541 |
| arroz-curry.jpg | 19141541 |
| baguette.jpg | 6375554 |
| banana.jpg | 7194965 |
| batata.jpg | 7456548 |
| bento.jpg | 5971975 |
| bubbletea.jpg | 14267667 |
| burrito.jpg | 37923420 |
| cafe.jpg | 27860686 |
| camaron.jpg | 11160096 |
| carne.jpg | 27305335 |
| carne-hueso.jpg | 8250702 |
| cerveza.jpg | 5858219 |
| cervezas.jpg | 13229769 |
| champagne.jpg | 5834736 |
| choclo.jpg | 12987562 |
| chocolate.jpg | 4113363 |
| coctel.jpg | 35087284 |
| cubiertos.jpg | 12824418 |
| cucurucho.jpg | 7761650 |
| cumple.jpg | 12616001 |
| cupcake.jpg | 18485395 |
| dona.jpg | 590771 |
| durazno.jpg | 9265739 |
| empanada.jpg | 36905236 |
| ensalada.jpg | 20085552 |
| espumante.jpg | 5834736 |
| flan.jpg | 34474024 |
| focaccia.jpg | 33657315 |
| fruta.jpg | 10821202 |
| frutilla.jpg | 18018686 |
| galleta.jpg | 5847103 |
| gaseosa.jpg | 33469209 |
| granizado.jpg | 11427521 |
| hamburguesa.jpg | 27988502 |
| helado.jpg | 29269196 |
| hongos.jpg | 15658679 |
| hot-dog.jpg | 29476591 |
| huevo.jpg | 722223 |
| jugo.jpg | 30900665 |
| licuado.jpg | 34711204 |
| limon.jpg | 2622185 |
| llevar.jpg | 9685241 |
| mani.jpg | 4590484 |
| mate.jpg | 25436250 |
| medialuna.jpg | 30403209 |
| miel.jpg | 13246534 |
| naranja.jpg | 8639570 |
| palta.jpg | 27462724 |
| pan.jpg | 1383908 |
| panceta.jpg | 6864354 |
| panqueque.jpg | 35487016 |
| papa.jpg | 33873564 |
| papas-fritas.jpg | 15754939 |
| pasta.jpg | 546945 |
| pescado.jpg | 8352777 |
| pizza.jpg | 31587831 |
| pochoclo.jpg | 7234390 |
| pollo.jpg | 12118977 |
| queso.jpg | 34278817 |
| ramen.jpg | 15403396 |
| sandia.jpg | 12932797 |
| sandwich.jpg | 24796900 |
| shawarma.jpg | 37923420 |
| sopa.jpg | 34822475 |
| sushi.jpg | 34313381 |
| taco.jpg | 5837196 |
| tarta.jpg | 31882545 |
| te.jpg | 35395714 |
| te-taza.jpg | 35395714 |
| tomate.jpg | 29479888 |
| torta.jpg | 10249461 |
| tropical.jpg | 13004099 |
| uva.jpg | 31782681 |
| verduras.jpg | 7676044 |
| vino.jpg | 14465764 |
| waffle.jpg | 19664626 |
| whisky.jpg | 19539063 |
| zanahoria.jpg | 17446132 |

## Dónde se sirven

`landing/` publica esta carpeta en `https://www.smaalacarta.com.ar/assets/defaults/<nombre>.jpg`. Esa dirección es
la que guarda `default_images.image_url` (migración `*_imagenes_predeterminadas_fotos.sql`). Para cambiar una foto
se reemplaza el archivo con el mismo nombre, o se carga otra desde `/superadmin/imagenes` (bucket `default-images`).

## Los `.svg` (Noto Emoji)

Los `.svg` y el `LICENSE` son los emojis de **Noto Emoji** de Google (Apache 2.0) que se usaron antes. Ya no los
referencia ninguna fila una vez aplicada la migración de fotos; se pueden borrar cuando esa migración esté en todas
las bases (se dejan hasta entonces para no romper una base que todavía tenga las direcciones viejas).
`admin/scripts/seed-default-images.mjs` es el generador del seed original con emojis: no se vuelve a correr.
