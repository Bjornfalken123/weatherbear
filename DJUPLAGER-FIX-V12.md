# Verifierade ändringar – v12

## Grundproblem i v11

V11 kastade bort de kontinuerliga djupvärdena tidigt och ersatte varje pixel med ett representativt zonvärde. Djupkurvor ritades därefter som enkla pixelkanter mellan zonerna. Det gjorde linjerna kantiga och omöjliggjorde korrekta kurvetiketter.

## Korrigering

- kontinuerliga djupvärden bevaras genom kustinferens och rendering
- no-data-interpolation kräver minst 55 procent giltig bilinjär vikt
- uppskattade kustdjup jämnas försiktigt, medan källdata är låsta
- färgövergången antialiasas bara i en smal zon runt varje nivå
- marching squares används vid 2, 3, 6, 10, 20 och 50 meter
- etiketter ritas längs samma kurvsegment med dag-/natthalo
- rasterresampling är linjär för att minska trappsteg vid inzoomning
- cacheversionen är v12

## Maskinella tester

Ett syntetiskt 512 × 512-djupfält verifierade att samtliga sex nivåer skapar kurvsegment och att zonerna 1, 2,5, 4,5, 8, 15, 35 och 75 meter ger sju separata färger. Konturgenereringen skapade cirka 4 600 segment på ungefär 60 ms i Node-testmiljön.
