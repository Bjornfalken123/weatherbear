# Verifierad arkitektur v15

## Aktiv kedja

1. `/api/depth-contours` hämtar GeoJSON från EMODnet WFS och normaliserar djupattributet till `properties.depth`.
2. `/api/depth-grid` hämtar rå `elevation` från EMODnet ERDDAP.
3. Klienten hämtar MapTilers vattenmask från samma vektorkälla som baskartans vatten.
4. Externa 2-, 3-, 6-, 10-, 20- och 50-meterskurvor rasteriseras som barriärer.
5. Vattenområden mellan kurvor och kust identifieras som sammanhängande komponenter.
6. Rådjup väljer färgband för varje komponent. Kurvan bestämmer gränsens position.
7. Samma WFS-features visas som linjer och etiketter i MapLibre.

## Borttaget

- klientgenererade kurvor med marching squares
- WMS-raster för kurvor
- egna kurvetiketter
- lokala regressionsmodeller för kustlutning
- fasta 1,4/2,6/4,8-metersschabloner
- flera konkurrerande djuplager

## Reservbeteende

Om WFS tillfälligt saknar kurvor återgår färgningen till rådjup per pixel. Den får aldrig kollapsa till en enda färg för hela vattenytan.
