# Weatherbear djuplager v1

Denna version ersätter det tidigare färdigmålade djupskiktet med ett eget Weatherbear-lager för svenska hav och kustvatten.

## Lagerordning

1. Ljus baskarta
2. Weatherbear djupzoner
3. EMODnet djupkurvor
4. OpenSeaMap sjömärken
5. Appens väder- och navigationslager

## Djupzoner

Djupvärdena färgsätts på serversidan av `/api/depth-tile`:

- 0–2 m: mörkast blå
- 2–3 m: tydligt blå
- 3–6 m: mellanblå
- 6–10 m: ljusblå
- 10–20 m: mycket ljusblå
- 20–50 m: nästan vit
- över 50 m: vit

Grunda områden framträder alltså tydligare, medan djupare vatten tonar mot vitt på samma sätt som i traditionell sjökortsläsning.

## Teknik

- Råkälla: EMODnet Bathymetry DTM 2024 (`emodnet:mean`)
- Konturer: egna 2, 3, 6, 10, 20 och 50 meterskurvor som genereras från `emodnet:mean`; EMODnets generaliserade konturlager används som reserv
- Egen färgsättning: SLD som genereras av `functions/api/depth-tile.js`
- Cache: sju dagar via Cloudflare Cache API
- Tile-storlek: 512 × 512 pixlar
- Källans maxzoom: 14; kartan får zooma vidare och skalar då upp sista giltiga nivån
- Geografisk första version: svenska hav och kustvatten

## Viktigt

Lagret är en tydligare visualisering av öppna djupdata. Det är inte ett godkänt navigationssjökort och skapar inte detaljer som saknas i källdatan.

## Kustmask och mjuk strandlinje (v1.1)

- Djupskiktet maskas visuellt med MapTiler Lands vektorpolygoner (`source-layer: land`).
- Landmasken ligger över djupzoner och djupkurvor, vilket gör att djupfärgen följer den faktiska kustlinjen och öarna i kartunderlaget i stället för EMODnet-rutnätets grova nollinje.
- En separat suddad kustlinje ligger precis under landmasken. Eftersom landfyllningen täcker linjens inre halva återstår en mjuk övergång ut mot vattnet.
- EMODnet-rastret begärs med bicubic interpolation för fyllningen och bilinear interpolation för konturerna. Detta minskar pixlighet utan att ändra appens startvy.
- Kustmasken använder appens befintliga MapTiler-nyckel och kräver ingen ny tjänst eller ny API-nyckel.
