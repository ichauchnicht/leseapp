/* Vergleich zwischen Gesprochenem (Spracherkennung) und Zielwort.
   Kinderstimmen werden oft etwas "daneben" erkannt – deshalb neben exakter Gleichheit
   auch Tippfehler-Toleranz (Levenshtein) und Klangvergleich (Kölner Phonetik). */
(function (root) {
  const norm = s => String(s).toLowerCase().replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[^a-z]/g, '');

  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  // Kölner Phonetik: gleich klingende Wörter ergeben denselben Code (Schere ≈ Schehre)
  function koelner(word) {
    const w = String(word).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 's').replace(/[^a-z]/g, '');
    let out = '';
    for (let i = 0; i < w.length; i++) {
      const c = w[i], p = w[i - 1] || '', n = w[i + 1] || '';
      let d = '';
      if ('aeijouy'.includes(c)) d = '0';
      else if (c === 'h') d = '';
      else if (c === 'b') d = '1';
      else if (c === 'p') d = n === 'h' ? '3' : '1';
      else if (c === 'd' || c === 't') d = 'csz'.includes(n) && n ? '8' : '2';
      else if ('fvw'.includes(c)) d = '3';
      else if (c === 'g' || c === 'k' || c === 'q') d = '4';
      else if (c === 'c') d = i === 0 ? ('ahkloqrux'.includes(n) && n ? '4' : '8')
                                      : ('ahkoqux'.includes(n) && n && !'sz'.includes(p) ? '4' : '8');
      else if (c === 'x') d = 'ckq'.includes(p) && p ? '8' : '48';
      else if (c === 'l') d = '5';
      else if (c === 'm' || c === 'n') d = '6';
      else if (c === 'r') d = '7';
      else if (c === 's' || c === 'z') d = '8';
      out += d;
    }
    out = out.replace(/(.)\1+/g, '$1');            // doppelte Codes zusammenfassen
    return out.charAt(0) + out.slice(1).replace(/0/g, ''); // Vokale nur am Anfang behalten
  }

  // level: 'streng' | 'normal' | 'grosszuegig'
  function wordMatches(c, t, level) {
    if (c === t) return true;
    const L = t.length;
    // Kurze Wörter bekommen kaum Spielraum, sonst zählt "Maus" für "Haus"
    const tol = level === 'streng' ? (L >= 6 ? 1 : 0)
              : level === 'grosszuegig' ? (L >= 11 ? 3 : L >= 8 ? 2 : L >= 5 ? 1 : 0)
              : (L >= 10 ? 2 : L >= 6 ? 1 : 0);
    if (lev(c, t) <= tol) return true;
    if (level !== 'streng' && L >= 4 && c.length >= 3) {
      const kc = koelner(c);
      if (kc && kc === koelner(t)) return true;
    }
    return false;
  }

  // heard: erkannter Text; targets: akzeptierte Zielwörter
  function matches(heard, targets, level) {
    const cands = [...String(heard).split(/\s+/), String(heard)].map(norm).filter(Boolean);
    return targets.map(norm).filter(Boolean).some(t => cands.some(c => wordMatches(c, t, level || 'normal')));
  }

  root.norm = norm; root.lev = lev; root.koelner = koelner; root.matches = matches;
  if (typeof module !== 'undefined') module.exports = { norm, lev, koelner, matches };
})(typeof window !== 'undefined' ? window : globalThis);
