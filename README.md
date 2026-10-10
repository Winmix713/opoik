# Winmix — Párosítás-elemző

A Winmix két virtuális ligájának történeti mérkőzéseit, rendezett hazai–vendég párosításait és HT→FT eredménymintáit auditáló, böngészőben futó elemzőfelület.

## Igazolt adatforrás és hatókör

Az audit a [Winmix713/tertpea](https://github.com/Winmix713/tertpea) nyilvános repository `08_eredeti` archívumából dolgozik. A `public/archive-manifest.json` a forrásfájlokat és SHA-1 blob hashüket az alábbi commithez rögzíti:

`bf019ab7460994c7523cb70518f0e07c5d104c81`

Az auditkor igazolt archívum **103 szezonfájlt** tartalmazott: **62 angolt és 41 spanyolt**, szezononként 240, összesen **24 720 mérkőzéssel**. A forrásfájlok mérete összesen **92 923 498 bájt**. A teljes idejű eredmény mind a 24 720 rekordnál rendelkezésre állt; **5 520 angol mérkőzésnél hiányzott a félidei eredmény**, ezt a rendszer hiányzóként kezeli, nem imputálja.

A vizsgált ligákban 16 fix csapat és 240 **irányított** hazai–vendég párosítás van ligánként (480 összesen). A szezonok szerkezete 30 × 8 mérkőzés. A forduló a mérkőzéssorrendből, nyolcas blokkokban vezethető le; a virtuális `HH:MM` érték nem valós naptári időpont. Az audit 103/103 szezonfájlnál hash- és szerkezeti megfelelést talált, SHA-1 eltérés nélkül.

## Mit csinál a felület?

- A főoldalról indítható és újrafuttatható a teljes audit.
- Az archívum letöltése, SHA-1 ellenőrzése és rekordfeldolgozása Web Workerben, legfeljebb négy párhuzamos szezonfájl feldolgozásával történik; a 0–100%-os kijelző valós fájl-, meccs- és bájtszámlálókat mutat.
- Böngészhető a liga-, csapatpár-, szezon- és fordulószintű eredményeloszlás. Hazai és vendég szerep külön marad.
- A HT→FT átmenetek és a pontos HT→FT eredménykombinációk darabszámmal és mintán belüli aránnyal jelennek meg.
- CSV/JSON export tölthető le az auditból.
- A „Adatminőség” nézet minden szezon checksumját, eredményszámát, csapatait, párosításait, HT-hiányát és fordulóblokkjait listázza.
- A gyakoriság leíró múltbeli statisztika; nem jövőbeli valószínűség, eredményígéret vagy fogadási ajánlás.

## Supabase-kapcsolat és biztonság

A Supabase-panel csak a böngészőből, a Supabase **publishable** klienskulccsal és a meglévő RLS-szabályok szerint olvas. A lekérdezések az aktuális verzió láthatóságát és a szezon-/mérkőzésszámokat ellenőrzik; írást, importot, sémamódosítást, RLS- vagy jogosultságmódosítást nem végeznek. A történeti elemzés forrása a commithez rögzített GitHub-archívum, nem a Supabase.

Az utolsó read-only ellenőrzéskor az adatbázisban egy `v1.0-draft` adatverzió, két szezon és 480 mérkőzés volt. Mivel nem volt publikus current verzió, az RLS-en keresztül a kliens nem látott aktuális publikált adatkészletet; a frontend ezt külön jelzi, és a draft adatok nem kerülnek a GitHub-archívum elemzésébe. **Service-role kulcsot soha ne tegyél frontendbe.**

A Manus WebDev-projektben a `VITE_SUPABASE_URL` és `VITE_SUPABASE_PUBLISHABLE_KEY` változók védett projektkörnyezeti változóként vannak beállítva. Helyi futtatáshoz készíts `.env.local` fájlt az `.env.example` alapján, és csak a publishable klienskulcsot használd.

## Fejlesztői futtatás

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Ellenőrzés és build:

```bash
pnpm check
pnpm build
```

A production build a `dist/` könyvtárba kerül. Az audit eredményeit a felület CSV vagy JSON formátumban tölti le; 92,9 MB-os teljes forrásarchívum nem kerül a frontend bundle-be.
