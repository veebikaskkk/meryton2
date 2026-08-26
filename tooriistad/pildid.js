#!/usr/bin/env node
/*
 * Meryton Group, galerii ehitaja.
 *
 * Mida see teeb:
 *  1. Loeb toorfotod kaustast pildid/toorpildid/<kategooria>/
 *  2. Pöörab need EXIF-i järgi õigetpidi, eemaldab kogu EXIF-i koos GPS-iga
 *     ning teisendab WebP-ks: galeriipilt 1400 px q78, pisipilt 600 px q75
 *  3. Kirjutab tulemuse kausta pildid/galerii/<kategooria>/
 *  4. Uuendab faili tooriistad/galerii-andmed.json, säilitades juba kirjutatud
 *     alt-tekstid
 *  5. Kirjutab uuesti galerii ploki failis tood.html ja terve sitemap.xml
 *
 * Kasutus:
 *   cd tooriistad && npm install     (ainult esimesel korral)
 *   node tooriistad/pildid.js        (projekti juurkaustast)
 *
 * Toorfotod jäävad kausta pildid/toorpildid/ ja neid ei panda veebi.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('Sharp puudub. Jooksuta: cd tooriistad && npm install');
  process.exit(1);
}

const JUUR = path.resolve(__dirname, '../public');   // sait elab public/ all
const LAHTE = path.resolve(__dirname, '..');           // toorpildid jäävad väljapoole
const ANDMED = path.join(__dirname, 'galerii-andmed.json');
const TOOR = path.join(LAHTE, 'pildid/toorpildid');
const VALJUND = path.join(JUUR, 'pildid/galerii');
const TOOD = path.join(JUUR, 'tood.html');
const ESILEHT = path.join(JUUR, 'index.html');
const SITEMAP = path.join(JUUR, 'sitemap.xml');

const SAIT = 'https://www.meryton.ee';
const EELVAADE = 3;             // mitu pilti on kohe näha, mobiilis kaks rida

// Klõpsuga avanev suurendus. Praegu välja lülitatud, sest galeriis on
// hange.ee 300x200 pisipildid ja suurendus teeb neist pudru. Kui kliendi
// originaalfotod on kaustas pildid/toorpildid/, pane siia true ja jooksuta
// skript uuesti, siis tulevad klõpsatavad pildid tagasi.
const SUURENDUS = false;
const SUUR = { laius: 1400, kvaliteet: 78 };
const PISI = { laius: 600, kvaliteet: 75 };
const LUBATUD = ['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif'];

const andmed = JSON.parse(fs.readFileSync(ANDMED, 'utf8'));

/* --- abid ---------------------------------------------------------------- */

function slugi(t) {
  return t
    .toLowerCase()
    .replace(/õ/g, 'o').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/š/g, 's').replace(/ž/g, 'z')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Lõika slug sõna pealt, et failinimi ei lõppeks poole sõnaga
function lyhenda(slug, maks) {
  if (slug.length <= maks) return slug;
  const l = slug.slice(0, maks);
  const i = l.lastIndexOf('-');
  return i > 20 ? l.slice(0, i) : l;
}

function esc(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// HEIC-i sharp alati ei loe, macOS-i sips oskab selle JPEG-iks teha
function loeSisse(fail) {
  const laiend = path.extname(fail).toLowerCase();
  if (laiend !== '.heic' && laiend !== '.heif') return sharp(fail);
  const ajutine = path.join(require('os').tmpdir(), `meryton-${Date.now()}.jpg`);
  execFileSync('sips', ['-s', 'format', 'jpeg', fail, '--out', ajutine], { stdio: 'ignore' });
  return sharp(ajutine);
}

/* --- 1. piltide töötlemine ----------------------------------------------- */

async function tootleKategooria(kat) {
  const toorKaust = path.join(TOOR, kat.kaust);
  const valjundKaust = path.join(VALJUND, kat.kaust);
  const pisiKaust = path.join(valjundKaust, 'pisi');
  fs.mkdirSync(pisiKaust, { recursive: true });

  if (!fs.existsSync(toorKaust)) return [];

  const failid = fs.readdirSync(toorKaust)
    .filter((f) => LUBATUD.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'et'));

  const vanad = new Map((kat.pildid || []).map((p) => [p.allikas || p.fail, p]));
  const uuedFailid = new Set();
  const uued = [];
  let nr = 0;

  for (const failinimi of failid) {
    nr += 1;
    const tee = path.join(toorKaust, failinimi);
    const olemas = vanad.get(failinimi);
    // Failinimi tuleb alt-tekstist, sest Google Images loeb ka failinime.
    // porandatood-07.webp ei ütle otsingumootorile midagi,
    // kalasabamustris-hele-puitparkett-valminud-ruumis-07.webp ütleb.
    const nimi = (olemas && olemas.nimi)
      || (olemas && olemas.alt ? lyhenda(slugi(olemas.alt), 58) : '')
      || kat.kaust;
    const valjundNimi = `${slugi(nimi)}-${String(nr).padStart(2, '0')}.webp`;

    uuedFailid.add(valjundNimi);
    const suurTee = path.join(valjundKaust, valjundNimi);
    const pisiTee = path.join(pisiKaust, valjundNimi);

    const alus = loeSisse(tee).rotate();
    const meta = await alus.metadata();

    await loeSisse(tee).rotate()
      .resize({ width: SUUR.laius, withoutEnlargement: true })
      .webp({ quality: SUUR.kvaliteet })
      .toFile(suurTee);

    await loeSisse(tee).rotate()
      .resize({ width: PISI.laius, height: Math.round(PISI.laius * 0.75), fit: 'cover', position: 'attention', withoutEnlargement: false })
      .webp({ quality: PISI.kvaliteet })
      .toFile(pisiTee);

    const suurMeta = await sharp(suurTee).metadata();
    const kb = fs.statSync(suurTee).size / 1024;
    if (kb > 400) console.warn(`  hoiatus: ${valjundNimi} on ${Math.round(kb)} KB, üle 400 KB`);

    uued.push({
      allikas: failinimi,
      nimi,
      fail: valjundNimi,
      laius: suurMeta.width,
      korgus: suurMeta.height,
      alt: (olemas && olemas.alt) || '',
      originaal: `${meta.width}x${meta.height}`
    });
  }

  // Nimi võib muutuda, kui alt-tekst muutub. Vana fail tuleb ära koristada,
  // muidu jääb kausta hunnik kasutuseta pilte.
  for (const kaust of [valjundKaust, pisiKaust]) {
    for (const f of fs.readdirSync(kaust)) {
      if (f.endsWith('.webp') && !uuedFailid.has(f)) fs.unlinkSync(path.join(kaust, f));
    }
  }

  return uued;
}

/* --- 2. galerii markup --------------------------------------------------- */

function kohataide(kat, nr) {
  const nimi = `${kat.kaust}-${String(nr).padStart(2, '0')}.webp`;
  return `        <div class="pilt pilt--tyhi" aria-hidden="true"><span>pildid/galerii/${kat.kaust}/${nimi}</span></div>`;
}

function galeriiMarkup() {
  const tykid = [];

  for (const kat of andmed.kategooriad) {
    const pildid = kat.pildid || [];
    const arv = pildid.length;
    const ankur = kat.kaust;

    let ruudud;
    if (arv === 0) {
      ruudud = [1, 2, 3].map((n) => kohataide(kat, n)).join('\n');
    } else {
      ruudud = pildid.map((p, i) => {
        const peidus = i >= EELVAADE ? ' hidden' : '';
        const alt = p.alt || `${kat.nimi}, Meryton Group tehtud töö`;
        const pilt = `          <img src="pildid/galerii/${kat.kaust}/pisi/${p.fail}" width="600" height="450"` +
          ` loading="lazy" decoding="async" alt="${esc(alt)}">`;

        if (!SUURENDUS) {
          return `        <figure class="pilt pilt--vaikne"${peidus}>\n${pilt}\n` +
            `          <figcaption class="pilt__tekst">${esc(alt)}</figcaption>\n` +
            `        </figure>`;
        }

        return `        <button class="pilt" type="button"${peidus}` +
          ` data-suur="pildid/galerii/${kat.kaust}/${p.fail}"` +
          ` data-alt="${esc(alt)}">\n${pilt}\n` +
          `          <figcaption class="pilt__tekst">${esc(alt)}</figcaption>\n` +
          `        </button>`;
      }).join('\n');
    }

    // Mobiilis on näha EELVAADE pilti, laiemal ekraanil kolm, sest neljanda
    // peidab CSS. Nupp peab tekkima ka siis, kui pilte on täpselt neli.
    const LAUAARVUTIS = 3;
    const nuppOn = arv > LAUAARVUTIS;
    const nupp = nuppOn
      ? `      <div class="veel">\n` +
        `        <button class="nupp nupp--vaikne" type="button" data-veel="${ankur}"` +
        ` aria-expanded="false" aria-controls="ruudustik-${ankur}">Vaata veel (${arv - LAUAARVUTIS})</button>\n` +
        `      </div>`
      : '';

    const arvTekst = arv === 0
      ? 'fotod lisamisel'
      : `${arv} ${arv === 1 ? 'foto' : 'fotot'}`;

    tykid.push(
      `    <article class="kategooria" id="${ankur}">\n` +
      `      <div class="kategooria__pais">\n` +
      `        <h2>${esc(kat.nimi)}</h2>\n` +
      `        <p class="kategooria__arv">${arvTekst}</p>\n` +
      `      </div>\n` +
      `      <p>${esc(kat.kirjeldus)}</p>\n` +
      `      <div class="pildid" id="ruudustik-${ankur}">\n${ruudud}\n      </div>\n` +
      (nupp ? nupp + '\n' : '') +
      `    </article>`
    );
  }

  return tykid.join('\n\n');
}

/* --- 3. tood.html struktuurandmed ---------------------------------------- */

// Kategooriate nimed on ka JSON-LD sees, seega genereerime selle samast
// allikast. Muidu jääb ühe nime muutmisel teine maha.
function toodeJsonLd() {
  const osad = andmed.kategooriad
    .filter((k) => (k.pildid || []).length)
    .map((k) => ({
      '@type': 'ImageGallery',
      '@id': `${SAIT}/tood.html#${k.kaust}`,
      name: k.nimi,
      description: k.kirjeldus,
      numberOfItems: k.pildid.length
    }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Avaleht', item: `${SAIT}/` },
          { '@type': 'ListItem', position: 2, name: 'Tehtud tööd', item: `${SAIT}/tood.html` }
        ]
      },
      {
        '@type': 'CollectionPage',
        '@id': `${SAIT}/tood.html#galerii`,
        name: 'Meryton Group OÜ tehtud tööd',
        url: `${SAIT}/tood.html`,
        inLanguage: 'et',
        isPartOf: { '@id': `${SAIT}/#ettevote` },
        hasPart: osad
      }
    ]
  };
}

/* --- 4. avalehe kategooriakastid ----------------------------------------- */

const LINDI_VARU = 10;          // mitu pilti ühes kastis vaheldub

function lindiMarkup() {
  const kastid = andmed.kategooriad
    .filter((k) => (k.pildid || []).length)
    .map((k) => {
      const varu = k.pildid.slice(0, LINDI_VARU).map((p) => ({
        tee: `pildid/galerii/${k.kaust}/pisi/${p.fail}`,
        alt: p.alt || `${k.nimi}, Meryton Group tehtud töö`
      }));
      const esimene = varu[0];
      const arv = k.pildid.length;

      return `          <li>\n` +
        `            <a class="lint__kast" href="tood.html#${k.kaust}" data-pildid="${esc(JSON.stringify(varu))}">\n` +
        `              <span class="lint__pilt">\n` +
        `                <img src="${esimene.tee}" width="600" height="450" loading="lazy" decoding="async" alt="${esc(esimene.alt)}">\n` +
        `              </span>\n` +
        `              <span class="lint__silt">${esc(k.nimi)}` +
        ` <span class="lint__arv">${arv} fotot</span></span>\n` +
        `            </a>\n` +
        `          </li>`;
    });

  if (!kastid.length) return '';
  return `        <ul class="lint">\n${kastid.join('\n')}\n        </ul>`;
}

/* --- 5. sitemap ---------------------------------------------------------- */

function sitemap() {
  const kuup = new Date().toISOString().slice(0, 10);
  const lehed = [
    ['/', '1.0'],
    ['/teenused', '0.9'],
    ['/meist', '0.7'],
    ['/tood', '0.9'],
    ['/kontakt', '0.8'],
    ['/privaatsus', '0.2']
  ];

  let pildiread = '';
  for (const kat of andmed.kategooriad) {
    for (const p of kat.pildid || []) {
      pildiread +=
        `    <image:image>\n` +
        `      <image:loc>${SAIT}/pildid/galerii/${kat.kaust}/${p.fail}</image:loc>\n` +
        `      <image:title>${esc(kat.nimi)}</image:title>\n` +
        `      <image:caption>${esc(p.alt || kat.kirjeldus)}</image:caption>\n` +
        `    </image:image>\n`;
    }
  }

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

  for (const [tee, prio] of lehed) {
    xml += `  <url>\n    <loc>${SAIT}${tee}</loc>\n    <lastmod>${kuup}</lastmod>\n    <priority>${prio}</priority>\n`;
    if (tee === '/tood.html' && pildiread) xml += pildiread;
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

/* --- käivitus ------------------------------------------------------------ */

(async () => {
  let kokku = 0;
  for (const kat of andmed.kategooriad) {
    const pildid = await tootleKategooria(kat);
    if (pildid.length) {
      kat.pildid = pildid;
      kokku += pildid.length;
      console.log(`${kat.kaust}: ${pildid.length} pilti`);
    } else {
      kat.pildid = kat.pildid || [];
      if (kat.pildid.length === 0) console.log(`${kat.kaust}: toorpilte ei ole, jääb kohatäide`);
    }
  }

  fs.writeFileSync(ANDMED, JSON.stringify(andmed, null, 2) + '\n');

  const html = fs.readFileSync(TOOD, 'utf8');
  const algus = '<!-- GALERII:ALGUS -->';
  const lopp = '<!-- GALERII:LOPP -->';
  const a = html.indexOf(algus);
  const b = html.indexOf(lopp);
  if (a === -1 || b === -1) {
    console.error('tood.html failist ei leia märgiseid GALERII:ALGUS ja GALERII:LOPP');
    process.exit(1);
  }
  let uus = html.slice(0, a + algus.length) + '\n' + galeriiMarkup() + '\n    ' + html.slice(b);

  // struktuurandmed samast allikast üle
  const ldA = uus.indexOf('<script type="application/ld+json">');
  const ldB = uus.indexOf('</script>', ldA) + '</script>'.length;
  if (ldA !== -1) {
    uus = uus.slice(0, ldA) +
      '<script type="application/ld+json">\n' +
      JSON.stringify(toodeJsonLd(), null, 2) +
      '\n</script>' +
      uus.slice(ldB);
  }

  fs.writeFileSync(TOOD, uus);

  // Avalehel ei ole enam galeriilinti. Kui märgised on olemas, uuendame
  // ka seda, kui ei ole, jätame esilehe rahule ja see ei ole viga.
  const esi = fs.readFileSync(ESILEHT, 'utf8');
  const lA = '<!-- ESILEHE-PILDID:ALGUS -->';
  const lB = '<!-- ESILEHE-PILDID:LOPP -->';
  const x = esi.indexOf(lA);
  const y = esi.indexOf(lB);
  const esilehtUuendatud = x !== -1 && y !== -1;
  if (esilehtUuendatud) {
    fs.writeFileSync(ESILEHT, esi.slice(0, x + lA.length) + '\n' + lindiMarkup() + '\n        ' + esi.slice(y));
  }

  fs.writeFileSync(SITEMAP, sitemap());

  const puuduAlt = andmed.kategooriad
    .flatMap((k) => (k.pildid || []).filter((p) => !p.alt).map((p) => `${k.kaust}/${p.fail}`));

  console.log(`\nKokku ${kokku} pilti. Uuendatud: tood.html, sitemap.xml${esilehtUuendatud ? ', index.html' : ''}.`);
  if (puuduAlt.length) {
    console.log(`Alt-tekst puudub ${puuduAlt.length} pildil. Kirjuta need faili tooriistad/galerii-andmed.json:`);
    puuduAlt.slice(0, 20).forEach((f) => console.log('  ' + f));
    if (puuduAlt.length > 20) console.log(`  ... ja veel ${puuduAlt.length - 20}`);
  }
})();
