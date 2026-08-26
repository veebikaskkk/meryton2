# Meryton Group OÜ koduleht

Puhas HTML, CSS ja JavaScript. Ei mingit raamistikku ega ehitusprotsessi.
Majutus Cloudflare Workeri peal, hinnapäringu kirjad lähevad välja Resendiga.

Aadress: https://www.meryton.ee

## Kaustad

```
public/          kõik, mis brauserisse jõuab
  index.html     avaleht: päis ja teenusekastid
  meist.html     kes me oleme, alltöövõtu referentsid
  teenused.html  kuus teenust eraldi alajaotusega
  tood.html      galerii tööliikide kaupa
  kontakt.html   hinnapäringu vorm
  aitah.html     tänuleht, kuhu vorm suunab
  privaatsus.html
  404.html
  stiil.css      üks stiilileht kõigile lehtedele
  skript.js      menüü, galerii, vorm
  _headers       turvapäised ja vahemälu
  _redirects     301 vanadelt .html-aadressidelt
  fondid/        Sora ja Manrope, majutatud koos lehega
  pildid/        galerii, ikoonid, päise foto, jagamispilt

worker.js        /api/kontakt ja staatiliste failide serveerimine
wrangler.jsonc   Cloudflare'i seadistus
pildid/toorpildid/   toorfotod, EI lähe veebi ega hoidlasse
tooriistad/      skriptid, ei lähe veebi
TEKSTID.md       kõik lehe tekstid ühes failis
```

Serveeritakse **ainult** `public/` sisu. Kontroll pärast avaldamist:

```bash
curl -I https://www.meryton.ee/tooriistad/kontroll.py
```

Peab vastama 404-ga.

## Avaldamine

**1. GitHub.** Pushi failid, ära lohista GitHubi veebiliidesesse. Lohistamine
laotab sisu laiali ja piir on umbes sada faili korraga.

```bash
cd "meryton uus"
git init
git add .
git commit -m "Uus koduleht"
git remote add origin https://github.com/KASUTAJA/HOIDLA.git
git push -u origin main
```

**2. Cloudflare.** Compute, Workers & Pages, Create, Import a repository.

- Build command: **tühjaks**
- Deploy command: `npx wrangler deploy`

**3. Muutujad.** Settings, Variables and secrets:

| Nimi | Tüüp | Väärtus |
|---|---|---|
| `RESEND_API_KEY` | Secret | Resendi API võti |
| `SAATJA` | Text | `Meryton koduleht <vorm@meryton.ee>` |
| `SAAJA` | Text | `info@meryton.ee` |

**Pärast lisamist tee uus deploy.** Muutujad ei jõustu ilma selleta. See on
kõige sagedasem põhjus, miks vorm ei tööta.

**4. Domeen.** Alles siis, kui klient on kinnitanud.

Vana leht on praegu Vercelis. Kuni nimeserverid ei ole vahetatud, jääb
vana leht tööle ja Cloudflare'i oma elab `workers.dev` aadressil.

DNSSEC tuleb enne nimeserverite vahetust välja lülitada ja oodata, kuni
vana DS-kirje registrist kaob. Kui nimeserverid vahetuvad ja DS-kirje on
alles, muutub domeen täiesti kättesaamatuks.

## Resend

Saatja domeen tuleb Resendis eraldi kinnitada. Lehe domeeni tööle minek
ei kinnita midagi, see on omaette DNS-kirjete lisamine.

Kuni domeen ei ole kinnitatud, saab saata **ainult konto omaniku enda
aadressile** ja saatjaks peab olema `onboarding@resend.dev`. Vormi saab
sellega ära testida juba enne domeeni olemasolu.

Veakoodid, mis on `worker.js`-is kommentaarina kirjas ja mille funktsioon
tagastab väljal `kood`:

- **401** vale või aegunud API võti
- **403** saatja domeen ei ole kinnitatud
- **422** vigane päring, näiteks katkine e-posti aadress

## Kohalik töö

```bash
cp .dev.vars.example .dev.vars
npx wrangler dev
```

Testi **ainult** `wrangler dev` abil. Tavaline staatiline server ei jooksuta
`_headers`, `_redirects`, `not_found_handling` ega `run_worker_first` reegleid,
seega vorm ja ümbersuunamised ei käitu õigesti.

## Enne iga avaldamist

```bash
python3 tooriistad/kontroll.py
```

Käib läbi: JSON-LD parsib, igal lehel täpselt üks h1, unikaalsed title ja
description, kõik sisemised lingid ja ankrud viitavad olemasolevale, sildid
tasakaalus, ühtegi `style=` atribuuti ei ole, ükski pilt üle 400 KB ei ole,
API võtit koodis ei ole, sitemapis ei ole `.html`-lõpuga aadresse.

Väljub koodiga 1, kui midagi on katki.

## Aadressid ilma .html-ita

Workeri assets suunab `/teenused.html` pealt 307-ga `/teenused` peale.
Sellepärast on kõik sisemised lingid, canonical-aadressid ja sitemap
kirjutatud kohe ilma laiendita. **Ära lisa `.html` tagasi**, muidu tekib
iga klõpsu peale lisahüpe.

## Galerii uuendamine

Uued fotod käivad kausta `pildid/toorpildid/<tööliik>/`, otse telefonist,
ilma ümbernimetamiseta.

```bash
cd tooriistad && npm install    # ainult esimesel korral
node tooriistad/pildid.js       # projekti juurkaustast
```

Skript pöörab pildid EXIF-i järgi õigetpidi, **eemaldab EXIF-i koos
GPS-koordinaatidega**, teeb WebP-d ja kirjutab galerii ploki failis
`tood.html` ning terve `sitemap.xml` uuesti.

Ehitusfotod on tehtud eramute juures. Koordinaatide avaldamine oleks
kliendi kliendi suhtes tõsine viga, seepärast käib see alati skripti kaudu.

`tood.html` galeriiplokki **ei muudeta käsitsi** — järgmine skripti
käivitus kirjutab selle üle.

Alt-tekstid elavad failis `tooriistad/galerii-andmed.json` ja jäävad
uuendamisel alles.

## Tekstide muutmine

```bash
python3 tooriistad/tekstid.py          # HTML-ist -> TEKSTID.md
python3 tooriistad/tekstid-tagasi.py   # TEKSTID.md -> HTML
```

Nii saab kogu sisu ühe failina kliendile üle vaadata anda, ilma et ta
peaks HTML-i sees sobrama.

## Mis on veel vaja

**Suure lahutusega fotod.** Kõik praegused kliendi fotod on 640 × 480 px
ja päise taustapilt on sama väike. Suurel ekraanil on päis ligi 2000 px
lai ja pilt läheb seal uduseks. Küsi originaalid otse telefonist AirDropi
või Google Drive'i kaudu — WhatsApp ja meil pakivad pildi väikeseks.

**Päise foto WebP-na.** `pildid/pais/vundamendi-porandakute-pais.jpg` on
praegu JPEG, sest seda ei tehtud galeriiskriptiga. Kui originaal on käes,
lase see läbi sama skripti.

**Logo vektorina.** Failis `Meryton_Group_Transparent.svg` on ainult
sisse pakitud raster, mitte päris vektor. Praegu kasutusel olev
`pildid/ikoonid/meryton-group-logo.webp` on 283 × 193 px, mis päise jaoks
piisab, aga suuremaks minna ei saa.

## Analüütika

Cloudflare Web Analytics on küpsisevaba ja lülitatakse paneelist sisse.
Koodi ei ole vaja lisada, küpsiseteavitust ei ole vaja.

Google Analyticsit ära kasuta, see toob nõusolekuriba kaasa.

## Kui klient tahab hiljem Google Adsi

Jälgimiskoodi ei ole ette lisatud. Vaja läheb nelja asja:

1. Jälgimiskood kõigi lehtede `head` ossa, konversioon seotud lehega `/aitah`
2. `public/_headers` failis CSP laiendus `script-src` ja `connect-src` osas
3. Küpsiste nõusolekuriba ja privaatsuslehele küpsiste peatükk
4. Nõusolekurežiim, muidu piirab Google EL-is reklaami näitamist

Ads toob nõusolekuriba kaasa. See on teadlik vahetus, mitte tehniline detail.

## Google'i ettevõtteprofiil

Klient seadistab selle oma Google'i konto alt aadressil
business.google.com. Vaja läheb: ettevõtte nimi täpselt nii nagu
äriregistris, tegevuspiirkond (Pärnumaa, Viljandimaa, Harjumaa),
telefon, kodulehe aadress, lahtiolekuajad ja fotod tehtud töödest.

Profiil tuleb kinnitada, tavaliselt postkaardiga. Konto peab jääma
**kliendi nimele**.

## Ettevõtte andmed

Meryton Group OÜ, registrikood 16262305, KMKR EE102721669.
Järve põik 5, Kilingi-Nõmme, Pärnumaa 86303.
+372 5689 3723, info@meryton.ee
