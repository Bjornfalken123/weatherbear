# Weatherbear djuplager v5

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
- Tile-storlek: 256 × 256 pixlar i kartan. WMS hämtas med ett litet halo och beskärs tillbaka till exakt 256 × 256.
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


## Kustanslutning och hela Sveriges kust (v1.2)

- Den tidigare landfärgade kustövergången låg ovanpå djupet och kunde skapa en ljus remsa utan djupmarkering. Den ligger nu under djupet och är vattenfärgad.
- Ett neutralt kustvattenlager ligger under rådjupet och klipps visuellt av samma vektorbaserade landmask som används för öar och fastland. Där EMODnet har transparenta kustglipor visas därför vatten ända fram till kustlinjen.
- Rådjupet är helt opakt ovanpå kustfyllningen, så giltiga djupzoner och djupkurvor behåller sina färger.
- Klient och tile-endpoint använder samma täckning: 8.0°E–27.0°E och 53.0°N–67.0°N. Det omfattar hela Sveriges kust med marginal i Skagerrak, Kattegatt, Östersjön, Bottenhavet och Bottenviken.
- Den neutrala kustfyllningen är en visuell no-data-fyllnad och ska inte tolkas som ett uppmätt djupvärde.


## v2 – Orust och geometrisk anpassning

- Rasterkällan använder nu MapLibres exakta `{bbox-epsg-3857}` i stället för att proxyn räknar om z/x/y på nytt.
- WMS och MapLibre använder båda 256 × 256 pixlar per tile.
- `tiled=false` används för dynamiska SLD-renderingar så att GeoWebCache inte returnerar fel grid eller tidigare tomma tiles.
- Tile-URL:en har versionsparametern `v=2`, vilket bryter den tidigare sju dagar långa cachen.
- Startposition och övriga appfunktioner är oförändrade.

- Det tidigare EMODnet `mean_multicolour`-reservlagret är borttaget. Det kunde synas som en röd/orange karta genom transparenta rådatagap. I stället används en neutral vattenfyllning under Weatherbears egna djupzoner.


## Kustpassning v3

- Den breda vattenfärgade kusttoningen är borttagen. Den kunde skapa en synlig remsa och ge intryck av förskjutning.
- Neutral vattenfyllning och landmask möts nu direkt i MapTilers landgeometri.
- Djupzonerna ligger under landmasken och kan därför inte målas över land även när EMODnets rågrid är grovt.
- Fyllning och konturer använder cacheversion `v=3`.

- Det separata CARTO-rasterlagret är borttaget ur sjökortsläget. Appens befintliga MapTiler-bas och MapTilers landmask använder nu samma kustgeometri, vilket undviker en enpixels-/generaliseringsskillnad mellan två olika kartleverantörer.

## Kustnära närmaste-punkt-fyllning (v4)

V4 använde en fast zoomtabell på 4–30 tile-pixlar. Det motsvarade på vissa zoomnivåer 150–350 meter och gav därför för stora och hårda kustfält. Varje tile behandlades dessutom isolerat, vilket kunde skapa skarvar.

## Precisionsfyllning och tile-halo (v5)

- Endast transparenta no-data-pixlar behandlas. Originalpixlar med riktig djupfärg ändras aldrig.
- Fyllningen är begränsad i verkliga meter i stället för en grov pixelradie. Målet är högst cirka 36 meter.
- Vid zoom under 11 används ingen artificiell fyllning, eftersom en enda pixel då motsvarar ett för stort verkligt område.
- Runt Orust motsvarar radien ungefär 1 px vid z11, 2 px vid z12, 4 px vid z13 och 7 px vid z14.
- Närmaste giltiga djuppunkt beräknas med en åttariktnings chamfer-transform, vilket ger rundare avstånd än den tidigare fyrkantiga BFS-expansionen.
- Den första delen av glipan behåller närmaste djupfärg. Den sista delen tonas mjukt mot transparens, så större dataluckor lämnas synliga i stället för att fyllas på låtsas.
- Endast de uppskattade pixlarna mjukas lokalt. Verkliga djupzoner och konturer suddas inte.
- WMS-anropet hämtar ett litet halo runt varje tile. Efter fyllningen beskärs bilden tillbaka till exakt MapLibre-bbox och 256 × 256 pixlar. Det minskar tile-skarvar utan att flytta lagret.
- MapTilers landmask ligger fortsatt överst och klipper djupet vid samma kustgeometri som sjökortets landyta.

Fyllningen är en visuell interpolation och ska inte tolkas som nya uppmätta djupvärden.
