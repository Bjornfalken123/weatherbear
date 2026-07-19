# Weatherbear Depth Layer v12

V12 använder råa numeriska djupvärden från EMODnet ERDDAP och behåller de kontinuerliga djupvärdena genom hela renderingen. Färggränser, djupkurvor och kurvetiketter byggs därför från samma slutliga djupfält.

## Datakedja

1. MapLibre skickar tile-rutans exakta EPSG:3857-bbox till `/api/depth-grid`.
2. Funktionen frågar EMODnet ERDDAP-datasetet `bathymetry_dtm_2024` efter variabeln `elevation`.
3. Negativ elevation omvandlas till positivt djup i meter. Land och no-data lämnas tomt.
4. Rågriddet interpoleras kontinuerligt till MapLibres pixelgrid. En ensam giltig gridhörna får inte spridas långt in i no-data.
5. Samma MapTiler-vattengeometri används som kustmask.
6. Endast kustnära no-data fylls. Verkliga källdjup ändras aldrig.
7. Slutdjupet färgsätts i sju zoner med en mycket smal antialiaserad övergång.
8. Marching squares skapar kurvor vid 2, 3, 6, 10, 20 och 50 meter från exakt samma kontinuerliga djupfält.
9. Kurvvärden placeras längs samma kurvor vid navigationszoom.

## Djupzoner

- 0–2 m
- 2–3 m
- 3–6 m
- 6–10 m
- 10–20 m
- 20–50 m
- djupare än 50 m

Dag- och nattläge använder samma nivåer men olika paletter.

## Kurvor och etiketter

- nivåer: 2, 3, 6, 10, 20 och 50 meter
- kurvorna beräknas från kontinuerliga meterdata, inte från pixelkanter mellan färgrutor
- linjerna antialiasas i canvas och djuprastret använder linjär resampling
- etiketter visas från zoom 10 och glesas automatiskt på lägre zoom
- etiketter får en kontrasterande halo för dag- och nattläge

## Kustanslutning

- fyllning får inte passera land, öar eller näs
- grunt vatten kan grundas mot stranden
- djupare vatten grundas endast när lokala kurvövergångar stödjer det
- om sådant stöd saknas behålls närmaste djup
- offshore-hål fylls inte av kustalgoritmen

## Täckning och cache

- geografiskt område: 8–27° E och 53–67° N
- råkälla: EMODnet DTM 2024
- svar cachas i sju dagar
- cacheversion: v12
