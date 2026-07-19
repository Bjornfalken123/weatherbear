# Weatherbear Depth Layer v11

V11 använder råa numeriska djupvärden från EMODnet ERDDAP. Djuplagret är inte längre beroende av att en extern WMS-server accepterar en egen färgstil.

## Datakedja

1. MapLibre skickar tile-rutans exakta EPSG:3857-bbox till `/api/depth-grid`.
2. Funktionen omvandlar bboxen till geografiska koordinater och frågar EMODnet ERDDAP-datasetet `bathymetry_dtm_2024` efter variabeln `elevation`.
3. Negativ elevation omvandlas till positivt djup i meter. Positiv elevation och NaN behandlas som land/no-data.
4. Webbläsaren interpolerar rågriddet till samma pixelgrid som MapLibre använder.
5. Varje rådjup klassas lokalt i en av sju Weatherbear-zoner.
6. Samma MapTiler-vattengeometri används som mask för kust, öar och sund.
7. Endast kustnära no-data fylls. Riktiga källdata skrivs aldrig över.
8. Färggränser och tunna djupkurvor ritas från samma slutliga zonfält.

## Djupzoner

- 0–2 m
- 2–3 m
- 3–6 m
- 6–10 m
- 10–20 m
- 20–50 m
- djupare än 50 m

Dag- och nattläge använder samma gränser men olika paletter.

## Varför WMS-lösningen togs bort

Tidigare versioner använde `SLD_BODY` på ett WMS-anrop och försökte därefter avkoda serverns bildfärger som numeriska zoner. Det gav ingen stabil garanti för att servern faktiskt returnerade de interna färgkoder som klienten väntade sig. Om svaret hade en annan stil eller blev transparent syntes bara MapTilers enfärgade vatten.

V11 hämtar i stället det dokumenterade råvärdet `elevation` från ERDDAP och gör klassningen lokalt.

## Täckning och cache

- geografiskt område: 8–27° E och 53–67° N
- råkälla: EMODnet DTM 2024
- dynamiskt stride begränsar varje rågrid till högst cirka 112 prover per axel
- svar cachas i sju dagar
- cacheversion: v11

## Kustanslutning

- vattenmask och synlig kust kommer från samma MapTiler-källa
- fyllning får inte passera land, öar eller näs
- grunt vatten kan grundas mot stranden
- djupare vatten grundas endast när lokala zongränser stödjer det
- om stöd saknas behålls närmaste djupzon till stranden
- offshore-hål fylls inte av kustalgoritmen
