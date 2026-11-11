# Jumping Center · Landing

Landing estática en Astro 7 para el parque de trampolines Jumping Center (Orizaba, Veracruz).
Requiere Node 26 (`.nvmrc`).

```sh
pnpm install
pnpm dev                    # http://localhost:4321
pnpm build && pnpm preview  # así se juzga la velocidad: en dev las imágenes se comprimen al vuelo
pnpm check                  # tipos y plantillas
```

## Dónde tocar qué

| Qué | Dónde |
| --- | --- |
| Textos, zonas, promociones, preguntas, WhatsApp, mapa | `src/data/site.ts` |
| Secciones | `src/components/` (`Hero`, `Stop` = cada parada del recorrido, `Promos`, `Visit`, `Faq`, `Footer`) |
| Colores, tipografía, botones, sistema de entradas | `src/styles/global.css` |
| Toda la lógica de scroll (≈1 KB) | `src/scripts/motion.ts` |
| Cubos y pelotas con física | `src/scripts/playground.ts` y `src/scripts/play/` (`src/scripts/play.ts` decide cuándo cargarlo) |
| Imágenes | `src/assets/renders/*.webp` |

Para poner fotos reales basta con reemplazar el `.webp` del mismo nombre (o cambiar el import).
Astro genera AVIF/WebP en varios anchos al compilar. Ojo con tres imágenes: la mascota del hero
está parada sobre una cama medida en `hero.webp` (`.hero__kid` en `Hero.astro`), el vuelo del dron
empieza exactamente en `hero.webp` (ver abajo), y las albercas de `retos.webp` e `infantil.webp` se
reconstruyen en 3D con la cámara y la geometría de sus renders (`src/scripts/play/scenes.ts`). Si
cambia una de esas imágenes, hay que actualizar eso también.

## Movimiento

- Entradas: `data-reveal` + IntersectionObserver añade `.is-in` una sola vez; el CSS hace el resto.
- Vuelo de dron (`src/scripts/hero.ts`): con el primer scroll la cámara entra al modelo, baja a los
  trampolines, pasa junto al circuito ninja y casi rozando la alberca de pelotas, y sale a una vista
  de todo el parque; luego la página sigue. El hero se queda fijo mientras tanto (`240svh` de
  scroll, `.hero.is-flying::after` en `Hero.astro`). Son 72 cuadros renderizados de la misma escena
  que `hero.webp` (ver «Arte 3D»), dibujados en un canvas del tamaño de la pantalla: el primero cae
  justo sobre la imagen y el vuelo crece desde ahí. Escritorio y celular reciben recortes distintos
  del mismo cuadro (`src/assets/flight/wide` y `narrow`). Se descargan después de la imagen del
  hero, de grueso a fino, y se decodifican solo alrededor de donde va el vuelo; mientras no llegan,
  la imagen hace un zoom. La mascota se mueve con los cuadros a donde está parada en ellos, se
  desvanece cuando el dron se le acerca y vuelve en la vista final. Sigue al scroll con un pequeño
  retraso para que se deslice. Sin vuelo con `prefers-reduced-motion` o ahorro de datos: el hero
  queda quieto.
- Loops (las mascotas de las zonas y las promos, los cubos del hero): solo corren mientras su bloque está en pantalla (`data-loop` → `.is-live`).
- Parallax: `animation-timeline: view()` solo en escritorio y donde existe; sin JS de scroll.
- `prefers-reduced-motion: reduce` muestra todo quieto.

## Física (cubos y pelotas)

Los cubos de «Zona de retos» y las pelotas de «Zona infantil» son cuerpos rígidos (cannon-es)
dibujados con three.js en un solo canvas sobre la página (`Stop` recibe `pit="cubes"` o `"balls"`).

- Cada alberca es una escena 3D real (`play/pit.ts`): la tina, los postes y los costales con las
  medidas del modelo, vistos con la misma cámara que hizo la foto (`play/scenes.ts`, copiado de
  `art/src/shots`). Así las piezas vivas cubren toda la superficie, de lado a lado y hasta el fondo,
  con la perspectiva de la foto, y lo que está enfrente en la foto (paredes, postes) las tapa.
- La capa viva se acuesta sobre la pila pintada, que sigue debajo: donde se vacía, se ven las de la foto.
- El puntero es una mano que barre la superficie; un clic o un toque hace saltar lo que tiene cerca.
- Lo que sale volando, o se cae por el frente o un lado, pasa al mundo de la página (`playground.ts`):
  1 px = 1 cm, la gravedad tira hacia abajo, los bordes de la página son paredes y el fondo del
  footer es el piso. Ahí baja por toda la página y se queda en el footer, donde sigue reaccionando.
  En pantalla todo cae igual de rápido en los dos mundos, así que el paso de uno a otro no se nota.
- Cada alberca se llena cuando su sección termina de entrar. Se repone sola, y en el footer hay un
  tope de piezas sueltas (`LOOSE`): al pasarlo salen las más viejas.
- El footer empieza con unas cuantas piezas (`SEED`) para que el piso nunca esté vacío.
- Cuesta cero en reposo: los cuerpos se duermen y el bucle se detiene hasta el siguiente
  movimiento del puntero o del scroll.
- Pesa ≈160 kB gzip, así que se descarga aparte, después de cargar la página y solo al acercarse a
  una alberca o al footer. No se carga con `prefers-reduced-motion` ni con ahorro de datos, y sin
  WebGL la página queda como estaba.
- Ajustes rápidos: `FLING`, `CALM` y `SOFT` en `play/shared.ts` (qué tan lejos vuela algo, cuándo se
  quedan quietas, cuándo dejan de rebotar), `gap` en `play/scenes.ts` (qué tan juntas quedan en la
  alberca), y `LOOSE` y `SEED` en `playground.ts`.

## Arte 3D (`art/`)

La mascota es el dibujo real del cliente, recortado de sus historias (`art/ref`) con
`python3 art/cutout.py` → `src/assets/kid`. Las imágenes del parque y la calabaza son renders con
path tracing del modelo 3D en `art/src` (Three.js + three-gpu-pathtracer, en Chromium con la GPU). Viven aparte para no
tocar las dependencias del sitio:

```sh
cd art && pnpm install
pnpm render hero --spp 300   # o ./render-all.sh para todo (≈1 h en un M2)
python3 finish.py            # quita ruido y exporta a src/assets/renders
node logo.mjs && node mark.mjs && node og.mjs   # logo, favicon, imagen social e ícono iOS
```

El vuelo del hero: la ruta de la cámara está en `art/src/flight.js` (`KEYS`: posición, a dónde mira
y apertura, repartidos parejo en el tiempo; el primero es la cámara de `shots/hero.js`).

```sh
node render-flight.mjs --mode preview --bg none   # vista previa instantánea (sin path tracing)
node render-flight.mjs --skip-done                # 72 cuadros cuadrados de 1280 px (≈1 h en un M1)
python3 finish-flight.py                          # quita ruido, recorta y escribe src/data/flight.ts
```

`finish-flight.py` también mide dónde cae `hero.webp` en el primer cuadro y dónde está la mascota en
cada uno, así que si cambia el render del hero o la ruta, basta con volver a correr los dos pasos.
## Pendiente del cliente

- Fotos reales del parque, el logo en vector (el actual es una reconstrucción) y la mascota en PNG
  transparente en varias poses (hoy sale de recortes de sus historias: solo hay dos poses limpias).
- Dirección exacta (el botón «Cómo llegar» busca «Jumping Center Orizaba» en Google Maps).
- WhatsApp (`CONTACT.whatsapp` en `site.ts`): con él, «Consulta paquetes» abre el chat.
- Confirmar respuestas de preguntas frecuentes y la vigencia de las promociones.
- Dominio: definir `SITE_URL` al publicar (en Vercel se toma solo el dominio de producción).
