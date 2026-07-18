# Analys av kustfyllningen – v5

## Problem i v4

1. Radien var 4–30 pixlar utan hänsyn till verklig kartskala. Runt svensk kust kunde den därför fylla omkring 150–350 meter på vissa zoomnivåer.
2. Alla transparenta pixlar inom radien fick full opacitet. Det gav en hård kant.
3. Varje tile analyserades utan grann-data. Det kunde ge skarvar och välja fel närmaste punkt nära tilegränsen.
4. Avståndet byggde på en vanlig åttagranns-BFS och blev visuellt fyrkantigt.

## Lösning i v5

- Högst cirka 36 meters interpolation vid zoom 11–14.
- Ingen artificiell interpolation under zoom 11.
- Närmaste giltiga djuppunkt beräknas med chamfer-avstånd (10/14-vikter).
- Full färg närmast riktig data och mjuk alpha-avtoning i de sista 45 procenten av radien.
- Två lätta färgutjämningspass endast på interpolerade pixlar. Originaldata lämnas orörd.
- Ett dynamiskt halo på 4–10 pixlar hämtas från WMS runt varje tile och beskärs sedan tillbaka till 256 × 256.
- WMS använder bilinjär omsampling för att undvika bicubisk översvängning vid no-data-gränser.
- Cacheversionen är höjd till v5, så gamla v4-tiles används inte.

## Förväntad radie kring Orust

| Zoom | Fyllradie | Ungefärlig verklig bredd |
|---|---:|---:|
| 9–10 | 0 px | 0 m |
| 11 | 1 px | cirka 40 m |
| 12 | 2 px | cirka 40 m |
| 13 | 4 px | cirka 40 m |
| 14 | 7 px | cirka 35 m |

Skillnaden beror på avrundning till hela pixlar. Landmasken klipper fortfarande resultatet vid MapTilers kustlinje.
