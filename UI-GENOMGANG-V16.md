# UI-genomgång v16

## Omfattning

Den kompletta appens flytande UI har granskats för väder-, avancerat- och sjökortsläge på desktop och mobil. Fokus är menyer, gardiner, kartpaneler, safe-area, z-index, liggande mobil och små skärmar.

## Grundproblem som rättats

Tidigare CSS-pass använde flera konkurrerande `top`, `bottom` och `z-index` för samma komponenter. Slutresultatet berodde därför på skärmbredd, läge och ordningen mellan reglerna. V16 lägger ett slutligt gemensamt positionssystem ovanpå äldre styling.

## Mobil layout

- Alla bottom sheets använder samma geometri, maxhöjd och scrollmodell.
- Endast en gardin kan vara aktiv åt gången.
- En klickbar bakgrundsskärm stänger den aktiva gardinen.
- Escape stänger öppna gardiner, lägesmeny och desktopfilter.
- Bakomliggande flytkontroller döljs medan en gardin är öppen.
- Gardinernas rubrik ligger kvar medan innehållet scrollas.
- Safe-area används för telefoner med hemindikator och sensorfält.

### Sjökort

- Dag/natt-knappen ligger högst upp till vänster.
- Djupskalan ligger högst upp till höger.
- Kompassen ligger centrerad ovanför statuspanelen.
- Snabbknappar ligger till vänster ovanför statuspanelen.
- Lägesväljaren ligger till höger ovanför statuspanelen.
- Statuspanelen har ett reserverat bottenområde.
- AIS- och radaraviseringar placeras ovanför sjökortsreglagen.
- Liggande mobil använder en kompakt statuspanel och flyttar kompassen åt sidan.

### Avancerat

- Analysreglaget är centrerat ovanför bottennavigeringen.
- Lägesväljaren ligger på en separat höjdnivå.
- Snabbknapparna ligger ytterligare en nivå ovanför.
- Informationspanelen har begränsad höjd och egen scroll.

## Desktop

- Filterpanelen och informationspanelen kan inte växa utanför viewporten.
- Tidskontrollen håller marginal till kartans kanter.
- Desktop och mobil har separata layoutregler; mobila gardiner kan inte visas på desktop.

## Interaktionsregler

- Öppning av gardin stänger lägesmeny och desktopfilter.
- Öppning av snabbval stänger lägesmenyn.
- Lägesbyte stänger alla tillfälliga paneler.
- Resize och orientation change stänger lägesmenyn och synkroniserar gardinläget.
