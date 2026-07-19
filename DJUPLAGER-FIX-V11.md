# Grundorsak och verifiering – v11

## Grundorsak

V9 och v10 behandlade ett WMS-renderat PNG-svar som om det vore en säker numerisk datakanal. Klienten förväntade sig sju interna signaturfärger från en dynamisk `SLD_BODY`. Den kontrakten var inte verifierad mot det verkliga EMODnet-svaret. När signaturerna saknades avvisades alla pixlar och MapTilers vanliga vattenfärg blev det enda synliga lagret.

Lokala tester av intervall och färgavkodare kunde därför passera utan att bevisa att produktionsservern skickade samma färger.

## Lösning

- Ny endpoint: `functions/api/depth-grid.js`
- Källa: EMODnet ERDDAP `bathymetry_dtm_2024`
- Variabel: `elevation`
- Vatten: negativ elevation omvandlas till positivt djup
- Land/no-data: positiva eller ogiltiga värden lämnas tomma
- Klassning och färgsättning sker helt i Weatherbear
- Det separata WMS-konturlagret har tagits bort
- Den gamla `/api/depth-tile`-funktionen har tagits bort

## Genomförda tester

1. Endpointen kördes med ett simulerat ERDDAP-svar.
2. Den genererade officiell griddap-syntax med latitud, longitud och stride.
3. Land och null blev no-data.
4. Testdjupen 1, 2,5, 4,5, 8, 15, 35 och 75 meter blev zonerna 0–6 i rätt ordning.
5. Ingen aktiv kod refererar till `/api/depth-tile`, `SLD_BODY` eller ett separat kontur-WMS.
6. Alla JavaScript-filer och inline-script klarar syntaxkontroll.
