// Everything the client may want to edit lives here: copy, links, zones, promos, FAQ.

export const BRAND = 'Jumping Center';
export const CITY = 'Orizaba, Veracruz';

/** Pending from the client. With a WhatsApp number the party CTA goes straight to chat. */
export const CONTACT = { whatsapp: '' as string };

/** Google Maps search until the client confirms the exact address (then use a place link). */
export const MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${BRAND} ${CITY}`)}`;

export const PARTY_HREF = CONTACT.whatsapp
  ? `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Hola, quiero cotizar una fiesta en Jumping Center.')}`
  : '#cotizar';

export const NAV = [
  { label: 'El parque', href: '#parque' },
  { label: 'Fiestas', href: '#fiestas' },
  { label: 'Promociones', href: '#promociones' },
] as const;

export type ZoneId = 'trampolines' | 'retos' | 'infantil' | 'fiestas';

/** The four stops of the park tour, in visiting order. */
export const ZONES: { id: ZoneId; title: string; lines: string[]; text: string; alt: string }[] = [
  {
    id: 'trampolines',
    title: 'Trampolines',
    lines: ['Trampolines'],
    text: 'De un salto al siguiente.',
    alt: 'Cancha de trampolines con colchonetas lima y azules frente al muro de Jumping Center',
  },
  {
    id: 'retos',
    title: 'Zona de retos',
    lines: ['Zona de', 'retos'],
    text: 'Cruza, trepa y pon a prueba tu equilibrio.',
    alt: 'Estructura ninja azul con aros, costales y red para trepar sobre una fosa de cubos de hule espuma',
  },
  {
    id: 'infantil',
    title: 'Zona infantil',
    lines: ['Zona', 'infantil'],
    text: 'Túneles, pelotas y mucho por descubrir.',
    alt: 'Área de juegos infantil con redes, escalones acolchados, tobogán de tubo y alberca de pelotas',
  },
  {
    id: 'fiestas',
    title: 'Fiestas',
    lines: ['Fiestas'],
    text: 'Un cumpleaños con más saltos.',
    alt: 'Salón de fiestas con mesas de mantel lima, banderines de colores, globos y el logo de Jumping Center',
  },
];

export const PROMOS = [
  { id: 'sunset', title: ['Sunset', 'Boost'], label: 'Sunset Boost' },
  { id: 'pumpkin', title: ['Pumpkin', 'Day Pass'], label: 'Pumpkin Day Pass' },
  { id: 'chill', title: ['Chill', 'Fall'], label: 'Chill Fall' },
] as const;

// ponytail: answers are sensible defaults for a trampoline park, not the client's policy yet — confirm before launch.
export const FAQ = [
  {
    id: 'reservar',
    q: '¿Necesito reservar?',
    a: 'Para saltar no hace falta: llega, regístrate en recepción y a brincar. Si vienes en grupo o en fin de semana, llega con tiempo. Las fiestas sí se apartan con anticipación.',
  },
  {
    id: 'llevar',
    q: '¿Qué debo llevar?',
    a: 'Ropa cómoda y calcetas antiderrapantes para saltar. Las niñas y niños vienen con un adulto responsable, que firma la responsiva en recepción.',
  },
  {
    id: 'cotizar',
    q: '¿Cómo cotizo una fiesta?',
    a: 'Pregunta por los paquetes en recepción o escríbenos: te compartimos fechas disponibles, horarios y lo que incluye cada paquete.',
  },
] as const;
