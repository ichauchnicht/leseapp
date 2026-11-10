/* Einfache Silbentrennung für Deutsch (regelbasiert, keine Wörterbuchdaten).
   Schwäche: Komposita (Haustür → Hau-stür) werden nicht immer an der Wortfuge getrennt. */
(function (root) {
  const VOWELS = 'aeiouäöüy';
  const DIPHTHONGS = ['ie', 'ei', 'ai', 'au', 'eu', 'äu', 'ey', 'ay', 'oy', 'aa', 'ee', 'oo'];
  const CONS_UNITS = ['sch', 'ch', 'ck', 'ph', 'th', 'qu'];

  // Bibliothek "hyphen" (ytiurin/hyphen) mit deutschen Mustern von 1996, per <script> geladen.
  // Fehlt sie oder trennt sie ein Wort nicht, greift die eigene Heuristik.
  let hyphenator = null;
  function getHyphenator() {
    if (hyphenator === null) {
      hyphenator = (typeof root.createHyphenator === 'function' && root.hyphenationPatternsDe1996)
        ? root.createHyphenator(root.hyphenationPatternsDe1996, { hyphenChar: '­', minWordLength: 1 })
        : false;
    }
    return hyphenator;
  }

  function syllabify(word) {
    try {
      const h = getHyphenator();
      if (h) {
        const parts = h(word).split('­').filter(Boolean);
        if (parts.length > 1 && parts.join('') === word) return parts;
      }
    } catch (e) { /* Fallback unten */ }
    return heuristicSyllabify(word);
  }

  function heuristicSyllabify(word) {
    const lw = word.toLowerCase();
    // 1. Zerlege in Kerne (Vokalgruppen) und Konsonantenblöcke
    const parts = []; // {v:boolean, s:start, e:end}
    let i = 0;
    while (i < lw.length) {
      const isV = VOWELS.includes(lw[i]);
      if (isV) {
        let len = 1;
        if (i + 1 < lw.length && DIPHTHONGS.includes(lw.substr(i, 2))) len = 2;
        parts.push({ v: true, s: i, e: i + len });
        i += len;
      } else {
        let j = i;
        while (j < lw.length && !VOWELS.includes(lw[j])) j++;
        parts.push({ v: false, s: i, e: j });
        i = j;
      }
    }
    const nuclei = parts.filter(p => p.v).length;
    if (nuclei < 2) return [word];

    // 2. Schnittstellen zwischen Kernen bestimmen
    const cuts = [];
    parts.forEach((p, idx) => {
      if (p.v || idx === 0 || idx === parts.length - 1) return; // nur Konsonantenblöcke zwischen Kernen
      const cluster = lw.slice(p.s, p.e);
      // Einheiten bilden
      const units = [];
      for (let k = 0; k < cluster.length;) {
        const u = CONS_UNITS.find(x => cluster.startsWith(x, k));
        if (u) { units.push(k); k += u.length; } else { units.push(k); k++; }
      }
      // letzte Einheit gehört zur nächsten Silbe
      cuts.push(p.s + units[units.length - 1]);
    });

    const out = [];
    let prev = 0;
    for (const c of cuts) { out.push(word.slice(prev, c)); prev = c; }
    out.push(word.slice(prev));
    return out;
  }

  // Silben in zufällige, vom Original verschiedene Reihenfolge bringen
  function scramble(word) { return scrambleParts(word).join(''); }

  // Wie scramble, liefert aber die einzelnen Silben (für die farbige Anzeige)
  function scrambleParts(word) {
    const syl = syllabify(word);
    if (syl.length < 2) return [word];
    const orig = syl.join('|');
    let tries = 0, res;
    do {
      res = syl.slice();
      for (let i = res.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [res[i], res[j]] = [res[j], res[i]];
      }
      tries++;
    } while (res.join('|') === orig && tries < 50);
    if (res.join('|') === orig) res.reverse();
    return res;
  }

  root.syllabify = syllabify;
  root.heuristicSyllabify = heuristicSyllabify;
  root.scramble = scramble;
  root.scrambleParts = scrambleParts;
  if (typeof module !== 'undefined') module.exports = { syllabify, scramble, scrambleParts };
})(typeof window !== 'undefined' ? window : globalThis);
