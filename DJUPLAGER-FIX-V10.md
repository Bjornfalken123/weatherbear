# Djuplager v10 – korrigering av enfärgat vatten

## Verifierade kodfel i v9

1. Fyllbilden begärdes som `image/png8`. EMODnets officiella WMS-exempel använder `image/png`. Om upstream inte returnerade en bild svarade proxyn med 204, vilket gjorde djuplagret transparent och lämnade MapTilers enfärgade vatten synligt.
2. GeoServers `ColorMap type="intervals"` tolkar varje `quantity` som övre gräns för intervallet. V9 hade en extra gräns vid -1000 m och dubbla gränser runt 0 m. Djupzonerna blev därför förskjutna.
3. Gråskalekoderna var onödigt svåra att skilja från ett vanligt renderat WMS-svar.
4. MapLibre använde linjär resampling på ett kategoriskt raster, vilket kunde blanda färger mellan zoner.

## V10

- Vanlig `image/png` används.
- Intervallen är exakt: >50, 20–50, 10–20, 6–10, 3–6, 2–3 och 0–2 meter.
- Sju väl separerade interna signaturfärger används mellan GeoServer och klienten.
- Signaturerna ersätts lokalt med Weatherbears dag- eller nattpalett.
- Fyllagret använder `nearest`-resampling så zonfärger inte blandas av MapLibre.
- Cacheversionen är `v=10`.

## Maskinella kontroller

- Alla sju intervallvärden mappas till rätt signatur.
- Alla sju signaturer avkodas till rätt djupzon.
- Främmande färger avvisas.
- Alla JavaScript-filer och inline-script klarar `node --check`.
- Projektets build-kommando passerar.
