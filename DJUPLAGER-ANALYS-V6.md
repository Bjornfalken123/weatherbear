# Analys av kustpassning – v6

## Kvarvarande fel i v5

V5 använde MapTilers landpolygon som ett synligt lager ovanpå djupet, men själva närmaste-punkt-beräkningen kände bara till djupbildens alfakanal. Det innebar att beräkningen matematiskt kunde hitta en närliggande djuppixel på andra sidan av en smal ö eller ett näs. Landet täckte slutresultatet, men färgfältet kunde ändå se felriktat eller förskjutet ut längs kustlinjen.

## Lösning

1. Djup-URL:en innehåller nu samma `z`, `x` och `y` som MapLibre använder.
2. Klienten hämtar samma MapTiler Land-tile som det synliga landlagret använder.
3. Landpolygonerna avkodas från Mapbox Vector Tile och rasteriseras till djupbildens pixelgrid, inklusive WMS-halot.
4. Masken tar bort djup på land före fyllning.
5. Chamfer-transformen får endast spridas mellan vattenpixlar.
6. Utjämningen använder bara vattenklassade grannar.
7. Vid maskfel görs ingen uppskattningsfyllning, vilket är säkrare än att anta vatten.

## Test

Ett syntetiskt test med två vattenområden separerade av en landbarriär verifierar att:

- en no-data-pixel fylls från närmaste källa i samma vattenområde;
- ingen färg passerar landbarriären;
- landpixlar förblir transparenta.

Livekontroll mot MapTilers och EMODnets externa tiles måste fortfarande göras i den publicerade miljön eftersom arbetsmiljön saknar extern DNS.
