# Weatherbear Depth Layer v9

Weatherbears sjökort använder EMODnet DTM som öppen djupkälla och den aktiva MapTiler-stilens `water`-geometri som kustmask.

## Lagerordning

1. MapTilers baskarta
2. Weatherbears diskreta djupzoner
3. konturgränser från samma klassificerade djupfält
4. EMODnet-konturetiketter
5. kustlinje från MapTilers vattengeometri
6. OpenSeaMap-sjömärken
7. användarposition och navigationsgränssnitt

Det tidigare helt opaka, enfärgade reservvattnet är borttaget. Om extern djupdata saknas visas baskartan i stället för en färg som kan misstolkas som ett verkligt djup.

## Djupzoner

- 0–2 m
- 2–3 m
- 3–6 m
- 6–10 m
- 10–20 m
- 20–50 m
- >50 m

Zonerna kodas som exakta intervall av GeoServer och färgsätts lokalt i appen. Dag- och nattläge använder samma gränser men olika paletter.

## Kustanslutning

Kustfyllningen arbetar på zonvärden och MapTilers vattenmask:

- ingen fyllning över land eller öar
- ingen ändring av verkliga djuppixlar
- endast kustnära no-data, högst 150 m från både data och strand
- grunt vatten grundas mot land
- djupare vatten grundas bara när lokala konturövergångar stödjer det
- utan konturbevis behålls den djupa zonen till strand
- konturgränsen ritas från samma slutliga fält som färgen

## Geometri

Djup, vattenmask och kartmotor använder:

- EPSG:3857
- samma MapLibre-bbox
- samma tilekoordinater
- 256 px sluttiles
- identisk padding på klient och server
- source zoom upp till 15 och därefter överzoomning

Tileytans ytterkant behandlas inte som land.

## Datakällor

- EMODnet Bathymetry DTM
- MapTiler Streets vattengeometri
- OpenSeaMap seamarks

Se `DJUPLAGER-ANALYS-V9.md` för verifierade fel, algoritm och tester.
