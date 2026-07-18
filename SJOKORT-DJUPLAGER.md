# Weatherbear Depth Layer v7

Weatherbears sjökort använder EMODnet DTM 2024 som fri rikstäckande råkälla och MapTilers aktiva `water`-geometri som gemensam kustmask.

## Lagerordning

1. MapTilers befintliga baskarta
2. nattdämpning vid nattläge
3. neutral vattenyta från exakt samma MapTiler-vattenkälla
4. Weatherbear djupfärg
5. Weatherbear djupkurvor
6. OpenSeaMap sjömärken
7. användarposition och navigationsgränssnitt

## Viktiga egenskaper

- djup och MapTiler använder samma EPSG:3857-bbox och 256 px tile-grid
- båda använder kustgeometri upp till source zoom 15
- djup och konturer klipps med samma vattenmask
- 2× serverrendering används vid detaljzoom och samplas ned till 256 px
- kustfyllning arbetar med numeriska djupvärden, inte kopierade RGB-färger
- fyllning begränsas till no-data mot land och högst 50 meter
- land är en barriär i beräkningen
- dag och natt har separata paletter
- ingen främmande färgad reservkarta ligger bakom

## Datakällor

- EMODnet Bathymetry DTM 2024
- MapTiler aktiv Streets-vattengeometri
- OpenSeaMap seamarks

Se `DJUPLAGER-ANALYS-V7.md` för verifierade begränsningar och tester.
