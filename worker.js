/*
 * MERYTON GROUP OÜ
 *
 * Cloudflare Worker. Kaks tööd:
 *   1. /api/kontakt  hinnapäringu vastuvõtt, kiri läheb välja Resendiga
 *   2. kõik muu      antakse edasi staatilistele failidele kaustast public/
 *
 * Keskkonnamuutujad, mis peavad Cloudflare'i paneelis seatud olema:
 *   RESEND_API_KEY  Resendi API võti          (secret)
 *   SAATJA          "Meryton koduleht <vorm@meryton.ee>"
 *   SAAJA           "info@meryton.ee"
 *
 * Muutujad jõustuvad alles UUE DEPLOY järel. See on kõige sagedasem
 * põhjus, miks vorm ei tööta.
 *
 * Resendi vastusekoodid, mis näevad kasutajale ühesugused välja:
 *   401  vale või aegunud API võti
 *   403  saatja domeen ei ole Resendis kinnitatud. Kinnitamata kontolt
 *        saab saata ainult konto omaniku enda aadressile ja saatjaks
 *        peab olema onboarding@resend.dev
 *   422  vigane päring, näiteks katkine e-posti aadress
 * Vastuse kehas tuleb see kood väljal "kood" tagasi, nii et põhjust ei
 * pea päevi otsima. Saladusi vastusesse ei pane.
 */

const RESEND = 'https://api.resend.com/emails';

const PIIRANG_AKEN_MS = 10 * 60 * 1000;   // 10 minutit
const PIIRANG_ARV = 5;                    // kuni viis päringut ühelt IP-lt

// Isolaadi mälu. Cloudflare jagab liikluse mitme isolaadi vahel, seega
// see on parim pingutus, mitte kindel piirang. Päris piirang käib
// Cloudflare'i WAF-i Rate limiting reegliga, mis on tasuta plaanis olemas.
const paringud = new Map();

function ylePiiri(ip) {
  const nyyd = Date.now();
  const varasem = (paringud.get(ip) || []).filter((t) => nyyd - t < PIIRANG_AKEN_MS);
  varasem.push(nyyd);
  paringud.set(ip, varasem);

  if (paringud.size > 5000) {
    for (const [k, v] of paringud) {
      if (!v.length || nyyd - v[v.length - 1] > PIIRANG_AKEN_MS) paringud.delete(k);
    }
  }
  return varasem.length > PIIRANG_ARV;
}

function puhasta(vaartus, maksPikkus) {
  if (typeof vaartus !== 'string') return '';
  return vaartus
    .slice(0, maksPikkus)
    .replace(/[<>]/g, '')
    // juhtmärgid välja, reavahetus ja tabulaator jäävad alles
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
}

function html(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

const EPOST = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Vormil olevad teenused. Serverisse tulnud väärtused peavad olema
// sellest nimekirjast, muidu saaks kirja saata suvalist teksti.
const TEENUSED = [
  'Eramu ehitus ja renoveerimine',
  'Põrandakatete paigaldus',
  'Vannitoa ehitus ja renoveerimine',
  'Vee- ja kanalisatsioonitööd',
  'Kütte- ja ventilatsioonitööd',
  'Saunad, terrassid ja varjualused',
  'Muu'
];

function valiTeenused(vaartus) {
  const loend = Array.isArray(vaartus) ? vaartus : [vaartus];
  const valitud = loend
    .map((v) => puhasta(v, 60))
    .filter((v) => TEENUSED.indexOf(v) !== -1);
  return Array.from(new Set(valitud)).join(', ');
}

async function loeKeha(request) {
  const tyyp = request.headers.get('content-type') || '';

  if (tyyp.includes('application/json')) {
    return await request.json();
  }

  // Vorm ilma JavaScriptita saadab tavalise vormikodeeringu
  const vorm = await request.formData();
  const keha = {};
  for (const [k, v] of vorm.entries()) {
    if (k in keha) {
      if (!Array.isArray(keha[k])) keha[k] = [keha[k]];
      keha[k].push(v);
    } else {
      keha[k] = v;
    }
  }
  return keha;
}

const YLDINE_VIGA =
  'Päringu saatmine ei õnnestunud. Palun helista numbril +372 5689 3723 või kirjuta info@meryton.ee.';

async function kontakt(request, env) {
  const tahabJson = String(request.headers.get('accept') || '').includes('application/json');

  function vasta(kood, sonum, pohjus, resendiKood) {
    if (kood === 200 && !tahabJson) {
      // Ilma JavaScriptita vorm: suuna tänulehele, siis on konversioon mõõdetav
      return new Response(null, { status: 303, headers: { Location: '/aitah' } });
    }
    if (tahabJson) {
      const keha = kood === 200
        ? { ok: true }
        : { ok: false, pohjus: pohjus || 'tundmatu', kood: resendiKood || kood, viga: sonum };
      return Response.json(keha, { status: kood });
    }
    return new Response(sonum, { status: kood, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (request.method !== 'POST') {
    return new Response('Vale päringu meetod.', { status: 405, headers: { Allow: 'POST' } });
  }

  try {
    const keha = await loeKeha(request);

    // Meepott: robot täidab peidetud välja, inimene mitte.
    // Vastame edukalt, et robot ei hakkaks teist teed otsima.
    if (puhasta(keha.veebiaadress, 200)) {
      return vasta(200, 'ok');
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'tundmatu';
    if (ylePiiri(ip)) {
      return vasta(429,
        'Liiga palju päringuid lühikese aja jooksul. Palun helista numbril +372 5689 3723.',
        'kiiruspiirang');
    }

    const nimi = puhasta(keha.nimi, 120);
    const epost = puhasta(keha.epost, 160);
    const sonum = puhasta(keha.sonum, 4000);
    const telefon = puhasta(keha.telefon, 40);
    const ettevote = puhasta(keha.ettevote, 120);
    const objekt = puhasta(keha.objekt, 180);
    const laad = valiTeenused(keha.laad);
    const nousolek = keha.nousolek === true || keha.nousolek === 'on' || keha.nousolek === 'true';

    if (!nimi || !EPOST.test(epost) || !sonum || !nousolek) {
      return vasta(400, 'Palun täida nimi, e-post, kirjeldus ja nõusolek.', 'valideerimine');
    }

    // Puuduv muutuja logitakse nimepidi, väärtust EI logita kunagi
    const puudu = ['RESEND_API_KEY', 'SAATJA', 'SAAJA'].filter((k) => !env[k]);
    if (puudu.length) {
      console.error("Keskkonnamuutujad seadmata: " + puudu.join(", ") +
        ". Lisa need Cloudflare'i paneelis ja tee UUS DEPLOY.");
      return vasta(500, YLDINE_VIGA, 'seadistus');
    }

    const read = [
      ['Nimi', nimi],
      ['Ettevõte', ettevote],
      ['E-post', epost],
      ['Telefon', telefon],
      ['Teenused', laad],
      ['Objekt', objekt]
    ].filter(([, v]) => v);

    const tekst = read.map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nKirjeldus:\n${sonum}\n`;
    const kiri =
      '<h2 style="font-family:Arial,sans-serif">Hinnapäring kodulehelt</h2>' +
      '<table style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">' +
      read.map(([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666">${html(k)}</td>` +
        `<td style="padding:4px 0"><strong>${html(v)}</strong></td></tr>`).join('') +
      '</table>' +
      `<p style="font-family:Arial,sans-serif;font-size:14px;white-space:pre-wrap">${html(sonum)}</p>`;

    const vastus = await fetch(RESEND, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: env.SAATJA,
        to: [env.SAAJA],
        reply_to: epost,
        subject: `Hinnapäring kodulehelt: ${nimi}`,
        text: tekst,
        html: kiri
      })
    });

    if (!vastus.ok) {
      // 401 = vale võti. 403 = saatja domeen kinnitamata. 422 = vigane päring.
      const detail = await vastus.text().catch(() => '');
      console.error(`Resend vastas ${vastus.status}: ${detail.slice(0, 400)}`);
      return vasta(502, YLDINE_VIGA, 'resend', vastus.status);
    }

    return vasta(200, 'ok');
  } catch (e) {
    console.error('Vormi viga:', e && e.message ? e.message : e);
    return vasta(500, YLDINE_VIGA, 'erind');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/kontakt') return kontakt(request, env);

    // Kõik muu tuleb kaustast public/. Midagi väljaspool seda ei serveerita.
    return env.ASSETS.fetch(request);
  }
};
