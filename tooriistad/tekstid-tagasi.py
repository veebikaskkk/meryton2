#!/usr/bin/env python3
"""
Loeb parandatud TEKSTID.md faili ja paneb tekstid HTML-i tagasi.

Kasutus projekti juurkaustast:
    python3 tooriistad/tekstid-tagasi.py "TEKSTID uuendus.md"

Töötab ainult nende plokkide kallal, mille sisu on puhas tekst. Kui elemendi
sees on link või muu silt, jäetakse see vahele ja lisatakse nimekirja, mis
tuleb käsitsi üle vaadata. Nii ei saa import kogemata linki ära kustutada.
"""

import io, os, re, sys
from html.parser import HTMLParser

JUUR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
KORJA = {'h1', 'h2', 'h3', 'p', 'li', 'summary', 'label', 'legend', 'a', 'button', 'title'}
JATA = {'nav', 'footer', 'header', 'script', 'style'}


def nihked(s):
    """Rea ja veeru paarist märgi indeksi arvutamiseks."""
    algused = [0]
    for rida in s.split('\n')[:-1]:
        algused.append(algused[-1] + len(rida) + 1)
    return lambda r, v: algused[r - 1] + v


class Otsija(HTMLParser):
    def __init__(self, s):
        super().__init__(convert_charrefs=False)
        self.s = s
        self.n = nihked(s)
        self.leiud = []          # (silt, algus, lopp)
        self.aktiivne = None
        self.algus = 0
        self.sygavus_jata = 0
        self.galeriis = False

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if d.get('class', '') == 'kategooria':
            self.galeriis = True
        if tag in JATA:
            self.sygavus_jata += 1
            return
        if self.sygavus_jata or self.galeriis:
            return
        if tag in KORJA and self.aktiivne is None:
            self.aktiivne = tag
            r, v = self.getpos()
            self.algus = self.n(r, v) + len(self.get_starttag_text())

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in JATA and self.sygavus_jata:
            self.sygavus_jata -= 1
            return
        if tag == 'article' and self.galeriis:
            self.galeriis = False
            return
        if self.aktiivne == tag:
            r, v = self.getpos()
            self.leiud.append((tag, self.algus, self.n(r, v)))
            self.aktiivne = None


def loe_tekstid(tee):
    s = io.open(tee, encoding='utf-8').read()
    return {m.group(1): m.group(2).strip()
            for m in re.finditer(r'^\[([^\]]+)\]\s*\n>\s?(.*)$', s, re.M)}


def main():
    allikas = sys.argv[1] if len(sys.argv) > 1 else 'TEKSTID.md'
    uued = loe_tekstid(os.path.join(JUUR, allikas))

    lehed = sorted({k.split(':')[0] for k in uued})
    muudetud, vahele = 0, []

    for fail in lehed:
        tee = os.path.join(JUUR, fail)
        if not os.path.exists(tee):
            continue
        s = io.open(tee, encoding='utf-8').read()

        o = Otsija(s)
        o.feed(s)

        # loenda sildid samas järjekorras nagu korjaja
        loendurid = {}
        tood = []
        for silt, a, b in o.leiud:
            loendurid[silt] = loendurid.get(silt, 0) + 1
            tunnus = f'{fail}:{silt}' if silt == 'title' else f'{fail}:{silt}:{loendurid[silt]}'
            if tunnus not in uued:
                continue
            vana = s[a:b]
            uus = uued[tunnus]
            if re.sub(r'\s+', ' ', vana).strip() == uus:
                continue
            if '<' in vana:
                vahele.append((tunnus, re.sub(r'\s+', ' ', vana).strip()[:70]))
                continue
            tood.append((a, b, uus))

        # meta description eraldi
        tunnus = f'{fail}:description'
        if tunnus in uued:
            m = re.search(r'(name="description" content=")(.*?)(")', s, re.S)
            if m and m.group(2) != uued[tunnus]:
                tood.append((m.start(2), m.end(2), uued[tunnus]))

        for a, b, uus in sorted(tood, reverse=True):
            s = s[:a] + uus + s[b:]
            muudetud += 1

        io.open(tee, 'w', encoding='utf-8').write(s)

    print(f'{muudetud} teksti asendatud')
    if vahele:
        print(f'\nKäsitsi üle vaadata {len(vahele)} plokki, sest sees on link või muu silt:')
        for tunnus, tekst in vahele:
            print(f'  [{tunnus}]  {tekst}')


if __name__ == '__main__':
    main()
