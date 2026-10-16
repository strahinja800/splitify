# Splitify: aplikacija za podelu računa

> Ovaj fajl opisuje projekat, pravila i trenutni plan izrade.
> Stoji u root-u repoa da bi Claude Code imao kontekst.

## 1. Šta je projekat

Web aplikacija (mobile-first) za podelu troškova u društvu: ko je šta platio, ko kome koliko duguje
i kako da se svi izravnaju sa najmanje uplata.

Glavna razlika u odnosu na obične „podeli na jednako“ aplikacije: **račun se deli po stavkama**.
Primer: u kafiću je jedan uzeo kafu (150), drugi sok (250), treći pljeskavicu (300). Račun je 700,
i svako plaća ono što je uzeo, a ne 233,33.

Stavke se unose na dva načina:

1. **Skeniranjem QR koda sa srpskog fiskalnog računa.** Iz QR linka se preko servera Poreske
   uprave (suf.purs.gov.rs) dobija tačna lista stavki sa cenama.
2. **Ručno.** Naziv, cena, količina. Ovo je obavezan put, a ne samo rezerva, jer QR nekad ne može
   da se pročita ili račun nije fiskalni.

Projekat je portfolio projekat za React/Next.js poziciju. Kvalitet koda, testovi i čitljiva
struktura su bitni koliko i funkcionalnosti.

## 2. Stack

- **Next.js** (App Router) + **TypeScript** (strict)
- **Tailwind CSS** + **shadcn/ui**
- **Prisma** + **PostgreSQL** (Neon)
- **Auth:** TODO, isto rešenje kao u projektu JobSprint (dopuniti)
- **Zod** za validaciju svih ulaza (forme, API body)
- **QR skener u browseru:** `@zxing/browser` ili `html5-qrcode` (uživo kamerom + upload slike)
- **Playwright** (`@playwright/test`) za testove: e2e testovi glavnih tokova kroz browser, a čiste
  funkcije iz `src/lib/` (podela, balansi, poravnanje, parser računa) testiraju se istim test
  runnerom, bez otvaranja browsera
- Deploy: **Vercel**

## 3. Pravila rada (za Claude Code)

- **Vlasnik projekta sam piše kod.** Tvoja uloga je mentor: objašnjavaš šta treba uraditi i zašto,
  predlažeš pristup i strukturu, daješ hintove, kratke primere za koncepte i code review onoga što
  je napisao. **Ne pišeš implementaciju umesto njega i ne menjaš njegove fajlove**, osim ako za
  određeni feature ili zadatak izričito kaže da to uradiš ti. Takva dozvola važi samo za taj
  feature, ne i za sledeće.
- Kad on pita „kako da uradim X“, prvo objasni korake i daj mu da proba. Kompletno rešenje daješ
  tek kad ga traži ili kad zapne.
- **Ne radi `git commit` ni `git push`.** Vlasnik repoa sam commituje i pushuje. Kad završiš korak,
  napiši kratak predlog commit poruke.
- Radi u malim koracima koji prate plan iz sekcije 9. Ne preskači faze i ne dodaj funkcionalnosti
  koje nisu tražene.
- Objasni važne odluke ukratko. Ovo je projekat za učenje, pa vlasnik treba da razume kod.
- Server Actions ili Route Handlers. Sve što menja podatke prvo prolazi Zod validaciju i proveru
  da je korisnik član grupe.
- Čista poslovna logika (podela, balansi, poravnanje, parser računa) ide u `src/lib/` kao čiste
  funkcije bez Prisme i bez `fetch`-a, i svaka ima testove.
- **Aplikacija je na engleskom.** Svi tekstovi koje korisnik vidi (dugmad, naslovi, labele, poruke o
  greškama, prazna stanja, istorija aktivnosti) su na engleskom, npr. "Settled", "Enter manually",
  "Scan QR". Imena u kodu (promenljive, funkcije, rute, tabele) su takođe na engleskom. Ovaj fajl i
  komunikacija sa vlasnikom ostaju na srpskom.

## 4. Novac: pravila koja se ne krše

- **Svi iznosi se čuvaju i računaju kao celi brojevi u parama** (`Int`). 1.234,56 din = `123456`.
- Nikad `Float` za novac. Jedini `Float` u bazi je `ExpenseItem.quantity`, jer služi samo za prikaz
  (npr. 0,456 kg).
- Iznosi sa fiskalnog računa dolaze kao float u dinarima i odmah se pretvaraju:
  `Math.round(x * 100)`.
- Kad se iznos deli, **zbir delova mora biti tačno jednak celini**. Ostatak se raspodeljuje
  metodom najvećeg ostatka (vidi 6.1).
- Prikaz: formatiranje tek u UI-ju, preko jedne helper funkcije (npr. `formatMoney(para)`) koja
  koristi `Intl.NumberFormat("en-US", { style: "currency", currency: "RSD" })`.

## 5. Model podataka

```prisma
model User {
  id      String   @id @default(cuid())
  name    String?
  email   String   @unique
  members Member[]
  // + auth polja/modeli
}

model Group {
  id         String    @id @default(cuid())
  name       String
  inviteCode String    @unique @default(cuid())
  createdAt  DateTime  @default(now())
  members    Member[]
  expenses   Expense[]
  payments   Payment[]
  activities Activity[]
}

model Member {
  id      String  @id @default(cuid())
  name    String
  groupId String
  group   Group   @relation(fields: [groupId], references: [id], onDelete: Cascade)
  userId  String? // null = "gost" član bez naloga; može kasnije da ga preuzme registrovan korisnik
  user    User?   @relation(fields: [userId], references: [id])

  paidExpenses     Expense[]      @relation("PaidBy")
  shares           ItemShare[]
  splits           ExpenseSplit[]
  paymentsSent     Payment[]      @relation("PaymentFrom")
  paymentsReceived Payment[]      @relation("PaymentTo")
  activities       Activity[]     @relation("ActivityActor")

  @@unique([groupId, userId])
}

enum ExpenseSource {
  MANUAL
  QR
}

model Expense {
  id            String        @id @default(cuid())
  groupId       String
  group         Group         @relation(fields: [groupId], references: [id], onDelete: Cascade)
  title         String
  paidById      String
  paidBy        Member        @relation("PaidBy", fields: [paidById], references: [id])
  total         Int           // pare
  tip           Int           @default(0)
  date          DateTime      @default(now())
  source        ExpenseSource @default(MANUAL)
  receiptNumber String?       // broj fiskalnog računa (samo za QR)
  storeName     String?
  createdAt     DateTime      @default(now())
  items         ExpenseItem[]
  splits        ExpenseSplit[]

  @@unique([groupId, receiptNumber]) // isti fiskalni račun ne može dvaput u istu grupu
}

model ExpenseItem {
  id        String      @id @default(cuid())
  expenseId String
  expense   Expense     @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  name      String
  quantity  Float
  unitPrice Int
  total     Int
  shares    ItemShare[]
}

model ItemShare {
  itemId   String
  item     ExpenseItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  memberId String
  member   Member      @relation(fields: [memberId], references: [id], onDelete: Cascade)
  units    Int         @default(1) // težina udela: "Pivo ×3" → Marko 2, Đorđe 1

  @@id([itemId, memberId])
}

model ExpenseSplit {
  expenseId String
  expense   Expense @relation(fields: [expenseId], references: [id], onDelete: Cascade)
  memberId  String
  member    Member  @relation(fields: [memberId], references: [id], onDelete: Cascade)
  amount    Int     // koliko član duguje za ovaj račun (uključujući bakšiš)

  @@id([expenseId, memberId])
}

model Payment {
  id      String   @id @default(cuid())
  groupId String
  group   Group    @relation(fields: [groupId], references: [id], onDelete: Cascade)
  fromId  String
  from    Member   @relation("PaymentFrom", fields: [fromId], references: [id])
  toId    String
  to      Member   @relation("PaymentTo", fields: [toId], references: [id])
  amount  Int
  date    DateTime @default(now())
}

enum ActivityType {
  GROUP_CREATED
  MEMBER_ADDED
  MEMBER_JOINED     // registrovan korisnik se pridružio ili preuzeo gost člana
  MEMBER_REMOVED
  EXPENSE_CREATED
  EXPENSE_UPDATED
  EXPENSE_DELETED
  PAYMENT_CREATED
  PAYMENT_DELETED
}

model Activity {
  id        String       @id @default(cuid())
  groupId   String
  group     Group        @relation(fields: [groupId], references: [id], onDelete: Cascade)
  actorId   String?      // član koji je izvršio akciju
  actor     Member?      @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)
  type      ActivityType
  data      Json         // snimak podataka u trenutku akcije (naslov, iznos, imena...)
  createdAt DateTime     @default(now())

  @@index([groupId, createdAt])
}
```

Napomene:

- `ExpenseSplit` se **izračunava** iz stavki i udela (6.1) i čuva pri snimanju računa. Pri izmeni
  računa se briše i računa ponovo, u istoj transakciji.
- `Expense.total` mora biti jednak zbiru `ExpenseItem.total` (bakšiš se vodi posebno u `tip`).

## 6. Poslovna logika

### 6.1 Podela računa: `splitExpense(items, tip) → Map<memberId, amount>`

Ulaz: stavke (`total` u parama) i za svaku stavku lista `{ memberId, units }`, plus bakšiš.

1. **Po stavci:** `total` stavke se deli članovima srazmerno `units`.
   - Osnovni deo: `floor(total * units / sumUnits)`.
   - Ostatak (`total - zbir osnovnih delova`) dobija po 1 para onaj ko ima najveći razlomljeni
     ostatak. Kod jednakog ostatka odlučuje deterministički redosled (npr. po `memberId`).
2. **Saberi** delove po članu kroz sve stavke.
3. **Bakšiš** se deli srazmerno potrošnji iz koraka 2, istim metodom najvećeg ostatka.
4. Invarijanta: zbir svih delova = zbir stavki + bakšiš. Ako stavka nema nijednog dodeljenog
   člana, to je greška validacije (UI ne dozvoljava snimanje).

### 6.2 Balansi: `calculateBalances(...) → Map<memberId, balance>`

```
balans = plaćeni računi (total + tip) − zbir njegovih ExpenseSplit.amount
       + uplate koje je poslao − uplate koje je primio
```

Pozitivan balans znači da njemu duguju, a negativan da on duguje. Invarijanta: zbir svih balansa u
grupi = 0.

### 6.3 Poravnanje: `settle(balances) → Transfer[]`

Greedy: najveći dužnik plaća najvećem poveriocu `min(dug, potraživanje)`, i tako redom dok se sve ne
izravna. Daje najviše n−1 uplata. (Pravi minimum je NP-težak problem, a greedy je dovoljno dobar.)
Uplata označena dugmetom "Settled" snima se kao `Payment`.

### 6.4 Istorija aktivnosti

Svaka akcija koja menja podatke u grupi (sve iz `ActivityType`) upisuje jedan `Activity` red.

- Upis ide **u istoj Prisma transakciji** kao i sama promena, da istorija nikad ne bude
  nesinhronizovana sa podacima.
- `data` čuva **snimak** relevantnih podataka u tom trenutku (npr. `{ title, total, paidByName }`,
  za izmenu i stare i nove vrednosti), jer račun ili član mogu kasnije biti obrisani ili izmenjeni.
- Jedan helper, npr. `logActivity(tx, { groupId, actorId, type, data })`, a `data` je tipizovan po
  `type` (discriminated union + Zod šema), ne slobodan `any`.
- Prikaz: hronološki feed na stranici grupe ("Marko added expense 'Kafić Zlatibor' · RSD 2,350.00",
  "Ana settled RSD 1,200.00 with Đorđe"), noviji prvi, sa paginacijom (cursor po `createdAt`).
- Tekst poruka se generiše u UI-ju iz `type` + `data`, ne čuva se gotov string.

## 7. Integracija sa fiskalnim računom (QR)

Provereno na više stvarnih računa (faza 0): način ispod vraća sve stavke i zbir se slaže sa ukupnim
iznosom računa.

**Ovo nije zvaničan javni API**, već endpoint koji koristi stranica Poreske uprave, i može se
promeniti. Zato ručni unos mora uvek da radi, a greške se jasno prikazuju korisniku.

### Tok (isključivo na serveru, zbog CORS-a)

1. Korisnik skenira QR → dobija URL oblika `https://suf.purs.gov.rs/v/?vl=...`
2. Klijent šalje `POST /api/receipt` sa `{ url }`.
3. Server:
   - Validira URL: protokol `https:`, hostname **tačno** `suf.purs.gov.rs`, putanja `/v/`.
     Sve ostalo se odbija (zaštita od SSRF-a).
   - `GET` na URL sa browser `User-Agent`-om. Iz odgovora uzima kolačiće (`set-cookie`), a iz
     HTML-a regexima:
     - `viewModel.InvoiceNumber('...')` → broj računa
     - `viewModel.Token('...')` → token
     - `<span id="shopFullNameLabel">` → naziv prodavnice
     - `<span id="totalAmountLabel">` → ukupan iznos (format `13.323,00`)
   - `POST https://suf.purs.gov.rs/specifications`, `Content-Type:
application/x-www-form-urlencoded`, telo `invoiceNumber=...&token=...`, uz header-e
     `Cookie`, `Referer` (originalni URL), `Origin`, `X-Requested-With: XMLHttpRequest`.
   - Odgovor: `{ success: boolean, items: [{ gtin, name, quantity, unitPrice, total, label,
labelRate, taxBaseAmount, vatAmount }] }`, iznosi u dinarima kao float.
   - Timeout ~15 s.
4. Server vraća **normalizovan** oblik, iznosi u parama:
   ```ts
   type ParsedReceipt = {
     receiptNumber: string
     storeName: string | null
     total: number // pare
     items: {
       name: string
       quantity: number
       unitPrice: number
       total: number
     }[]
   }
   ```
   uz proveru da je zbir stavki jednak `total`.
5. Greške se vraćaju sa kodom (`INVALID_URL`, `NOT_FOUND`, `SUF_UNAVAILABLE`, `PARSE_FAILED`,
   `TOTAL_MISMATCH`), a UI nudi "Enter manually".
6. Pre snimanja se proverava da li `receiptNumber` već postoji u grupi.

### Struktura koda

- `src/lib/receipt/types.ts`: tipovi SUF odgovora i `ParsedReceipt`
- `src/lib/receipt/extract.ts`: **čiste** funkcije: iz HTML-a izvuci broj, token, prodavnicu i
  ukupno; normalizuj `specifications` JSON u `ParsedReceipt`
- `src/lib/receipt/fetchReceipt.ts`: mrežni deo (dva poziva), koristi funkcije iz `extract.ts`
- `src/app/api/receipt/route.ts`: validacija (Zod), auth, poziv `fetchReceipt`
- `fixtures/receipts/`: sačuvani stvarni odgovori (`*-page.html`, `*-specifications.json`) iz
  faze 0. Testovi za `extract.ts` rade nad njima, **bez mreže**.

## 8. UX tok jednog računa

1. **Novi račun** u grupi: naslov (ili naziv prodavnice iz QR-a), ko je platio.
2. **Izvor stavki:** "Scan QR" (kamera ili upload slike) ili "Enter manually".
3. **Pregled stavki:** uvek izmenljiva lista (naziv, količina, cena, ukupno), plus indikator da li
   se zbir slaže sa ukupnim iznosom.
4. **Dodela:** tap na stavku → čekiraš članove. Za stavke sa količinom > 1 može se zadati broj
   komada po članu (`units`). Brze akcije: "Split with everyone", "All mine".
5. **Bakšiš** (opciono).
6. **Rezime:** koliko ko duguje → **Save** → računa se `ExpenseSplit`, balansi se ažuriraju.

Ostali ekrani: lista grupa, stranica grupe (troškovi, balansi, predlog poravnanja, istorija
aktivnosti), pridruživanje preko invite linka.

UI je **mobile-first**, jer se koristi za stolom sa telefona: veliki tap targeti, donja akciona
dugmad, prazna stanja i loading stanja svuda.

## 9. Plan izrade

Status: ✅ gotovo · 🔄 u toku · ⬜ nije počelo

### ✅ Faza 0: provera QR pristupa

- Node skript (`test-receipt.mjs`) koji radi tok iz sekcije 7.
- Testirano na više stvarnih računa: stavke se dobijaju, zbir se slaže.
- Odgovori sačuvani kao fixtures.

### 🔄 Faza 1: setup

- [ ] Prisma + Neon, šema iz sekcije 5, `migrate dev --name init`
- [ ] `src/lib/prisma.ts` (singleton)
- [ ] `src/lib/receipt/types.ts`
- [ ] Fixtures prebačeni u `fixtures/receipts/`
- [ ] Playwright podešen (`npm init playwright@latest`, pokretanje sa `npx playwright test`)
- [ ] shadcn/ui inicijalizovan
- [ ] Auth
- [ ] Deploy na Vercel (`DATABASE_URL` u env)

### ⬜ Faza 2: grupe i članovi

- Kreiranje grupe, lista mojih grupa, stranica grupe
- Dodavanje članova po imenu (gosti, bez naloga)
- Kreator grupe je automatski član povezan sa svojim nalogom
- `logActivity` helper (6.4) + upis za `GROUP_CREATED`, `MEMBER_ADDED`, `MEMBER_REMOVED`

### ⬜ Faza 3: jezgro (ručni unos + dodela + podela)

- `splitExpense` (6.1) sa testovima: jednaka podela, ostatak pri deljenju, `units`, bakšiš,
  invarijanta zbira
- Forma za ručni unos stavki
- Ekran za dodelu stavki članovima
- Rezime i snimanje (`Expense` + `ExpenseItem` + `ItemShare` + `ExpenseSplit` u transakciji)
- Lista troškova u grupi, izmena i brisanje računa
- Upis aktivnosti: `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_DELETED`

### ⬜ Faza 4: balansi i poravnanje

- `calculateBalances` i `settle` sa testovima (zbir balansa = 0)
- Prikaz balansa i predloga uplata na stranici grupe
- Dugme "Settled" → `Payment` (+ `PAYMENT_CREATED`), poništavanje uplate (+ `PAYMENT_DELETED`)
- **Istorija aktivnosti:** feed na stranici grupe (6.4), sa paginacijom

### ⬜ Faza 5: QR skeniranje

- `extract.ts` + testovi nad fixtures
- `fetchReceipt.ts` + `POST /api/receipt`
- Skener u browseru (kamera + upload slike)
- Rezultat puni istu listu stavki kao ručni unos (korak 3 iz sekcije 8)
- Provera duplikata po `receiptNumber`, jasne greške + "Enter manually"

### ⬜ Faza 6: završnica

- Invite link i pridruživanje grupi; preuzimanje gost člana (+ `MEMBER_JOINED`)
- Prazna stanja, loading, error boundary
- README: opis, screenshotovi, GIF skeniranja, objašnjenje algoritama podele i poravnanja

### Kasnije (nije deo MVP-a)

- Podela po procentima
- Kategorije troškova i statistika
- AI čitanje slike računa za račune bez QR koda

## 10. Tehničke napomene

@AGENTS.md

- **Next.js 16.4** + **React 19.3**. API-ji se razlikuju od starijih verzija. Dokumentacija za
  tačno ovu verziju je u `node_modules/next/dist/docs/` (`01-app/` za App Router) i čita se pre
  pisanja Next.js koda.
- Kod je u `src/`, a alias `@/*` pokazuje na `./src/*`. Tipovi `LayoutProps<"/">` i
  `PageProps<"/ruta">` se generišu globalno, bez importa.
- **`cacheComponents: true`** (`next.config.ts`): svako čitanje dinamičkih podataka (`cookies()`,
  `headers()`, Prisma upiti, nekeširan `fetch`, `searchParams`) mora biti unutar `<Suspense>` ili
  keširano sa `"use cache"`. Vidi `01-app/01-getting-started/08-caching.md`.
- **`partialPrefetching: true`**: navigacija se učitava u fazama (App Shell, pa podaci zavisni od
  URL-a, pa ostatak). Vidi `01-app/02-guides/optimizing-prefetching.md`.
- **`experimental.agentFeedback: true`**: `next dev` upisuje blok u `AGENTS.md` i vraća ga ako se
  obriše. Izmene u `AGENTS.md` se commituju zajedno sa ostalim radom.
- **Tailwind v4 radi preko `@tailwindcss/turbopack` loadera** (`turbopack.rules` u
  `next.config.ts`). Nema `postcss.config` ni `tailwind.config`. Tema je u `src/app/globals.css`
  preko `@theme inline`. Pri `shadcn init` proveriti da ne doda konfiguraciju koja se sudara sa
  ovim.
