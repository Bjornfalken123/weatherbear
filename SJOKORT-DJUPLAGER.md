# Sjökortets djuplager – v15

## Primär princip

EMODnets externa vektorkurvor från WFS-lagret `emodnet:contours` är gränserna för Weatherbears djupfärger.

Samma externa features används till:

- gränsen mellan färgzonerna
- den synliga djupkurvan
- kurvans sifferetikett

Weatherbear skapar inte egna djupkurvor.

## Färgzoner

- 0–2 m
- 2–3 m
- 3–6 m
- 6–10 m
- 10–20 m
- 20–50 m
- över 50 m

Kurvorna 2, 3, 6, 10, 20 och 50 meter rasteriseras som barriärer. Vattenytan delas i sammanhängande områden mellan barriärerna och MapTilers kust-/ömask. EMODnets råa DTM används för att avgöra vilket färgband varje område tillhör, men får inte flytta den externa kurvans geometri.

## Om data saknas

1. Om området kan kopplas till ett område med rådjup över en extern kurva, bestäms bandet av kurvans djupvärde.
2. Om kurvor saknas men rådjup finns, används rådjupets färgband per pixel.
3. Endast ett område som saknar både kurvstöd och rådjup använder reservregeln:
   - kustanslutet område: 0–2 m
   - fristående havsområde: 20–50 m

Kurvpixlar fylls från angränsande områden innan linjen ritas, så inga transparenta remsor lämnas.

## Datakällor

- EMODnet Bathymetry WFS `emodnet:contours`
- EMODnet ERDDAP `bathymetry_dtm_2024` / `elevation`
- MapTilers aktiva `water`-geometri för kust och öar
- OpenSeaMap för sjömärken

EMODnet-datan är inte avsedd som ersättning för ett officiellt navigationssjökort.
