#!/usr/bin/env python3
"""
Enne avaldamist käib see skript kontrollnimekirja koodiga läbi.

Kasutus projekti juurkaustast:
    python3 tooriistad/kontroll.py

Väljub koodiga 1, kui midagi on katki. Nii saab selle ka CI-sse panna.
"""

import json
import os
import re
import sys
from html.parser import HTMLParser

JUUR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AVALIK = os.path.join(JUUR, "public")

TYHJAD = {"area", "base", "br", "col", "embed", "hr", "img", "input",
          "link", "meta", "param", "source", "track", "wbr"}

vead = []
hoiatused = []


def viga(fail, tekst):
    vead.append(f"{fail}: {tekst}")


def hoiatus(fail, tekst):
    hoiatused.append(f"{fail}: {tekst}")


def lehed():
    return sorted(f for f in os.listdir(AVALIK) if f.endswith(".html"))


class Lugeja(HTMLParser):
    """Korjab sildid, pealkirjad ja atribuudid ühe käiguga."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.pinu = []
        self.tasakaalus = True
        self.pealkirjad = []
        self.pildid = []
        self.lingid = []
        self.reastiil = 0
        self.ld = []
        self._ld_kogub = False
        self._ld_puhver = ""

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if "style" in d:
            self.reastiil += 1
        if tag not in TYHJAD:
            self.pinu.append(tag)
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.pealkirjad.append(int(tag[1]))
        if tag == "img":
            self.pildid.append(d)
        if tag == "a" and "href" in d:
            self.lingid.append(d["href"])
        if tag == "script" and d.get("type") == "application/ld+json":
            self._ld_kogub = True
            self._ld_puhver = ""

    def handle_endtag(self, tag):
        if tag in TYHJAD:
            return
        if tag == "script" and self._ld_kogub:
            self.ld.append(self._ld_puhver)
            self._ld_kogub = False
        if not self.pinu or self.pinu[-1] != tag:
            self.tasakaalus = False
            if tag in self.pinu:
                while self.pinu and self.pinu.pop() != tag:
                    pass
        else:
            self.pinu.pop()

    def handle_data(self, data):
        if self._ld_kogub:
            self._ld_puhver += data


def kontrolli_leht(fail):
    tee = os.path.join(AVALIK, fail)
    sisu = open(tee, encoding="utf-8").read()

    lugeja = Lugeja()
    lugeja.feed(sisu)

    # 1. JSON-LD parsib
    for tykk in lugeja.ld:
        try:
            json.loads(tykk)
        except json.JSONDecodeError as e:
            viga(fail, f"JSON-LD ei parsi: {e}")

    # 2. Täpselt üks h1
    h1sid = lugeja.pealkirjad.count(1)
    if h1sid != 1:
        viga(fail, f"h1 tuleb olla täpselt üks, on {h1sid}")

    # 3. Pealkirjade tasemed ei hüppa
    eelmine = 0
    for tase in lugeja.pealkirjad:
        if eelmine and tase > eelmine + 1:
            hoiatus(fail, f"pealkirja tase hüppab h{eelmine} pealt h{tase} peale")
        eelmine = tase

    # 4. Sildid tasakaalus
    if not lugeja.tasakaalus or lugeja.pinu:
        viga(fail, f"sildid ei ole tasakaalus, lahti jäi {lugeja.pinu[:5]}")

    # 5. Reastiil on CSP tõttu keelatud
    if lugeja.reastiil:
        viga(fail, f"{lugeja.reastiil} style= atribuuti, CSP keelab need")

    # 6. Pikk mõttekriips
    if "—" in sisu:
        viga(fail, "sisaldab pikka mõttekriipsu U+2014")

    # 7. Kohatäited
    for muster in re.findall(r"\[[A-ZÄÖÜÕ][A-ZÄÖÜÕ /]{2,}\]", sisu):
        viga(fail, f"kohatäide koodis: {muster}")

    # 8. Pildid: alt, width, height ja fail olemas
    for pilt in lugeja.pildid:
        src = pilt.get("src", "")
        # Valgusti kohatäide saab src-i ja alt-i JavaScriptist, seda ei kontrolli
        if src.startswith("data:"):
            continue
        if not pilt.get("alt", "").strip():
            viga(fail, f"pildil puudub alt: {src}")
        if not pilt.get("width") or not pilt.get("height"):
            viga(fail, f"pildil puudub width või height: {src}")
        if src.startswith(("http://", "https://")):
            continue
        pilditee = os.path.join(AVALIK, src.lstrip("/"))
        if not os.path.exists(pilditee):
            viga(fail, f"pilti ei ole olemas: {src}")

    # 9. Sisemised lingid viitavad olemasolevale
    for href in lugeja.lingid:
        if href.startswith(("http://", "https://", "mailto:", "tel:", "#")):
            continue
        tee_osa = href.split("#")[0].split("?")[0]
        if not tee_osa:
            continue
        if tee_osa.endswith(".html"):
            viga(fail, f"link .html-lõpuga, Workeri all tuleb 307 hüpe: {href}")
            continue
        nimi = "index" if tee_osa == "/" else tee_osa.strip("/")
        kandidaadid = [os.path.join(AVALIK, nimi + ".html"),
                       os.path.join(AVALIK, nimi)]
        if not any(os.path.exists(k) for k in kandidaadid):
            viga(fail, f"katkine sisemine link: {href}")

    # 10. Ankrud viitavad olemasolevale id-le
    idd = set(re.findall(r'\bid="([^"]+)"', sisu))
    for href in lugeja.lingid:
        if href.startswith("#") and href[1:] and href[1:] not in idd:
            viga(fail, f"katkine ankur: {href}")

    # 11. Title ja description
    pealkiri = re.search(r"<title>(.*?)</title>", sisu, re.S)
    kirjeldus = re.search(r'<meta name="description" content="([^"]*)"', sisu)
    if not pealkiri or not pealkiri.group(1).strip():
        viga(fail, "title puudub")
    elif len(pealkiri.group(1)) > 65:
        hoiatus(fail, f"title on {len(pealkiri.group(1))} tähemärki, soovitus kuni 60")
    if fail != "404.html":
        if not kirjeldus or not kirjeldus.group(1).strip():
            viga(fail, "meta description puudub")
        elif len(kirjeldus.group(1)) > 160:
            hoiatus(fail, f"description on {len(kirjeldus.group(1))} tähemärki, soovitus kuni 155")

    return (pealkiri.group(1).strip() if pealkiri else None,
            kirjeldus.group(1).strip() if kirjeldus else None)


def kontrolli_pildid():
    for kaust, _, failid in os.walk(os.path.join(AVALIK, "pildid")):
        for f in failid:
            tee = os.path.join(kaust, f)
            suurus = os.path.getsize(tee)
            if suurus > 400 * 1024:
                viga(os.path.relpath(tee, AVALIK),
                     f"{round(suurus / 1024)} KB, piir on 400 KB")


def kontrolli_saladused():
    kahtlane = re.compile(r"re_[A-Za-z0-9_]{16,}")
    for kaust, kaustad, failid in os.walk(JUUR):
        kaustad[:] = [k for k in kaustad if k not in
                      {".git", "node_modules", ".wrangler", "toorpildid"}]
        for f in failid:
            if not f.endswith((".js", ".html", ".json", ".jsonc", ".md", ".py", ".txt")):
                continue
            tee = os.path.join(kaust, f)
            try:
                sisu = open(tee, encoding="utf-8").read()
            except (UnicodeDecodeError, OSError):
                continue
            if kahtlane.search(sisu) and not f.endswith(".example"):
                viga(os.path.relpath(tee, JUUR), "näeb välja nagu Resendi API võti koodis")


def kontrolli_sitemap():
    tee = os.path.join(AVALIK, "sitemap.xml")
    sisu = open(tee, encoding="utf-8").read()
    for loc in re.findall(r"<loc>(https://www\.meryton\.ee[^<]*)</loc>", sisu):
        rada = loc.replace("https://www.meryton.ee", "")
        if rada.endswith(".html"):
            viga("sitemap.xml", f"aadress .html-lõpuga: {rada}")
        if rada.startswith("/pildid/"):
            if not os.path.exists(os.path.join(AVALIK, rada.lstrip("/"))):
                viga("sitemap.xml", f"pilti ei ole olemas: {rada}")


def main():
    if not os.path.isdir(AVALIK):
        print("Kausta public/ ei ole.")
        return 1

    pealkirjad, kirjeldused = {}, {}
    for fail in lehed():
        p, k = kontrolli_leht(fail)
        if p:
            pealkirjad.setdefault(p, []).append(fail)
        if k:
            kirjeldused.setdefault(k, []).append(fail)

    for tekst, failid in pealkirjad.items():
        if len(failid) > 1:
            viga(", ".join(failid), f"sama title mitmel lehel: {tekst}")
    for tekst, failid in kirjeldused.items():
        if len(failid) > 1:
            viga(", ".join(failid), f"sama description mitmel lehel: {tekst}")

    kontrolli_pildid()
    kontrolli_sitemap()
    kontrolli_saladused()

    for h in hoiatused:
        print("HOIATUS  " + h)
    for v in vead:
        print("VIGA     " + v)

    print()
    print(f"Lehti {len(lehed())}, vigu {len(vead)}, hoiatusi {len(hoiatused)}.")
    return 1 if vead else 0


if __name__ == "__main__":
    sys.exit(main())
