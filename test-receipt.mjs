// test-receipt.mjs
// Proverava da li možemo da izvučemo stavke iz QR linka sa srpskog fiskalnog računa.
// Pokretanje (Node 20+):  node test-receipt.mjs "https://suf.purs.gov.rs/v/?vl=..."
//
// Probaće oba načina:
//   A) GET stranice -> izvuci invoiceNumber + token -> POST /specifications (strukturisan JSON)
//   B) GET istog linka sa Accept: application/json (journal = tekst računa)
// Sve odgovore čuva u ./fixtures da bi kasnije mogao da pišeš testove bez interneta.

import { mkdir, writeFile } from "node:fs/promises";

const BASE = "https://suf.purs.gov.rs";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

// ---------- ulaz ----------
const url = process.argv[2];
if (!url) {
  console.error('Upotreba: node test-receipt.mjs "<link iz QR koda>"');
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(url);
} catch {
  console.error("To nije validan URL.");
  process.exit(1);
}
if (parsedUrl.hostname !== "suf.purs.gov.rs") {
  console.error("Dozvoljen je samo domen suf.purs.gov.rs");
  process.exit(1);
}

await mkdir("fixtures", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

// ---------- pomoćne funkcije ----------
// Sve iznose držimo u parama (Int) da izbegnemo float greške.
const toPara = (n) => Math.round(Number(n) * 100);
const fmt = (para) => (para / 100).toFixed(2);

// "13.323,00" -> 1332300
function parseRsdText(str) {
  const clean = str.trim().replace(/\./g, "").replace(",", ".");
  return Math.round(parseFloat(clean) * 100);
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function getCookies(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  const pairs = list.map((c) => c.split(";")[0].trim()).filter(Boolean);
  if (!pairs.some((p) => p.startsWith("localization="))) pairs.push("localization=sr-Cyrl-RS");
  return pairs.join("; ");
}

// ---------- Način A ----------
async function methodA() {
  console.log("\n=== Način A: stranica + /specifications ===");

  const pageRes = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "sr,en;q=0.8",
    },
  });
  console.log("GET stranice:", pageRes.status);
  if (!pageRes.ok) return null;

  const html = await pageRes.text();
  await writeFile(`fixtures/${stamp}-page.html`, html);

  const cookies = getCookies(pageRes);
  const invoiceNumber = html.match(/viewModel\.InvoiceNumber\(['"]([^'"]+)['"]\)/)?.[1];
  const token = html.match(/viewModel\.Token\(['"]([^'"]+)['"]\)/)?.[1];
  const totalText = html.match(/<span id="totalAmountLabel"[^>]*>\s*([^<]+)/i)?.[1];
  const storeText = html.match(/<span id="shopFullNameLabel"[^>]*>\s*([^<]+)/i)?.[1];

  console.log("Prodavnica:", storeText ? decodeEntities(storeText).trim() : "(nije nađeno)");
  console.log("Broj računa:", invoiceNumber ?? "NIJE NAĐEN");
  console.log("Token:", token ? "nađen" : "NIJE NAĐEN");
  if (!invoiceNumber || !token) return null;

  const specRes = await fetch(`${BASE}/specifications`, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Origin: BASE,
      Referer: url,
      Cookie: cookies,
    },
    body: new URLSearchParams({ invoiceNumber, token }),
  });
  console.log("POST /specifications:", specRes.status);

  const text = await specRes.text();
  await writeFile(`fixtures/${stamp}-specifications.json`, text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("Odgovor nije JSON. Pogledaj fixtures fajl.");
    return null;
  }
  if (!data.success || !Array.isArray(data.items)) {
    console.log("success je false ili nema stavki.");
    return null;
  }

  return {
    invoiceNumber,
    total: totalText ? parseRsdText(decodeEntities(totalText)) : null,
    items: data.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: toPara(i.unitPrice),
      total: toPara(i.total),
    })),
  };
}

// ---------- Način B ----------
async function methodB() {
  console.log("\n=== Način B: Accept: application/json ===");

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json" },
  });
  console.log("GET (JSON):", res.status);
  if (!res.ok) return null;

  const text = await res.text();
  await writeFile(`fixtures/${stamp}-api.json`, text);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.log("Odgovor nije JSON. Pogledaj fixtures fajl.");
    return null;
  }

  return {
    store: data.invoiceRequest?.businessName?.trim(),
    total: data.invoiceResult?.totalAmount != null ? toPara(data.invoiceResult.totalAmount) : null,
    journal: data.journal ?? null,
  };
}

// ---------- pokretanje ----------
try {
  const a = await methodA();
  if (a) {
    console.log(`\nStavke (${a.items.length}):`);
    console.table(
      a.items.map((i) => ({
        naziv: i.name,
        kol: i.quantity,
        cena: fmt(i.unitPrice),
        ukupno: fmt(i.total),
      }))
    );
    const sum = a.items.reduce((s, i) => s + i.total, 0);
    console.log("Zbir stavki:", fmt(sum));
    if (a.total != null) {
      console.log("Ukupno na računu:", fmt(a.total), sum === a.total ? "OK, slaže se" : "NE SLAŽE SE");
    }
  } else {
    console.log("Način A nije uspeo.");
  }
} catch (err) {
  console.log("Način A pukao:", err.message);
}

try {
  const b = await methodB();
  if (b) {
    console.log("Prodavnica:", b.store ?? "(nema)");
    console.log("Ukupno:", b.total != null ? fmt(b.total) : "(nema)");
    console.log("\n--- journal (tekst računa) ---\n" + (b.journal ?? "(nema)"));
  } else {
    console.log("Način B nije uspeo.");
  }
} catch (err) {
  console.log("Način B pukao:", err.message);
}

console.log(`\nOdgovori su sačuvani u ./fixtures (prefiks ${stamp}).`);
