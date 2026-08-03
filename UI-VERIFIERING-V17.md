# UI-verifiering v17

## Grundorsak till v16-felet

V16 lade ett stort avslutande CSS-block ovanpå hela appen. Det skrev samtidigt över kartans höjd, gardinernas display, flera `top`/`bottom`-värden och z-index. I Chromium gav detta bland annat en 728 px hög wrapper för lägesväljaren i sjökortsläget och djupskalan hamnade visuellt bakom den.

## Åtgärd

V17 utgår från den kompletta v15-filen. V16-blocket och dess globala menycontroller används inte.

Endast två verifierade problem är korrigerade:

1. När en mobil gardin är öppen döljs flytande kartkontroller bakom gardinen. Gardinens befintliga storlek och position ändras inte.
2. Telefoner i liggande läge kan ha en CSS-bredd över 700 px och fick tidigare desktoplayout. En särskild klass aktiveras endast vid grov pekare, bredd 701–950 px och höjd högst 520 px.

## Chromium-kontroller

Statiska layouttester gjordes med den verkliga HTML- och CSS-koden i Chromium 144.

Kontrollerade vyer:

- 390 × 844, sjökort stängt
- 390 × 844, sjökort med lagergardin
- 360 × 640, sjökort stängt
- 360 × 640, avancerat stängt
- 844 × 390, sjökort liggande
- 844 × 390, avancerat liggande

Resultat:

- stående sjökort och avancerat är pixelidentiska med v15 när ingen gardin är öppen
- vid öppen gardin är bakomliggande knappar, statusfält och reglage osynliga och inte klickbara
- i liggande sjökort har lägesval, djupskala, kompass, tema, snabbknappar och statusfält separata ytor
- i liggande avancerat ligger analysfliken direkt ovanför tidsreglaget utan överlapp

## Tekniska kontroller

- alla inline-JavaScriptblock klarar `node --check`
- alla Functions-filer klarar `node --check`
- inga duplicerade statiska HTML-id:n
- projektets build-kommando passerar
- djup- och API-filer är oförändrade från v15

Testerna använder appens faktiska CSS och DOM, men ingen livehämtning av MapTiler- eller EMODnet-data. Kartbakgrunden ersattes med en neutral testyta för att isolera gränssnittets geometri.
