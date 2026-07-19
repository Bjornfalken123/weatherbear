# Weatherbear sjökort – verifierad analys v8

## Konstaterat fel i v7

V7 begärde det numeriska analysrastret med bilinjär interpolation. Vid gränsen mellan EMODnet-data och transparent no-data blandades alfakanal och gråskalevärde. Delvis transparenta kustpixlar kunde därför misstolkas som riktiga, grunda djupvärden. Det försämrade uppskattningen precis där kustfyllningen skulle hjälpa.

## Korrigering

- Djupanalysen begärs med `nearest` från WMS.
- Konturer använder fortsatt bilinjär återgivning.
- Endast alfavärden på minst 245 av 255 och nästan ren gråskala accepteras som verkliga djupkällor.
- MapTilers vattenpolygon rasteriseras både som binär barriär och som 8-bitars kusttäckning.
- Den binära masken styr var beräkningen får röra sig.
- Kusttäckningen styr den slutliga mjuka alfaklippningen vid strandlinjen.

## Kustnära fyllning

Fyllning får endast ske när alla villkor är uppfyllda:

- pixeln saknar verklig djupdata
- pixeln ligger i samma sammanhängande vattenområde som källdatan
- avståndet till verklig djupdata är högst 55 meter
- avståndet till MapTilers kustlinje är högst 45 meter
- pixeln ligger kustnärmare än den verkliga källpunkten
- en rak vattenväg mellan källa och mål passerar inte land

Grunt källdjup upp till 4 meter avtar monotont mot strand när ingen säker lokal lutning finns. Mellandjup 4–8 meter minskar bara svagt. Djupt vatten behålls om en statistiskt trovärdig kustgradient inte kan verifieras.

## Matchning mot MapTiler

- Samma ofiltrerade `water` source-layer används för synligt vatten, kustlinje och pixelmask.
- Djup och konturer använder samma bbox och source zoom 15.
- En tunn kustlinje från samma geometri täcker mindre skillnader i rasterantialiasing.
- Landfärgen skapas genom att färgsätta baskartans egna bakgrunds-, landuse- och byggnadslager. Ingen separat landkälla används.

## Nattläge

Nattläget följer etablerad sjökortspraxis med låg luminans och dämpade färger i stället för ett kraftigt svart filter:

- mörkt varmbrunt land
- mycket mörkt blågrått vatten
- grundare vatten något ljusare än djupt vatten
- dämpade bruna djupkurvor och kustlinje
- sjömärken behåller färgskillnader men får lägre luminans
- baskartans dämpningslager har minskats från 0,62 till 0,28

## Automatiska tester

- samtliga inline-JavaScriptblock klarar `node --check`
- samtliga Cloudflare Functions klarar `node --check`
- syntetiskt grunt kusttest ger monotont grundare värden mot land
- syntetiskt djupt kusttest behåller djupt vatten utan bevisad gradient
- allmänna no-data-hål ute till havs fylls inte
- landbarriärer stoppar spridning mellan vattenområden
- delvis transparenta kustblandningar accepteras inte som verklig data
- dagpaletten för land kan aktiveras och originalstilen återställas

## Fysisk begränsning

Återgivningen och kustanslutningen kan förbättras, men EMODnets faktiska geografiska mätupplösning förändras inte. V8 är fortfarande inte ett officiellt navigationssjökort.
