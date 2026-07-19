# Weatherbear sjökort – verifierad analys v7

## 1. Verklig upplösning

Den fria rikstäckande källan är EMODnet DTM 2024, 1/16 × 1/16 bågminut. Den kan inte ge samma uppmätta detalj som ett licensierat navigationssjökort. V7 skapar därför inte falska nya mätpunkter.

V7 förbättrar återgivningen genom att:

- begära 2× renderingsstorlek från WMS vid zoom 10–15
- sampla ned med högkvalitativ linjär filtrering
- använda zoom 15 i både MapTilers vattengeometri och Weatherbears raster innan överzoomning
- hämta ett kontinuerligt gråskalekodat analysraster med cirka 0,5 m numeriska steg för kustalgoritmen

Det sista förbättrar beräkning och färgövergångar, men inte rådatans geografiska mätupplösning.

## 2. Kustmatchning

Det tidigare djuplagret hade max source zoom 14 medan MapTilers vattenkälla går till zoom 15. Det innebar att kustlinjen kunde generaliseras på olika zoomnivåer.

V7 använder:

- EPSG:3857 i båda systemen
- MapLibres exakta `{bbox-epsg-3857}`
- 256 px logisk tile-storlek
- samma z/x/y och samma aktiva MapTiler `water` source-layer
- max source zoom 15 för djup och konturer
- samma vattenmask för djupfärg och djupkurvor

Ingen separat Planet-/Land-reservkälla används om den aktiva stilens exakta vattenkälla saknas. Då avstår lagret hellre från uppskattning än använder en annan kustversion.

## 3. Kustnära no-data

V7 behandlar bara transparenta no-data-pixlar på vattensidan av MapTilers kustmask.

- Land och öar är hårda barriärer.
- Fyllning får inte passera land eller hoppa mellan separata vattenområden.
- Fyllning sker bara mot land, aldrig som generell lagning av hål ute till havs.
- Maxavståndet är 50 meter.
- Grunda källvärden utan säker trend avtar försiktigt mot strand.
- Djupa källvärden behålls djupa om grannvärdena inte visar en trovärdig grundning mot land.
- Om en lokal, vattenansluten regression visar att djupet minskar mot strand används den lutningen.
- Originaldata ändras aldrig.

## 4. Nattläge

Nattläget använder en egen låg-luminanspalett, mörk baskartsdämpning, dämpade sjömärken och varm orange text i navigationsmoduler. Dag- och nattkonturer genereras separat. Den röda EMODnet-reservkartan används inte.

## 5. Inträde i sjökort

När en giltig GPS-position finns eller anländer:

- kartan centrerar på användaren
- följläge aktiveras
- minsta ingångszoom är 13,5
- en redan närmare zoom behålls
- manuell panorering avbryter följläget

Vid Orust motsvarar zoom 13,5 ungefär 7,1 meter per skärmpixel, cirka 2,9 km över en 400 px bred kartvy.

## Verifierade tester

- Alla inline-JavaScriptblock klarar `node --check`.
- Alla Cloudflare Functions-filer klarar `node --check`.
- Endpoint-test verifierar EPSG:3857, `tiled=false`, 2× WMS-storlek, halo/padding och separat nattstil för konturer.
- Syntetiska kusttester verifierar grundning mot strand, bevarat djupt vatten utan bevisad gradient, stopp vid landbarriär och att originalvärden inte skrivs över.
- Inga dubbla HTML-id:n finns.
- Lokala appresurser finns i paketet.
- Täckningsgränsen omfattar representativa kustpunkter från Strömstad till Haparanda.

## Kvarvarande fysisk begränsning

V7 är en bättre och mer konsekvent visualisering. Den är inte ett officiellt navigationssjökort och får inte beskrivas som ersättning för ett sådant. Verkligt högre svensk kustupplösning kräver licensierad data eller särskilda högupplösta dataset där användningsvillkor och täckning tillåter det.
