# Weatherbear v18 – fyr/boj-panel och molnlager

## Fyr- och bojdata

På mobil behåller väder-/stationspanelen samma kompakta bredd och innehållshöjd när `Se mer` aktiveras. Stationsdata läggs i samma scrollbara innehåll i stället för att göra hela panelen större.

Ett draghandtag finns längst ned i panelen när `Se mer` är aktivt. Drag nedåt ökar panelens innehållshöjd. Vid släpp snäpper den till kompakt, mellan eller full höjd. Tangentbord stöds med pil upp/ned samt Home/End.

Desktoplayouten och övriga gardiner ändras inte.

## Molnlager

Tidigare betraktades ett molnsteg som cachat så snart MapLibre-källan hade skapats. Det innebar inte att rasterrutorna var färdigladdade. Ett tomt lager kunde därför ersätta den synliga bilden och först visas efter att användaren gått fram och tillbaka i tiden.

V18 gör i stället följande:

- kontrollerar `isSourceLoaded` och väntar på `sourcedata`/`idle`
- behåller föregående synliga molnbild tills nästa tidssteg är färdigt
- avbryter visuellt äldre väntande tidssteg vid snabb tidsdragning
- samlar snabba tidsändringar innan nytt steg begärs
- förladdar bara när huvudsteget är färdigt
- förladdar ett steg åt gången och bara närmaste grannar
- begränsar antalet cachade molnsteg
- försöker en gång till om en källa inte blir färdig inom timeout

## Kontroller

- Alla inline-script syntaxkontrollerade med Node.
- Alla Cloudflare Functions syntaxkontrollerade.
- Projektets build-kommando passerar.
- Molnlogiken testad med simulerad MapLibre-källa för:
  - ingen växling före färdig laddning
  - gammal bild ligger kvar under laddning
  - senaste tidssteget vinner vid snabba byten
  - en ofärdig cachepost behandlas inte som färdig
- Panelhöjdens kompakt-, drag- och maxgränser testade med simulerad DOM.
