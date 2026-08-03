# Verifiering v15

Kontroller utförda före paketering:

- samtliga inline-JavaScriptblock klarar `node --check`
- samtliga Cloudflare Functions klarar `node --check`
- projektets build-kommando passerar
- inga nya duplicerade HTML-id:n har införts
- WFS-proxyn testad med simulerat GeoJSON-svar och attributen `Elevation`/`Elevation1`
- WFS-frågan använder `emodnet:contours`, GeoJSON och EPSG:3857-bbox
- syntetiskt test med externa 2- och 6-meterskurvor ger tre separata färgområden
- kustsidan blir 0–2 m, området mellan kurvorna får rätt band och djupsidan behåller sitt djupband
- kurvpixlar fylls och lämnar inga transparenta remsor
- land förblir transparent
- reservtest utan WFS-kurvor behåller flera rådjupsfärger och kollapsar inte till en färg
- gamla klientgenererade kurvor, WMS-kurvor och fasta kustdjupsschabloner finns inte i aktiv kod

Extern DNS var blockerad i testmiljön. Därför är WFS-anropets kontrakt, normalisering och klientbearbetning testade med ett simulerat svar i det dokumenterade GeoJSON-formatet; faktisk visuell kontroll mot live-tjänsten sker efter publicering.
