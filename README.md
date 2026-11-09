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
| Imágenes | `src/assets/renders/*.webp` |

Para poner fotos reales basta con reemplazar el `.webp` del mismo nombre (o cambiar el import).
Astro genera AVIF/WebP en varios anchos al compilar.

## Movimiento

- Entradas: `data-reveal` + IntersectionObserver añade `.is-in` una sola vez; el CSS hace el resto.
- Loops (la mascota que rebota, los cubos): solo corren mientras su bloque está en pantalla (`data-loop` → `.is-live`).
- Parallax: `animation-timeline: view()` solo en escritorio y donde existe; sin JS de scroll.
- `prefers-reduced-motion: reduce` muestra todo quieto.

## Arte 3D (`art/`)

Las imágenes del parque, la mascota y la calabaza son renders con path tracing del modelo 3D
en `art/src` (Three.js + three-gpu-pathtracer, en Chromium con la GPU). Viven aparte para no
tocar las dependencias del sitio:

```sh
cd art && pnpm install
pnpm render hero --spp 300   # o ./render-all.sh para todo (≈1 h en un M2)
python3 finish.py            # quita ruido y exporta a src/assets/renders
node logo.mjs && node mark.mjs && node og.mjs   # logo, favicon, imagen social e ícono iOS
```

## Pendiente del cliente

- Fotos reales del parque y el logo original en vector (el logo actual es una reconstrucción).
- Dirección exacta (el botón «Cómo llegar» busca «Jumping Center Orizaba» en Google Maps).
- WhatsApp (`CONTACT.whatsapp` en `site.ts`): con él, «Consulta paquetes» abre el chat.
- Confirmar respuestas de preguntas frecuentes y la vigencia de las promociones.
- Dominio: definir `SITE_URL` al publicar (en Vercel se toma solo el dominio de producción).
