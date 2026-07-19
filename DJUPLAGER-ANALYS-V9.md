# Djupanalys v9

Denna version bygger på en kodgranskning av v8.1 och automatiska tester av kustfyllningen.

## Verifierade fel i v8.1

1. Ett enfärgat MapTiler-vattenlager låg helt opakt bakom djupet. När djupbilden blev transparent såg allt vatten därför ut att ha samma djupfärg.
2. Djupet kodades som en kontinuerlig gråskala som var känslig för bildkvantisering och no-data-kanter.
3. Klienten kunde begära 56 pixlars padding, medan servern kapade samma värde till 16 pixlar. Vattenmask och djupbild kunde därför få olika dimensioner och ge transparenta tiles.
4. Ytterkanten på bearbetningsytan räknades som land. Det förvrängde avståndet till verklig kust och den lokala riktningen tvärs över djupkurvor.
5. Kustfyllningen var begränsad till 45–55 meter, vilket kunde lämna remsor mellan sista datacell och MapTilers strandlinje.

## V9-metod

### Exakta djupzoner

EMODnets medeldjup kodas server-side som sju diskreta klasser med samma gränser som sjökortets djupkurvor:

- 0–2 m
- 2–3 m
- 3–6 m
- 6–10 m
- 10–20 m
- 20–50 m
- djupare än 50 m

GeoServer skickar klasserna som en paletterad PNG. Webbläsaren avkodar klassen och applicerar Weatherbears dag- eller nattfärger. Därmed kan en gråton inte feltolkas som en annan djupzon.

### Kustfyllning

- Bara vatten enligt samma MapTiler-källa som baskartan behandlas.
- Riktiga EMODnet-pixlar ändras aldrig.
- Bara no-data-pixlar som ligger landward från en verklig djuppixel kan fyllas.
- Avståndet till både data och kust begränsas till 150 meter. Det motsvarar drygt en EMODnet-ruta på cirka 115 meter plus kust-/cellcentrummarginal.
- Tilekanten räknas aldrig som land.
- Land och öar är hårda barriärer.

### Konturberoende slutsats

- Närmaste verkliga djupzon används som utgångspunkt.
- För 0–3 m grundas zonen monotont mot strand.
- För djupare vatten analyseras närliggande, ordnade zonövergångar tvärs över kustens avståndsfält.
- Djupare vatten blir bara grundare när minst två lokala djupzoner visar att djupet ökar ut från land.
- Utan sådan evidens behålls samma djupzon fram till kust. Detta motsvarar en möjlig brant kust och undviker att skapa en påhittad grundbank.
- Uppskattningen får inte passera fler zoner än de lokalt observerade konturövergångarna stödjer.

### Konturlinjer

En tunn gräns ritas från det färdiga klassfältet. Därmed följer färggräns och konturlinje exakt samma kustfyllda geometri. EMODnets separata konturlager används främst för djupetiketter och har nedtonade linjer.

## Automatiska tester

Följande fall passerar:

- 2–3 m-data fylls hela vägen till vattenmaskens strandkant och blir grundare.
- Djupt vatten utan ordnade konturer behåller sin djupzon till land.
- Ordnade djupzoner ut från kust tillåter en grundare kustzon.
- Ett no-data-hål offshore fylls inte.
- Fyllning passerar inte en landbarriär.
- Serverns och klientens padding ger samma bilddimension.
- WMS-anropet använder `image/png8`, nearest-neighbour och intervall-SLD.

## Begränsning

V9 förbättrar kartografin och no-data-behandlingen. Den skapar inte nya uppmätta djup. Kustfyllda områden är en kontrollerad visualisering och ska inte behandlas som officiell navigationsdata.
