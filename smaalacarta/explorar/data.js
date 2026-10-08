// Maqueta: datos tomados de directorios públicos (welcomeargentina.com, notas de
// Río Negro y Noticias NQN). Pueden estar desactualizados. Nada de acá viene de
// la base de SMA a la Carta. `menu: true` marca los locales que, en la maqueta,
// hacen de "cliente con menú digital" para mostrar cómo se vería.

export const CATEGORIAS = [
  { id: "parrilla", nombre: "Parrillas", icono: "🥩", color: "#9a3412" },
  { id: "restaurante", nombre: "Restaurantes", icono: "🍽️", color: "#12332c" },
  { id: "pizzeria", nombre: "Pizzerías", icono: "🍕", color: "#b45309" },
  { id: "bar", nombre: "Bares y cervecerías", icono: "🍺", color: "#854d0e" },
  { id: "cafe", nombre: "Cafés y té", icono: "☕", color: "#5a4a3a" },
  { id: "helado", nombre: "Heladerías", icono: "🍦", color: "#be185d" },
  { id: "rapida", nombre: "Al paso", icono: "🥪", color: "#047857" },
];

export const ZONAS = [
  "Centro",
  "Costanera",
  "Ruta 40",
  "Circuito Arrayán",
  "Cerro Chapelco",
];

// n nombre · c categoría · a dirección · t teléfono · z zona
// d descripción (solo si una fuente la respalda) · m tiene menú digital (demo)
export const LOCALES = [
  { n: "Ku de los Andes", c: "parrilla", a: "Av. San Martín 1053", t: "2972427039", z: "Centro", d: "Carne al asador, cordero patagónico, ciervo y jabalí.", m: true, dest: true },
  { n: "El Regional", c: "parrilla", a: "Av. San Martín 950", z: "Centro", d: "Asador vidriado a la vista y cordero patagónico.", m: true, dest: true },
  { n: "La Cabriada", c: "parrilla", a: "Av. San Martín y Mascardi", t: "2972426933", z: "Centro", d: "Asador patagónico con pastas, platos del chef y vinoteca.", m: true },
  { n: "Posta Criolla", c: "parrilla", a: "Villegas 915 esq. Belgrano", t: "2972429515", z: "Centro" },
  { n: "Parrilla Patagonia Piscis", c: "parrilla", a: "Villegas 598", t: "2972423247", z: "Centro" },
  { n: "El Fondo", c: "parrilla", a: "Av. San Martín 866, local 14", t: "29724642463", z: "Centro" },

  { n: "Ulises", c: "restaurante", a: "Av. San Martín 598", t: "2972428734", z: "Centro", d: "Trucha, cordero patagónico y merluza negra.", m: true, dest: true },
  { n: "El Bodegón de los Andes", c: "restaurante", a: "San Martín de los Andes", z: "Centro", d: "Rústico y regional; famoso por las empanadas de ciervo.", m: true },
  { n: "Torino", c: "restaurante", a: "Villegas y Elordi", t: "2972412614", z: "Centro", d: "Alta cocina en pleno centro." },
  { n: "La Bernardita", c: "restaurante", a: "Tte. Cnel. Pérez 910", t: "2972428091", z: "Centro", d: "Cocina de autor, un poco fuera del centro." },
  { n: "El Rey de la Pasta", c: "restaurante", a: "Villegas esq. Sarmiento", t: "2972428890", z: "Centro", d: "Cocina de autor." },
  { n: "La Costa del Pueblo", c: "restaurante", a: "Av. Costanera y Obeid, frente al puerto", t: "2972429289", z: "Costanera" },
  { n: "Nobuko Restoran & Sushi Bar", c: "restaurante", a: "Tte. Cnel. Pérez 910", t: "2972414910", z: "Centro", d: "Cocina japonesa y sushi." },
  { n: "Sushi House of Chef", c: "restaurante", a: "Av. San Martín 439, Paseo del Montañés", z: "Centro", d: "Cocina japonesa y sushi." },
  { n: "La Vieja Tasca", c: "restaurante", a: "Mariano Moreno 866", t: "2972425460", z: "Centro" },
  { n: "Morphen", c: "restaurante", a: "Av. San Martín 151", t: "2972424730", z: "Centro" },
  { n: "Merken", c: "restaurante", a: "Av. San Martín 493", t: "2972425107", z: "Centro" },
  { n: "Domingo", c: "restaurante", a: "Tte. Cnel. Pérez 1056", t: "2972414300", z: "Centro" },
  { n: "Porthos", c: "restaurante", a: "Elordi 601", t: "2972423838", z: "Centro" },
  { n: "Don Florencio", c: "restaurante", a: "Gral. Villegas 624", t: "2972412792", z: "Centro" },
  { n: "El Mesón de la Patagonia", c: "restaurante", a: "Rivadavia 885", t: "2972424970", z: "Centro" },
  { n: "Las Barricas", c: "restaurante", a: "Rivadavia 759", t: "2972423122", z: "Centro" },
  { n: "Oz Wine y Resto", c: "restaurante", a: "Av. San Martín 851", t: "2972434806", z: "Centro" },
  { n: "La Casona", c: "restaurante", a: "Villegas 744", t: "2972427888", z: "Centro" },
  { n: "Rosas", c: "restaurante", a: "Villegas 702", t: "2972427597", z: "Centro" },
  { n: "On Fire", c: "restaurante", a: "Av. Koessler 1455", t: "2972428454", z: "Ruta 40" },
  { n: "Sazón", c: "restaurante", a: "Las Pendientes Ski & Village", t: "2972412699", z: "Cerro Chapelco" },
  { n: "La Base Chapelco", c: "restaurante", a: "Cerro Chapelco", z: "Cerro Chapelco" },

  { n: "Mesta Nostra", c: "pizzeria", a: "Ruta 40, frente al Callejón", z: "Ruta 40", d: "Pizza de masa madre y cerveza propia.", m: true },
  { n: "La Barra", c: "pizzeria", a: "Brown 216", t: "2972425459", z: "Centro" },
  { n: "Maximus", c: "pizzeria", a: "Av. San Martín 1234", t: "2972421454", z: "Centro" },
  { n: "Pizza Cala", c: "pizzeria", a: "Av. San Martín 1129", t: "2972422511", z: "Centro" },
  { n: "Genaro", c: "pizzeria", a: "Elordi 389", t: "2972423332", z: "Centro" },
  { n: "Don Gregorio", c: "pizzeria", a: "Elordi 455", z: "Centro" },
  { n: "Bon Gusto", c: "pizzeria", a: "Belgrano 777", t: "2972420500", z: "Centro" },
  { n: "La Gran 7", c: "pizzeria", a: "Av. San Martín 439", t: "2972429675", z: "Centro" },

  { n: "Dublin South Pub", c: "bar", a: "Av. San Martín 599 esq. M. Moreno", t: "2972410141", z: "Centro", d: "Pub, restobar y confitería en la misma esquina.", dest: true },
  { n: "Fenris", c: "bar", a: "San Martín de los Andes", z: "Centro", d: "Cervecería local." },
  { n: "Mükur", c: "bar", a: "San Martín de los Andes", z: "Centro", d: "Cervecería local." },
  { n: "Lácar", c: "bar", a: "San Martín de los Andes", z: "Centro", d: "Cervecería local." },
  { n: "Piedra Buena", c: "bar", a: "Av. San Martín 222", t: "2972422575", z: "Centro" },
  { n: "Crux", c: "bar", a: "Av. San Martín 1291", t: "2972429979", z: "Centro" },
  { n: "Fassbier", c: "bar", a: "Belgrano 856", z: "Centro" },
  { n: "Wemul", c: "bar", a: "Belgrano 676", z: "Centro" },
  { n: "Wild", c: "bar", a: "Av. San Martín 1201", z: "Centro" },
  { n: "Otto", c: "bar", a: "Misionero Mascardi 892", z: "Centro" },
  { n: "El Wine Bar de Paihuen", c: "bar", a: "Ruta 40 km 2207,5", t: "2972428154", z: "Ruta 40" },

  { n: "Filo", c: "cafe", a: "Casco histórico", z: "Centro", d: "Café de pequeños productores.", m: true },
  { n: "Fiora", c: "cafe", a: "Casco histórico", z: "Centro", d: "Café de pequeños productores." },
  { n: "The Coffee Store", c: "cafe", a: "Av. San Martín 866", t: "2972410810", z: "Centro" },
  { n: "Café Danés", c: "cafe", a: "Gral. Villegas 1184", t: "2972411114", z: "Centro" },
  { n: "Abolengo", c: "cafe", a: "Gral. Roca 604", t: "2972427732", z: "Centro", d: "Casa de té y confitería." },
  { n: "Unser Traum", c: "cafe", a: "Gral. Roca 868", t: "2972422319", z: "Centro", d: "Casa de té." },
  { n: "Zen Tea", c: "cafe", a: "Av. San Martín 436", t: "2972423160", z: "Centro", d: "Casa de té." },
  { n: "Arrayán", c: "cafe", a: "Circuito Arrayán, km 4", t: "2972425570", z: "Circuito Arrayán", d: "Casa de té." },
  { n: "Vieja Deli", c: "cafe", a: "Av. Costanera y Villegas", t: "2972428898", z: "Costanera", d: "Confitería sobre la costanera." },
  { n: "Tío Paco", c: "cafe", a: "Av. San Martín y Cap. Drury", t: "2972427920", z: "Centro", d: "Confitería." },
  { n: "La Terminal", c: "cafe", a: "Villegas 251", t: "2972428665", z: "Centro", d: "Confitería." },

  { n: "Heladería San Martín", c: "helado", a: "Belgrano 833", t: "2972425248", z: "Centro", d: "Helado artesanal; también café y brownies.", m: true, dest: true },
  { n: "Charlot", c: "helado", a: "Av. San Martín 1017", t: "2972428561", z: "Centro" },
  { n: "Mamusia", c: "helado", a: "M. Moreno y Av. San Martín", t: "2972427800", z: "Centro" },
  { n: "Mamuschka", c: "helado", a: "Av. San Martín y Belgrano", z: "Centro" },
  { n: "Grido", c: "helado", a: "Gral. Roca 1375", t: "2972413850", z: "Centro" },

  { n: "1986 Casa de Empanadas", c: "rapida", a: "Luis Goñi 17 y Ruta 40", t: "2972411986", z: "Ruta 40", d: "Empanadas.", m: true },
  { n: "Picando al Sur", c: "rapida", a: "Av. Koessler 1470", t: "2972429441", z: "Ruta 40" },
  { n: "Nonino", c: "rapida", a: "Villegas 745", t: "2972425072", z: "Centro" },
  { n: "El Caldero", c: "rapida", a: "Av. San Martín 866", t: "2972414400", z: "Centro" },
  { n: "Almacén del Sándwich", c: "rapida", a: "Av. San Martín 866", z: "Centro" },
  { n: "Corazón Contento", c: "rapida", a: "Av. San Martín 467", t: "2972412750", z: "Centro" },
];
