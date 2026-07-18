# Ändring av sjökortskälla

Sjökortslägets baskarta har ändrats från CARTO Light till EMODnet Bathymetry World Base Layer (WMTS):

`https://tiles.emodnet-bathymetry.eu/2020/baselayer/web_mercator/{z}/{x}/{y}.png`

OpenSeaMap Seamark ligger kvar som transparent lager ovanpå:

`https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png`

Det tidigare specialbyggda WMS-lagret `emodnet:mean_multicolour`, som hämtades som en hel kartbild och färgades om i canvas, är avstängt. Det gav dubbla bathymetriska lager och kunde ge fel färger samt otydlig land-/vattengräns.

## Attribution

Visa attribution för både EMODnet och OpenSeaMap i kartan. EMODnet-produkten anges som CC BY 4.0.

## Begränsning

Detta är en kostnadsfri öppen kartlösning, men inte ett officiellt navigationssjökort och ska inte marknadsföras som ersättning för uppdaterade officiella sjökort.
