/* Meryton Group, jagatud skript kõigile lehtedele. */
(function () {
  'use strict';

  /* --- Mobiilimenüü ------------------------------------------------------ */

  var menuuNupp = document.querySelector('.menuu-nupp');
  var menuu = document.getElementById('peamenuu');

  if (menuuNupp && menuu) {
    menuuNupp.addEventListener('click', function () {
      var avatud = menuu.getAttribute('data-avatud') === 'jah';
      menuu.setAttribute('data-avatud', avatud ? 'ei' : 'jah');
      menuuNupp.setAttribute('aria-expanded', avatud ? 'false' : 'true');
      menuuNupp.setAttribute('aria-label', avatud ? 'Ava menüü' : 'Sulge menüü');
    });

    menuu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        menuu.setAttribute('data-avatud', 'ei');
        menuuNupp.setAttribute('aria-expanded', 'false');
        menuuNupp.setAttribute('aria-label', 'Ava menüü');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuu.getAttribute('data-avatud') === 'jah') {
        menuu.setAttribute('data-avatud', 'ei');
        menuuNupp.setAttribute('aria-expanded', 'false');
        menuuNupp.focus();
      }
    });
  }

  /* --- Avalehe päis: läbipaistev ainult lehe tipus ----------------------- */

  var pais = document.querySelector('.pais--hoiv');

  if (pais) {
    var avatudMenuu = false;

    var uuenda = function () {
      var tipus = window.scrollY < 40 && !avatudMenuu;
      pais.classList.toggle('pais--hoiv', tipus);
    };

    // menüü avamisel peab päis kohe tumedaks minema, muidu jääb tekst pildi peale
    if (menuuNupp) {
      menuuNupp.addEventListener('click', function () {
        avatudMenuu = menuu.getAttribute('data-avatud') === 'jah';
        uuenda();
      });
    }

    window.addEventListener('scroll', uuenda, { passive: true });
    uuenda();
  }

  /* --- Avalehe kategooriakastid ------------------------------------------- */

  var kastid = Array.prototype.slice.call(document.querySelectorAll('.lint__kast'));

  if (kastid.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var VAHE = 3500;          // kui tihti üks kast pilti vahetab
    var TUHMUMINE = 450;      // peab kokku langema CSS-i üleminekuga
    var kellad = [];

    var lindid = kastid.map(function (kast) {
      var varu = [];
      try {
        varu = JSON.parse(kast.getAttribute('data-pildid')) || [];
      } catch (e) {
        varu = [];
      }
      return { img: kast.querySelector('img'), varu: varu, kohal: 0 };
    }).filter(function (l) {
      return l.img && l.varu.length > 1;
    });

    // Lae ülejäänud pildid vaikselt ette, muidu jääb esimesel vahetusel auk
    window.addEventListener('load', function () {
      lindid.forEach(function (l) {
        l.varu.slice(1).forEach(function (p) {
          var e = new Image();
          e.src = p.tee;
        });
      });
    });

    function vaheta(l) {
      l.kohal = (l.kohal + 1) % l.varu.length;
      var p = l.varu[l.kohal];
      l.img.setAttribute('data-vahetub', '');
      window.setTimeout(function () {
        l.img.setAttribute('src', p.tee);
        l.img.setAttribute('alt', p.alt || '');
        l.img.removeAttribute('data-vahetub');
      }, TUHMUMINE);
    }

    function kaima() {
      if (kellad.length) return;
      lindid.forEach(function (l, i) {
        // kastid nihutatakse üksteise suhtes, et nad ei vahetaks korraga
        var nihe = Math.round((VAHE / lindid.length) * i);
        var alusta = window.setTimeout(function () {
          vaheta(l);
          kellad.push(window.setInterval(function () { vaheta(l); }, VAHE));
        }, nihe);
        kellad.push(alusta);
      });
    }

    function seisma() {
      kellad.forEach(function (k) {
        window.clearTimeout(k);
        window.clearInterval(k);
      });
      kellad = [];
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) seisma();
      else kaima();
    });

    if (lindid.length) kaima();
  }

  /* --- Galerii: vaata veel ----------------------------------------------- */

  var EELVAADE = 3;
  var veelNupud = document.querySelectorAll('[data-veel]');

  // Mitu pilti on hetkel peidus. Osa peidab hidden-atribuut, neljanda pildi
  // peidab laiadel ekraanidel CSS, seega loeme tegeliku display väärtuse.
  function peidetuid(ruudustik) {
    var koik = ruudustik.querySelectorAll('.pilt');
    var arv = 0;
    Array.prototype.forEach.call(koik, function (p) {
      if (window.getComputedStyle(p).display === 'none') arv += 1;
    });
    return arv;
  }

  function pane(nupp, ruudustik) {
    var arv = peidetuid(ruudustik);
    nupp.setAttribute('aria-expanded', 'false');
    nupp.textContent = 'Vaata veel (' + arv + ')';
    nupp.hidden = arv === 0;
  }

  var paarid = [];

  Array.prototype.forEach.call(veelNupud, function (nupp) {
    var ruudustik = document.getElementById(nupp.getAttribute('aria-controls'));
    if (!ruudustik) return;

    paarid.push([nupp, ruudustik]);
    pane(nupp, ruudustik);

    nupp.addEventListener('click', function () {
      if (nupp.getAttribute('aria-expanded') === 'true') {
        var koik = ruudustik.querySelectorAll('.pilt');
        Array.prototype.forEach.call(koik, function (p, i) {
          if (i >= EELVAADE) p.setAttribute('hidden', '');
        });
        ruudustik.removeAttribute('data-avatud');
        pane(nupp, ruudustik);
        ruudustik.parentNode.scrollIntoView({ block: 'start' });
        return;
      }

      var peidetud = ruudustik.querySelectorAll('.pilt[hidden]');
      Array.prototype.forEach.call(peidetud, function (p) { p.removeAttribute('hidden'); });
      ruudustik.setAttribute('data-avatud', 'jah');
      nupp.setAttribute('aria-expanded', 'true');
      nupp.textContent = 'Näita vähem';
    });
  });

  // Number tuleb üle lugeda pärast lehe täielikku laadimist ja akna suuruse
  // muutumisel, sest neljanda pildi peidab murdepunktiga seotud CSS.
  function loeUuesti() {
    paarid.forEach(function (paar) {
      if (paar[0].getAttribute('aria-expanded') !== 'true') pane(paar[0], paar[1]);
    });
  }

  if (paarid.length) {
    window.addEventListener('load', loeUuesti);
    var ootel;
    window.addEventListener('resize', function () {
      clearTimeout(ootel);
      ootel = setTimeout(loeUuesti, 200);
    });
  }

  /* --- Galerii: kirjeldus vajutusel --------------------------------------- */

  // Hiirega tuleb kirjeldus pildi peale minnes. Puuteekraanil hiirt ei ole,
  // seega seal avab ja sulgeb kirjelduse vajutus.
  var ruudustikud = document.querySelectorAll('.pildid');

  Array.prototype.forEach.call(ruudustikud, function (r) {
    r.addEventListener('click', function (e) {
      var pilt = e.target.closest ? e.target.closest('.pilt--vaikne') : null;
      if (!pilt) return;
      var avatud = pilt.getAttribute('data-tekst') === 'jah';
      Array.prototype.forEach.call(r.querySelectorAll('.pilt[data-tekst]'), function (p) {
        p.removeAttribute('data-tekst');
      });
      if (!avatud) pilt.setAttribute('data-tekst', 'jah');
    });
  });

  /* --- Galerii: suurendus ------------------------------------------------ */

  var aken = document.getElementById('suurendus');

  if (aken) {
    var pilt = document.getElementById('suurendus-pilt');
    var tekst = document.getElementById('suurendus-tekst');
    var jarjend = [];
    var kohal = 0;
    var eelmineFookus = null;

    function nayta(i) {
      if (!jarjend.length) return;
      kohal = (i + jarjend.length) % jarjend.length;
      var nupp = jarjend[kohal];
      pilt.setAttribute('src', nupp.getAttribute('data-suur'));
      pilt.setAttribute('alt', nupp.getAttribute('data-alt') || '');
      tekst.textContent = (nupp.getAttribute('data-alt') || '') +
        '  (' + (kohal + 1) + '/' + jarjend.length + ')';
    }

    function ava(nupp) {
      var ruudustik = nupp.closest('.pildid');
      jarjend = Array.prototype.slice.call(ruudustik.querySelectorAll('.pilt[data-suur]'));
      eelmineFookus = nupp;
      nayta(jarjend.indexOf(nupp));
      aken.setAttribute('open', '');
      document.body.style.overflow = 'hidden';
      var sulge = aken.querySelector('[data-sulge]');
      if (sulge) sulge.focus();
    }

    function sulge() {
      aken.removeAttribute('open');
      document.body.style.overflow = '';
      pilt.setAttribute('src', '');
      if (eelmineFookus) eelmineFookus.focus();
    }

    document.addEventListener('click', function (e) {
      var nupp = e.target.closest ? e.target.closest('.pilt[data-suur]') : null;
      if (nupp) { ava(nupp); return; }

      if (e.target.closest && e.target.closest('[data-sulge]')) { sulge(); return; }

      var liigu = e.target.closest ? e.target.closest('[data-liigu]') : null;
      if (liigu) { nayta(kohal + parseInt(liigu.getAttribute('data-liigu'), 10)); return; }

      if (e.target === aken) sulge();
    });

    document.addEventListener('keydown', function (e) {
      if (!aken.hasAttribute('open')) return;
      if (e.key === 'Escape') sulge();
      if (e.key === 'ArrowRight') nayta(kohal + 1);
      if (e.key === 'ArrowLeft') nayta(kohal - 1);
    });
  }

  /* --- Hinnapäringu vorm ------------------------------------------------- */

  var vorm = document.getElementById('paring');

  if (vorm) {
    var teade = document.getElementById('vormi-teade');
    var saatmisel = false;

    // Teenuste lehelt tullakse aadressiga kontakt.html?teenus=vannitoad,
    // siis on õige linnuke juba ette valitud.
    var soovitud = new URLSearchParams(window.location.search).get('teenus');
    if (soovitud) {
      var linnuke = vorm.querySelector('input[data-teenus="' + soovitud.replace(/[^a-z-]/g, '') + '"]');
      if (linnuke) linnuke.checked = true;
    }

    vorm.addEventListener('submit', function (e) {
      if (saatmisel) { e.preventDefault(); return; }

      var puudu = [];
      if (!vorm.nimi.value.trim()) puudu.push('nimi');
      if (!vorm.epost.value.trim() || vorm.epost.value.indexOf('@') < 1) puudu.push('e-post');
      if (!vorm.sonum.value.trim()) puudu.push('kirjeldus');
      if (!vorm.nousolek.checked) puudu.push('nõusolek');

      if (puudu.length) {
        e.preventDefault();
        teade.textContent = 'Palun täida veel: ' + puudu.join(', ') + '.';
        return;
      }

      e.preventDefault();
      saatmisel = true;
      teade.textContent = 'Saadan päringut.';
      var nupp = vorm.querySelector('button[type="submit"]');
      if (nupp) nupp.disabled = true;

      var andmed = {};
      new FormData(vorm).forEach(function (v, k) {
        if (k in andmed) {
          if (!Array.isArray(andmed[k])) andmed[k] = [andmed[k]];
          andmed[k].push(v);
        } else {
          andmed[k] = v;
        }
      });

      fetch('/api/kontakt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(andmed)
      })
        .then(function (r) {
          if (r.ok) {
            window.location.href = '/aitah';
            return;
          }
          return r.json().catch(function () { return {}; }).then(function (j) {
            throw new Error(j.viga || '');
          });
        })
        .catch(function (err) {
          saatmisel = false;
          if (nupp) nupp.disabled = false;
          teade.textContent = (err && err.message)
            ? err.message
            : 'Päringu saatmine ei õnnestunud. Palun helista numbril +372 5689 3723 või kirjuta info@meryton.ee.';
        });
    });
  }
})();
