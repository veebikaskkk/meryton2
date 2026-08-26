#!/usr/bin/env python3
"""
Korjab kõik lehel nähtavad tekstid ühte faili TEKSTID.md.

Mõte on selles, et saaks kogu sisu ühe failina kellelegi teisele ümber
kirjutada anda, ilma et ta peaks HTML-i sees sobrama.

Kasutus projekti juurkaustast:
    python3 tooriistad/tekstid.py

Iga tekstiplokk saab püsiva tunnuse, näiteks [teenused.html:h2:3]. Kui
parandatud tekst tagasi tuleb, saab selle tunnuse järgi õigesse kohta panna.
Galerii alt-tekstid siia ei tule, need on failis tooriistad/galerii-andmed.json.
"""

import io, os, re, sys
from html.parser import HTMLParser

JUUR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'public')
VALJUND = os.path.join(os.path.dirname(JUUR), 'TEKSTID.md')

LEHED = [
    ('index.html', 'Avaleht'),
    ('teenused.html', 'Teenused'),
    ('tood.html', 'Tehtud tööd'),
    ('kontakt.html', 'Kontakt'),
    ('aitah.html', 'Tänuleht'),
    ('privaatsus.html', 'Privaatsusteade'),
    ('404.html', 'Vealeht'),
]

# Sildid, mille sisu meid huvitab
KORJA = {'h1', 'h2', 'h3', 'p', 'li', 'summary', 'label', 'legend', 'a', 'button', 'title'}
# Plokid, mida vahele jätta: navigatsioon, jalus ja masinaga genereeritud galerii
JATA = {'nav', 'footer', 'header', 'script', 'style'}


class Korjaja(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tykid = []          # (silt, tekst)
        self.puhver = ''
        self.aktiivne = None
        self.sygavus_jata = 0
        self.galeriis = False
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'meta' and d.get('name') == 'description':
            self.meta['description'] = d.get('content', '')
        # galerii plokk on genereeritud, seda käsitsi muuta ei ole mõtet
        if d.get('class', '') == 'kategooria':
            self.galeriis = True
        if tag in JATA:
            self.sygavus_jata += 1
            return
        if self.sygavus_jata or self.galeriis:
            return
        if tag in KORJA and self.aktiivne is None:
            self.aktiivne = tag
            self.puhver = ''

    def handle_endtag(self, tag):
        if tag in JATA and self.sygavus_jata:
            self.sygavus_jata -= 1
            return
        if tag == 'article' and self.galeriis:
            self.galeriis = False
            return
        if self.aktiivne == tag:
            tekst = re.sub(r'\s+', ' ', self.puhver).strip()
            if tekst and len(tekst) > 1:
                self.tykid.append((tag, tekst))
            self.aktiivne = None
            self.puhver = ''

    def handle_data(self, data):
        if self.aktiivne and not self.sygavus_jata and not self.galeriis:
            self.puhver += data


def main():
    read = ['# Meryton Group OÜ, kodulehe tekstid', '']
    read += [
        'See fail on kogu lehel nähtav tekst ühes kohas. Genereeritud käsuga',
        '`python3 tooriistad/tekstid.py`, ehk käsitsi siia kirjutamisel läheb',
        'muudatus järgmisel genereerimisel kaotsi.',
        '',
        '## Juhend sellele, kes teksti ümber kirjutab',
        '',
        '- Muuda ainult ridu, mis algavad märgiga `>`.',
        '- Ära muuda ega eemalda nurksulgudes tunnuseid, näiteks `[teenused.html:h2:3]`.',
        '  Nende järgi pannakse tekst hiljem õigesse kohta tagasi.',
        '- Ära lisa ega kustuta plokke. Kui mõni tekst on üleliigne, kirjuta see lühemaks.',
        '- Ära kasuta pikka mõttekriipsu (—). Kasuta lühikest (–), koma või punkti.',
        '- Koma ei käi rinnastavate sidesõnade ja, ning, või, ega ette. Erand on siis,',
        '  kui koma sulgeb kõrvallause.',
        '- Ära lisa fakte, mida siin ei ole: hindu, tähtaegu, garantiisid, sertifikaate,',
        '  töötajate arvu ega klientide tagasisidet.',
        '- `title` on otsingutulemuse pealkiri, kuni umbes 60 tähemärki.',
        '  `description` on otsingutulemuse kirjeldus, kuni umbes 155 tähemärki.',
        '',
        'Galerii piltide alt-tekstid ei ole siin. Need on failis',
        '`tooriistad/galerii-andmed.json` välja `alt` all.',
        '',
        '---',
        '',
    ]

    kokku = 0
    for fail, nimi in LEHED:
        tee = os.path.join(JUUR, fail)
        if not os.path.exists(tee):
            continue
        s = io.open(tee, encoding='utf-8').read()
        k = Korjaja()
        k.feed(s)

        read.append(f'## {nimi} ({fail})')
        read.append('')

        pealkiri = next((t for sil, t in k.tykid if sil == 'title'), '')
        if pealkiri:
            read += [f'[{fail}:title]', f'> {pealkiri}', '']
            kokku += 1
        if k.meta.get('description'):
            read += [f'[{fail}:description]', f"> {k.meta['description']}", '']
            kokku += 1

        loendurid = {}
        for silt, tekst in k.tykid:
            if silt == 'title':
                continue
            loendurid[silt] = loendurid.get(silt, 0) + 1
            read += [f'[{fail}:{silt}:{loendurid[silt]}]', f'> {tekst}', '']
            kokku += 1

        read += ['---', '']

    io.open(VALJUND, 'w', encoding='utf-8').write('\n'.join(read))
    print(f'TEKSTID.md kirjutatud, {kokku} tekstiplokki')


if __name__ == '__main__':
    main()
