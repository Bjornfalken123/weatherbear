# Weatherbear Depth Layer v8

Weatherbears sjökort använder EMODnet DTM 2024 som fri rikstäckande djupkälla och den aktiva MapTiler-stilens ofiltrerade `water`-geometri som gemensam kustreferens.

## Lagerordning

1. MapTilers befintliga baskarta med Weatherbears dag-/nattpalett för land
2. låg nattdämpning av baskartans vägar och texter
3. neutral vattenyta från exakt samma MapTiler-vattenkälla som kustmasken
4. Weatherbear djupfärg
5. Weatherbear djupkurvor
6. kustlinje från samma MapTiler-vattengeometri
7. OpenSeaMap sjömärken
8. användarposition och navigationsgränssnitt

## Viktiga egenskaper

- djup och MapTiler använder EPSG:3857, samma bbox, 256 px tile-grid och source zoom 15
- WMS-analysrastret använder närmaste granne för att inte blanda no-data med verkligt djup
- bara helt opaka gråskalepixlar får vara källa för kustuppskattningen
- djup och konturer klipps med samma vattenmask och mjuka kusttäckning
- kustfyllning begränsas både av avstånd till verklig data och avstånd till land
- grunda värden avtar försiktigt mot stranden; djupa värden behålls om en tydlig grundning inte kan verifieras
- land och öar är hårda barriärer
- dagland använder den tidigare ljusa beige kartkänslan utan en separat kustdatakälla
- nattläget använder en låg-luminanspalett och en betydligt svagare svart dämpning
- ingen röd eller flerfärgad reservkarta ligger bakom

## Datakällor

- EMODnet Bathymetry DTM 2024
- MapTiler Streets aktiva vattengeometri
- OpenSeaMap seamarks

Se `DJUPLAGER-ANALYS-V8.md` för testresultat och kvarvarande begränsningar.
