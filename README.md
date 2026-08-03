# Weatherbear

Komplett Weatherbear-app med sjökortsläge och UI-korrigering v17.

## Sjökort

Djupvisningen är oförändrad från v15. Externa EMODnet Bathymetry WFS-kurvor används som geometri för färggränser, synliga linjer och djupetiketter. EMODnets råa DTM-värden används för att bestämma vilket djupband som ligger på respektive sida om kurvan och som reserv där konturer saknas.

## UI-korrigering v17

V17 är byggd direkt från den verifierade v15-filen. Det globala v16-override-blocket används inte.

Korrigeringen är begränsad till:

- kontroller bakom en öppen mobil gardin döljs tillfälligt
- lägesmenyn stängs när en gardin öppnas
- Escape stänger tillfälliga paneler
- telefon i liggande läge får en separat kompakt layout i stället för desktoplayout

Stående mobil- och desktoppositioner har inte flyttats.

Cloudflare Pages Functions under `functions/api/` måste publiceras tillsammans med resten av projektet.
