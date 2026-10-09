-- Seed ampliado de imágenes predeterminadas (ADMIN-SUPER-26). Generado por
-- `admin/scripts/seed-default-images.mjs`: no se edita a mano.
--
-- Parte de `20261012000000_imagenes_predeterminadas.sql` (el seed inicial) y de
-- `20261014000000_imagenes_predeterminadas_nombre_unico.sql` (la clave única por nombre):
-- - Una fila cuyo nombre ya existe suma sus palabras clave a esa entrada (`ON CONFLICT`) y deja
--   su prioridad. La imagen es la de la fila (la misma, salvo en las pocas entradas que cambian de emoji).
-- - Una fila nueva se inserta con prioridad 0 (salvo la torta de cumpleaños, que necesita 2). Sus palabras clave se le quitan a las demás entradas
--   para que no compitan con una más genérica con más prioridad.
-- - Las palabras clave se normalizan solas (trigger `default_images_normalize`).
-- - Se puede correr más de una vez: el resultado es el mismo.
INSERT INTO public.default_images (name, keywords, image_url, priority)
VALUES
  ('Hamburguesa', ARRAY['hamburguesa', 'burger', 'hamburguesa completa', 'cheeseburger'], 'https://www.smaalacarta.com.ar/assets/defaults/hamburguesa.svg', 0),
  ('Pizza', ARRAY['pizza', 'muzzarella', 'muzzarela', 'fugazzeta', 'napolitana pizza', 'calabresa', 'margarita'], 'https://www.smaalacarta.com.ar/assets/defaults/pizza.svg', 0),
  ('Focaccia', ARRAY['focaccia', 'foccacia', 'fugazza', 'pan plano'], 'https://www.smaalacarta.com.ar/assets/defaults/focaccia.svg', 0),
  ('Choripán', ARRAY['pancho', 'hot dog', 'panchos', 'choripan', 'chorizo', 'salchicha'], 'https://www.smaalacarta.com.ar/assets/defaults/hot-dog.svg', 0),
  ('Papas fritas', ARRAY['papas fritas', 'papa frita', 'fritas', 'bastones', 'provenzal', 'cheddar y panceta papas'], 'https://www.smaalacarta.com.ar/assets/defaults/papas-fritas.svg', 0),
  ('Sándwich', ARRAY['sandwich', 'sanguche', 'lomito', 'tostado', 'miga', 'milanesa sandwich', 'pan relleno'], 'https://www.smaalacarta.com.ar/assets/defaults/sandwich.svg', 0),
  ('Tacos', ARRAY['taco', 'tacos', 'nachos', 'quesadilla'], 'https://www.smaalacarta.com.ar/assets/defaults/taco.svg', 0),
  ('Burritos y wraps', ARRAY['wrap', 'burrito', 'enrollado', 'shawarma', 'kebab'], 'https://www.smaalacarta.com.ar/assets/defaults/burrito.svg', 0),
  ('Empanada', ARRAY['empanada', 'empanadas', 'tarteleta pequena', 'pastelito', 'calzone'], 'https://www.smaalacarta.com.ar/assets/defaults/empanada.svg', 0),
  ('Bife', ARRAY['bife', 'lomo', 'entrecot', 'asado de tira', 'vacio', 'ojo de bife', 'milanesa', 'milanesa napolitana', 'suprema', 'cuadril', 'carne'], 'https://www.smaalacarta.com.ar/assets/defaults/carne.svg', 0),
  ('Parrilla', ARRAY['parrilla', 'asado', 'costillas', 'choripanes parrilla', 'picada', 'chinchulin', 'morcilla'], 'https://www.smaalacarta.com.ar/assets/defaults/carne-hueso.svg', 0),
  ('Pollo', ARRAY['pollo', 'pata muslo', 'alitas', 'nuggets', 'supremas de pollo', 'pechuga'], 'https://www.smaalacarta.com.ar/assets/defaults/pollo.svg', 0),
  ('Cerdo y fiambres', ARRAY['panceta', 'bacon', 'tocino', 'jamon crudo'], 'https://www.smaalacarta.com.ar/assets/defaults/panceta.svg', 0),
  ('Huevo', ARRAY['huevo', 'huevos', 'revuelto', 'tortilla', 'omelette'], 'https://www.smaalacarta.com.ar/assets/defaults/huevo.svg', 0),
  ('Pan', ARRAY['pan', 'pan casero', 'tostadas', 'pan de campo'], 'https://www.smaalacarta.com.ar/assets/defaults/pan.svg', 0),
  ('Medialuna', ARRAY['medialuna', 'medialunas', 'croissant', 'factura', 'facturas'], 'https://www.smaalacarta.com.ar/assets/defaults/medialuna.svg', 0),
  ('Baguette y tostadas', ARRAY['baguette', 'pan frances', 'flautita', 'bagette'], 'https://www.smaalacarta.com.ar/assets/defaults/baguette.svg', 0),
  ('Queso', ARRAY['queso', 'quesos', 'provoleta', 'muzzarella queso', 'tabla de quesos', 'fondue'], 'https://www.smaalacarta.com.ar/assets/defaults/queso.svg', 0),
  ('Ensalada', ARRAY['ensalada', 'ensaladas', 'bowl', 'verduras', 'vegetariano', 'vegano', 'caesar'], 'https://www.smaalacarta.com.ar/assets/defaults/ensalada.svg', 0),
  ('Pasta', ARRAY['pasta', 'pastas', 'fideos', 'tallarines', 'espagueti', 'spaghetti', 'noquis', 'ravioles', 'sorrentinos', 'canelones', 'lasagna', 'lasana'], 'https://www.smaalacarta.com.ar/assets/defaults/pasta.svg', 0),
  ('Sopa', ARRAY['sopa', 'caldo', 'ramen', 'fideos orientales', 'wok'], 'https://www.smaalacarta.com.ar/assets/defaults/ramen.svg', 0),
  ('Guiso', ARRAY['guiso', 'locro', 'cazuela', 'estofado', 'carbonada', 'puchero'], 'https://www.smaalacarta.com.ar/assets/defaults/sopa.svg', 0),
  ('Arroz', ARRAY['arroz', 'risotto', 'curry', 'paella', 'arroz con pollo'], 'https://www.smaalacarta.com.ar/assets/defaults/arroz-curry.svg', 0),
  ('Sushi', ARRAY['sushi', 'roll', 'rolls', 'nigiri', 'sashimi', 'maki', 'temaki'], 'https://www.smaalacarta.com.ar/assets/defaults/sushi.svg', 0),
  ('Combo', ARRAY['combo', 'box', 'bandeja', 'menu ejecutivo', 'promo almuerzo', 'tabla'], 'https://www.smaalacarta.com.ar/assets/defaults/bento.svg', 0),
  ('Mariscos', ARRAY['rabas', 'langostinos', 'camarones', 'gambas', 'mariscos', 'fritura de mar'], 'https://www.smaalacarta.com.ar/assets/defaults/camaron.svg', 0),
  ('Pescado', ARRAY['pescado', 'merluza', 'salmon', 'trucha', 'pejerrey', 'lenguado', 'filet de pescado'], 'https://www.smaalacarta.com.ar/assets/defaults/pescado.svg', 0),
  ('Tarta', ARRAY['tarta', 'tartas', 'torta salada', 'quiche', 'pastel de papa', 'pastelera', 'pascualina'], 'https://www.smaalacarta.com.ar/assets/defaults/tarta.svg', 0),
  ('Torta', ARRAY['torta', 'tortas', 'porcion de torta', 'cheesecake', 'lemon pie', 'tiramisu', 'brownie', 'chocotorta', 'rogel'], 'https://www.smaalacarta.com.ar/assets/defaults/torta.svg', 0),
  ('Torta de cumpleaños', ARRAY['torta de cumpleanos', 'torta decorada', 'torta personalizada'], 'https://www.smaalacarta.com.ar/assets/defaults/cumple.svg', 2),
  ('Cupcake y muffin', ARRAY['muffin', 'cupcake', 'magdalena', 'budin', 'bizcochuelo'], 'https://www.smaalacarta.com.ar/assets/defaults/cupcake.svg', 0),
  ('Donas y churros', ARRAY['dona', 'donas', 'donut', 'berlinesa', 'bola de fraile'], 'https://www.smaalacarta.com.ar/assets/defaults/dona.svg', 0),
  ('Alfajor', ARRAY['galletita', 'galletitas', 'cookie', 'cookies', 'alfajor', 'alfajores', 'pepas', 'vigilante'], 'https://www.smaalacarta.com.ar/assets/defaults/galleta.svg', 0),
  ('Chocolate', ARRAY['chocolate', 'bombon', 'bombones', 'barra de chocolate'], 'https://www.smaalacarta.com.ar/assets/defaults/chocolate.svg', 0),
  ('Helado', ARRAY['helado', 'helados', 'gelato', 'kilo de helado', 'copa helada', 'sundae', 'bochas'], 'https://www.smaalacarta.com.ar/assets/defaults/helado.svg', 0),
  ('Cucurucho', ARRAY['cucurucho', 'cono', 'soft', 'helado de maquina'], 'https://www.smaalacarta.com.ar/assets/defaults/cucurucho.svg', 0),
  ('Granizado', ARRAY['granizado', 'raspado', 'frozen', 'slush'], 'https://www.smaalacarta.com.ar/assets/defaults/granizado.svg', 0),
  ('Flan y postres', ARRAY['flan', 'flan con dulce de leche', 'postre', 'postres', 'panna cotta', 'budin de pan'], 'https://www.smaalacarta.com.ar/assets/defaults/flan.svg', 0),
  ('Miel y dulce de leche', ARRAY['miel', 'dulce de leche', 'mermelada'], 'https://www.smaalacarta.com.ar/assets/defaults/miel.svg', 0),
  ('Panqueque', ARRAY['panqueque', 'panqueques', 'crepe', 'crepes', 'hotcakes'], 'https://www.smaalacarta.com.ar/assets/defaults/panqueque.svg', 0),
  ('Waffle', ARRAY['waffle', 'waffles'], 'https://www.smaalacarta.com.ar/assets/defaults/waffle.svg', 0),
  ('Café', ARRAY['cafe', 'cafes', 'cortado', 'capuchino', 'latte', 'lagrima', 'espresso', 'submarino', 'mocca'], 'https://www.smaalacarta.com.ar/assets/defaults/cafe.svg', 0),
  ('Té', ARRAY['te', 'mate cocido', 'infusion', 'tisana', 'mate', 'chai'], 'https://www.smaalacarta.com.ar/assets/defaults/te-taza.svg', 0),
  ('Bubble tea', ARRAY['bubble tea', 'te frio', 'boba', 'te helado'], 'https://www.smaalacarta.com.ar/assets/defaults/bubbletea.svg', 0),
  ('Gaseosa', ARRAY['gaseosa', 'gaseosas', 'coca cola', 'pepsi', 'sprite', 'fanta', 'refresco', 'bebida', 'soda'], 'https://www.smaalacarta.com.ar/assets/defaults/gaseosa.svg', 0),
  ('Jugo', ARRAY['jugo', 'jugos', 'exprimido', 'naranjada', 'limonada', 'licuado de frutas'], 'https://www.smaalacarta.com.ar/assets/defaults/jugo.svg', 0),
  ('Licuado', ARRAY['leche', 'licuado', 'malteada', 'batido', 'milkshake'], 'https://www.smaalacarta.com.ar/assets/defaults/licuado.svg', 0),
  ('Cerveza', ARRAY['cerveza', 'cervezas', 'ipa', 'lager', 'stout', 'honey', 'pinta', 'chopp', 'artesanal'], 'https://www.smaalacarta.com.ar/assets/defaults/cerveza.svg', 0),
  ('Tirada de cervezas', ARRAY['tirada de cervezas', 'jarra de cerveza', 'pitcher', 'cervezas por tanda'], 'https://www.smaalacarta.com.ar/assets/defaults/cervezas.svg', 0),
  ('Vino', ARRAY['vino', 'vinos', 'malbec', 'tinto', 'blanco', 'rosado', 'copa de vino', 'cabernet'], 'https://www.smaalacarta.com.ar/assets/defaults/vino.svg', 0),
  ('Cóctel', ARRAY['trago', 'tragos', 'coctel', 'cocktail', 'fernet', 'gin tonic', 'aperol', 'campari', 'negroni', 'mojito'], 'https://www.smaalacarta.com.ar/assets/defaults/coctel.svg', 0),
  ('Trago tropical', ARRAY['trago tropical', 'caipirinha', 'daiquiri', 'sangria', 'piña colada'], 'https://www.smaalacarta.com.ar/assets/defaults/tropical.svg', 0),
  ('Espumante', ARRAY['espumante', 'champagne', 'brindis', 'sidra'], 'https://www.smaalacarta.com.ar/assets/defaults/espumante.svg', 0),
  ('Destilados', ARRAY['whisky', 'wisky', 'ron', 'vodka', 'tequila', 'licor'], 'https://www.smaalacarta.com.ar/assets/defaults/whisky.svg', 0),
  ('Agua', ARRAY['agua', 'agua mineral', 'agua con gas', 'agua sin gas', 'soda sifon'], 'https://www.smaalacarta.com.ar/assets/defaults/agua.svg', 0),
  ('Fruta', ARRAY['fruta', 'frutas', 'manzana', 'ensalada de frutas', 'postre de frutas'], 'https://www.smaalacarta.com.ar/assets/defaults/fruta.svg', 0),
  ('Banana', ARRAY['banana', 'bananas', 'licuado de banana'], 'https://www.smaalacarta.com.ar/assets/defaults/banana.svg', 0),
  ('Frutilla', ARRAY['frutilla', 'frutillas', 'frutos rojos', 'arandanos', 'frambuesa'], 'https://www.smaalacarta.com.ar/assets/defaults/frutilla.svg', 0),
  ('Uva', ARRAY['uva', 'uvas', 'pasas'], 'https://www.smaalacarta.com.ar/assets/defaults/uva.svg', 0),
  ('Naranja', ARRAY['naranja', 'mandarina', 'pomelo'], 'https://www.smaalacarta.com.ar/assets/defaults/naranja.svg', 0),
  ('Limonada', ARRAY['limon', 'limonada', 'lima'], 'https://www.smaalacarta.com.ar/assets/defaults/limon.svg', 0),
  ('Sandía', ARRAY['sandia', 'melon'], 'https://www.smaalacarta.com.ar/assets/defaults/sandia.svg', 0),
  ('Durazno', ARRAY['durazno', 'duraznos', 'damasco', 'ciruela'], 'https://www.smaalacarta.com.ar/assets/defaults/durazno.svg', 0),
  ('Palta', ARRAY['palta', 'guacamole', 'avocado'], 'https://www.smaalacarta.com.ar/assets/defaults/palta.svg', 0),
  ('Tomate', ARRAY['tomate', 'tomates', 'caprese'], 'https://www.smaalacarta.com.ar/assets/defaults/tomate.svg', 0),
  ('Zanahoria', ARRAY['zanahoria', 'zanahorias'], 'https://www.smaalacarta.com.ar/assets/defaults/zanahoria.svg', 0),
  ('Papa', ARRAY['papa', 'papas', 'pure', 'puré', 'papas al horno', 'papas rusticas', 'pure de papas'], 'https://www.smaalacarta.com.ar/assets/defaults/papa.svg', 0),
  ('Choclo', ARRAY['choclo', 'humita', 'maiz', 'pochoclo con choclo'], 'https://www.smaalacarta.com.ar/assets/defaults/choclo.svg', 0),
  ('Verduras', ARRAY['brocoli', 'vegetales al vapor', 'verduras salteadas'], 'https://www.smaalacarta.com.ar/assets/defaults/verduras.svg', 0),
  ('Hongos', ARRAY['hongos', 'champignones', 'portobello'], 'https://www.smaalacarta.com.ar/assets/defaults/hongos.svg', 0),
  ('Batata', ARRAY['batata', 'camote'], 'https://www.smaalacarta.com.ar/assets/defaults/batata.svg', 0),
  ('Maní', ARRAY['mani', 'frutos secos', 'mix de frutos secos', 'almendras', 'nueces'], 'https://www.smaalacarta.com.ar/assets/defaults/mani.svg', 0),
  ('Pochoclo', ARRAY['pochoclo', 'popcorn', 'pop', 'snack'], 'https://www.smaalacarta.com.ar/assets/defaults/pochoclo.svg', 0),
  ('Para llevar', ARRAY['para llevar', 'take away', 'delivery', 'caja'], 'https://www.smaalacarta.com.ar/assets/defaults/llevar.svg', 0),
  ('Plato del día', ARRAY['plato del dia', 'menu del dia', 'especial', 'minuta', 'sugerencia', 'guarnicion'], 'https://www.smaalacarta.com.ar/assets/defaults/cubiertos.svg', 0)
ON CONFLICT (lower(name)) DO UPDATE
SET keywords = public.default_images.keywords || EXCLUDED.keywords,
    image_url = EXCLUDED.image_url;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT name, keywords
    FROM public.default_images
    WHERE lower(name) = ANY (ARRAY['guiso', 'torta de cumpleaños', 'cucurucho', 'granizado', 'miel y dulce de leche', 'bubble tea', 'tirada de cervezas', 'trago tropical', 'espumante', 'uva', 'naranja', 'sandía', 'durazno', 'palta', 'zanahoria', 'hongos', 'batata', 'maní', 'para llevar', 'plato del día'])
  LOOP
    UPDATE public.default_images d
    SET keywords = ARRAY(SELECT k FROM unnest(d.keywords) AS k WHERE k <> ALL (r.keywords))
    WHERE lower(d.name) <> lower(r.name) AND d.keywords && r.keywords;
  END LOOP;
END
$$;
