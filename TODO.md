# Winmix — Párosítás-elemző: ToDo

## [x] 1. Igazolt adatforrások és lefedettség

- Induláskor csak olvasható módon vizsgáld meg a `Winmix713/tertpea` repository tényleges könyvtárait, fájlformátumait és adatszerkezetét, valamint a meglévő Supabase-séma, RLS-szabályok, adatverzió és aktuális rekordlefedettség állapotát.
- Különítsd el az archívumot és az élő Supabase-t, és mutasd meg, melyik forrásból jön az elemzés.
- Jelenítsd meg az igazolt ligák, szezonok és mérkőzések számát; ne állíts teljes történeti lefedettséget, ha az archívum elérése és teljessége nem igazolt.
- Ha a repository vagy a Supabase nem érhető el, jeleníts meg ellenőrizhető integrációs hibalistát, és ne helyettesítsd az adatokat mock vagy kitalált értékekkel.

## [x] 2. Teljes auditfolyamat és valós előrehaladás

- A főoldalról lehessen elindítani és újraindítani a teljes történeti auditot.
- A nagy adatállomány feldolgozása a tényleges forrásformátumnak megfelelő, memóriatakarékos, hibatűrő chunkolt/streaming vagy Web Worker módszerrel történjen; ne egyszerre parse-old az egész nagy állományt a UI főszálán.
- A 0–100%-os előrehaladás valós feldolgozási munkához legyen kötve; jelenítse meg az aktuális fázist, a feldolgozott/összes rekordot, és kövesse a hibákat és kihagyott rekordokat.
- Az elemzés legyen biztonságosan újraindítható. Ne módosíts Supabase-adatot, sémát, RLS-t vagy jogosultságot; ne indíts importot vagy Edge Function-deployt külön jóváhagyás nélkül.

## [x] 3. Teljes ligaszerkezet- és párosításaudit

- Az összes igazolt szezon összes mérkőzését dolgozd fel mindkét virtuális ligában.
- Ellenőrizd a liga-, szezon-, forduló- és mérkőzésszerkezetet, beleértve a 240 meccses szezonokat és a rendezett hazai–vendég csapatpárokat.
- A ligák, csapatok, szezonok és párosítások az igazolt forrásból származzanak; ne hozz létre alternatív adatmodellt és ne következtess hiányzó értékekre.
- A hiányzó félidei eredményt explicit hiányzóként kezeld. A virtuális `HH:MM` értéket ne értelmezd naptári dátumként.

## [x] 4. Páronkénti eredményeloszlás és böngészés

- Minden igazolt rendezett hazai–vendég csapatpárnál mutasd meg a történeti félidei és végeredmény-kombinációk gyakorisági rangsorát, darabszámát és arányát.
- Az előfordulások legyenek visszakövethetők szezonra és fordulóra.
- Az eredmények legyenek böngészhetők és szűrhetők liga, rendezett csapatpár, szezon és forduló szerint.
- A hazai és a vendég csapat külön legördülő listából legyen kiválasztható; a vendéglista a kiválasztott hazai csapat ligájához igazodjon, és csak a kiválasztott hazai–vendég párosítás mérkőzés-információi jelenjenek meg.
- Minden számított mutató mellett jelenjen meg a tényleges mintaszám.
- Mutasd meg a végeredmény és a félidei állás hazai győzelem/döntetlen/vendég győzelem eloszlását; a második félidőben a HT és FT közötti gólszám-változás kimenetelét is.
- Mutasd meg, hogy az érvényes HT/FT mintákon melyik félidőben volt több összgól: „1. félidőben”, „Ugyanannyi”, vagy „2. félidőben”; jelenítsd meg mindhárom darabszámát, mintán belüli arányát és a közös érvényes mintaszámot.
- Mutasd meg a teljes mérkőzés, az első félidő és a második félidő BTTS igen/nem eloszlását, a BTTS×Over/Under 2,5 kombinációit, a kapott gól nélküli meccseket, valamint a teljes/első/második félidő 0,5; 1,5; 2,5; 3,5 és 4,5 gólos Over/Under vonalait.
- Mutasd meg a teljes mérkőzés, az első félidő és a második félidő összgól-eloszlását, külön a hazai és a vendég csapat által szerzett gólok eloszlását, valamint a HT-, FT- és második félidős összes és csapatonkénti gólátlagot.
- Külön jelenjen meg a top 3 pontos HT-eredmény, top 3 pontos végeredmény, top 3 HT→FT kimenetváltás és top 3 pontos HT→FT eredménypár.
- A HT- és második félidős nevezőből hagyd ki a hiányzó HT-adatot; a második félidős mutatót csak összehasonlítható HT/FT állásokból számítsd. Minden arány saját érvényes mintaszámhoz tartozzon.
- Csak a HT- és FT-állásból ténylegesen levezethető adatot jelenítsd meg; gólsorrendre vagy percre bontott gólszerzésre ne következtess.
- A gyakoriságot kizárólag leíró múltbeli statisztikaként jelenítsd meg; ne nevezd jövőbeli valószínűségnek, garantált előrejelzésnek vagy fogadási ajánlásnak.

## [x] 5. Eredményexport és integrációs diagnosztika

- Tedd lehetővé az elemzési eredmények exportját, amennyiben azt az igazolt adatforrás és a platform támogatja.
- Ha valamelyik forrás vagy funkció nem érhető el, mutasd meg a konkrét integrációs hibát és az érintett adatlefedettséget; ne használj mock vagy kitalált adatot.
- Az exportnak tartalmaznia kell a forrást, ligát, csapatpárt, mintaszámot, eredménykombinációk darabszámát és arányát, valamint az előfordulások szezon/forduló hivatkozásait, ha ezek az adatok rendelkezésre állnak.
- A párosítási CSV exportálja a végeredmény/HT/második félidő kimeneteket, az első/azonos/második félidős többgólos mérőszámot, BTTS és BTTS×Over/Under 2,5 bontást, kapott gól nélküli meccseket, 0,5–4,5 gólvonalakat, össz- és csapatonkénti góleloszlásokat és átlagokat, teljes pontos HT/FT és HT→FT eloszlásokat, top-3 listákat, érvényes mintaszámokat és szezonbontásokat.
