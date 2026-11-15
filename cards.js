/* Rummy card artwork kit: vector card faces, jester joker, patterned card backs, four-colour deck.
   Pure DOM/SVG, no network, no images. Works with any card ids as long as you can map an id to
   { joker:boolean, suit:0..3 (0 spade, 1 heart, 2 diamond, 3 club), rank:1..13 }.            */
(function (root) {
  'use strict';
  var RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var SUIT_NAME = ['spades', 'hearts', 'diamonds', 'clubs'];

  /* suit glyphs, all drawn in a 24x24 box so they scale perfectly at any card size */
  var PATH = [
    'M12 1.8C8.2 7.4 2.6 10.4 2.6 15a4.7 4.7 0 0 0 8 3.3c-.1 1.7-.7 3-1.9 4.1h6.6c-1.2-1.1-1.8-2.4-1.9-4.1a4.7 4.7 0 0 0 8-3.3C21.4 10.4 15.8 7.4 12 1.8z',
    'M12 22.4C5.4 17.2 2 13.6 2 9.2a5.3 5.3 0 0 1 10-2.4 5.3 5.3 0 0 1 10 2.4c0 4.4-3.4 8-10 13.2z',
    'M12 1.4c2.4 3.6 6 7.1 9.6 10.6-3.6 3.5-7.2 7-9.6 10.6C9.6 19 6 15.5 2.4 12 6 8.5 9.6 5 12 1.4z',
    'M12 1.6a4.8 4.8 0 0 0-3.6 8 4.8 4.8 0 1 0 2.6 8.4c-.1 1.9-.8 3.3-2 4.3h6c-1.2-1-1.9-2.4-2-4.3a4.8 4.8 0 1 0 2.6-8.4A4.8 4.8 0 0 0 12 1.6z'
  ];

  /* standard pip layouts on a 100 x 142 face. [column, y, upside-down?] columns: L, C, R */
  var X = { L: 33, C: 50, R: 67 };
  var PIPS = {
    2: [['C', 38], ['C', 104, 1]],
    3: [['C', 38], ['C', 71], ['C', 104, 1]],
    4: [['L', 38], ['R', 38], ['L', 104, 1], ['R', 104, 1]],
    5: [['L', 38], ['R', 38], ['C', 71], ['L', 104, 1], ['R', 104, 1]],
    6: [['L', 38], ['R', 38], ['L', 71], ['R', 71], ['L', 104, 1], ['R', 104, 1]],
    7: [['L', 38], ['R', 38], ['C', 54], ['L', 71], ['R', 71], ['L', 104, 1], ['R', 104, 1]],
    8: [['L', 38], ['R', 38], ['C', 54], ['L', 71], ['R', 71], ['C', 88, 1], ['L', 104, 1], ['R', 104, 1]],
    9: [['L', 36], ['R', 36], ['L', 58], ['R', 58], ['C', 71], ['L', 84, 1], ['R', 84, 1], ['L', 106, 1], ['R', 106, 1]],
    10: [['L', 36], ['R', 36], ['C', 47], ['L', 58], ['R', 58], ['L', 84, 1], ['R', 84, 1], ['C', 95, 1], ['L', 106, 1], ['R', 106, 1]]
  };

  var spriteDone = false;
  function ensureSprite() {
    if (spriteDone || !root.document || !root.document.body) return;
    spriteDone = true;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (var i = 0; i < 4; i++) s += '<symbol id="rk-s' + i + '" viewBox="0 0 24 24"><path d="' + PATH[i] + '"/></symbol>';
    // Diamond lattice pattern for Aces
    s += '<pattern id="rk-lat" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="6" height="6" fill="currentColor"/>' +
      '<path d="M0 3h6M3 0v6" stroke="#fffaf0" stroke-opacity=".75" stroke-width=".9"/>' +
      '</pattern>';
    // Mini jester hat icon for Joker index (no star)
    s += '<symbol id="rk-jcap" viewBox="0 0 24 24">' +
      '<path d="M3 15C2 10 6 7 8 10C9 7 15 7 16 10C18 7 22 10 21 15C18 16 6 16 3 15Z" fill="#d6283a"/>' +
      '<circle cx="8" cy="8.5" r="1.8" fill="#f2b632"/><circle cx="12" cy="5.5" r="1.8" fill="#f2b632"/><circle cx="16" cy="8.5" r="1.8" fill="#f2b632"/>' +
      '</symbol>';
    s += '</defs></svg>';
    root.document.body.insertAdjacentHTML('afterbegin', s);
  }

  function glyph(suit, x, y, size, flip) {
    var h = size / 2, t = flip ? ' transform="rotate(180 ' + x + ' ' + y + ')"' : '';
    return '<use href="#rk-s' + suit + '" x="' + (x - h) + '" y="' + (y - h) + '" width="' + size + '" height="' + size + '"' + t + '/>';
  }

  function faceArt(c) {
    var s = c.suit, r = c.rank, a = '';
    // Ace: large center suit symbol with geometric diamond lattice inner pattern and thin frame
    if (r === 1) {
      a += '<rect x="6.5" y="6.5" width="87" height="129" rx="2" fill="none" stroke="currentColor" stroke-opacity=".2" stroke-width=".75"/>';
      a += '<rect x="5.5" y="5.5" width="2.5" height="2.5" fill="currentColor" fill-opacity=".3"/>' +
           '<rect x="92" y="5.5" width="2.5" height="2.5" fill="currentColor" fill-opacity=".3"/>' +
           '<rect x="5.5" y="134" width="2.5" height="2.5" fill="currentColor" fill-opacity=".3"/>' +
           '<rect x="92" y="134" width="2.5" height="2.5" fill="currentColor" fill-opacity=".3"/>';
      a += '<use href="#rk-s' + s + '" x="26" y="47" width="48" height="48" fill="url(#rk-lat)" stroke="currentColor" stroke-width="1.2"/>';
      return a;
    }
    // Number cards 2-10: clean standard pips layout
    if (r <= 10) {
      var size = r === 10 ? 15 : (r >= 7 ? 16 : 17);
      PIPS[r].forEach(function (p) { a += glyph(s, X[p[0]], p[1], size, p[2]); });
      return a;
    }

    // Court cards (Jack, Queen, King): full ornamental panels
    var arch = 'M22 120V46Q22 22 50 22Q78 22 78 46V120Z';
    var arch2 = 'M26 116V47Q26 26 50 26Q74 26 74 47V116Z';

    if (r === 11) {
      // Jack: orange panel, red arched border, gold accents, big navy J
      a += '<path d="' + arch + '" fill="#ef8a2b" stroke="#d9503a" stroke-width="2.2"/>';
      a += '<path d="' + arch2 + '" fill="none" stroke="#fff3dc" stroke-width="1" stroke-opacity=".8"/>';
      a += '<circle cx="50" cy="31" r="2.4" class="rk-gold"/><circle cx="36" cy="36" r="1.5" class="rk-gold"/><circle cx="64" cy="36" r="1.5" class="rk-gold"/>';
      a += '<path d="' + arch2 + '" fill="none" stroke="#d9503a" stroke-width=".6" stroke-dasharray="2 3"/>';
      a += '<path d="M36 112l4-4 4 4zM60 112l4-4 4 4z" fill="#d9503a"/>';
      a += '<text class="rk-letter" x="50" y="78" text-anchor="middle" fill="#1b2540">J</text>';
      a += '<circle cx="50" cy="98" r="7.5" fill="#fffaf0"/>' + glyph(s, 50, 98, 10, 0).replace('<use ', '<use class="rk-suit" ');
      return a;
    }
    if (r === 12) {
      // Queen: cream/gold panel, gold arched border, tiara ornament, big navy Q
      a += '<path d="' + arch + '" fill="#fbf0d2" stroke="#e0a21d" stroke-width="2.2"/>';
      a += '<path d="' + arch2 + '" fill="none" stroke="#e0a21d" stroke-width="1" stroke-opacity=".6"/>';
      a += '<path d="M41 29L45 33L50 26L55 33L59 29" fill="none" stroke="#e0a21d" stroke-width="1.3"/>';
      a += '<circle cx="50" cy="24.5" r="1.8" class="rk-gold"/><circle cx="41" cy="27.5" r="1.2" class="rk-gold"/><circle cx="59" cy="27.5" r="1.2" class="rk-gold"/>';
      a += '<text class="rk-letter" x="50" y="78" text-anchor="middle" fill="#1b2540">Q</text>';
      a += '<circle cx="50" cy="98" r="7.5" fill="#fffaf0"/>' + glyph(s, 50, 98, 10, 0).replace('<use ', '<use class="rk-suit" ');
      return a;
    }
    if (r === 13) {
      // King: teal panel, gold arched ornament, crown crest, big navy K
      a += '<path d="' + arch + '" fill="#1f9a8a" stroke="#f2b13a" stroke-width="2.4"/>';
      a += '<path d="' + arch2 + '" fill="none" stroke="#f2b13a" stroke-width="1" stroke-opacity=".8"/>';
      a += '<path d="M39 29L44 34L50 25L56 34L61 29" fill="none" stroke="#f2b13a" stroke-width="1.4"/>';
      a += '<circle cx="50" cy="23.5" r="2" class="rk-gold"/><circle cx="39" cy="27.5" r="1.4" class="rk-gold"/><circle cx="61" cy="27.5" r="1.4" class="rk-gold"/>';
      a += '<path d="M38 112l4-4 4 4zM58 112l4-4 4 4z" fill="#f2b13a"/>';
      a += '<text class="rk-letter" x="50" y="78" text-anchor="middle" fill="#1b2540">K</text>';
      a += '<circle cx="50" cy="98" r="7.5" fill="#fffaf0"/>' + glyph(s, 50, 98, 10, 0).replace('<use ', '<use class="rk-suit" ');
      return a;
    }
    return '';
  }

  function jokerArt() {
    return '<path d="M28 88C18 72 14 52 22 36C30 44 38 60 42 88Z" fill="#d6283a"/>' +
      '<path d="M42 88C42 66 46 44 50 26C54 44 58 66 58 88Z" fill="#f2b632"/>' +
      '<path d="M72 88C82 72 86 52 78 36C70 44 62 60 58 88Z" fill="#14a38b"/>' +
      '<circle cx="22" cy="34" r="4.2" class="rk-bell"/><circle cx="50" cy="24" r="4.2" class="rk-bell"/><circle cx="78" cy="34" r="4.2" class="rk-bell"/>' +
      '<rect x="26" y="86" width="48" height="11" rx="5.5" fill="#6e1535"/>' +
      '<circle cx="34" cy="91.5" r="1.8" class="rk-gold"/><circle cx="50" cy="91.5" r="1.8" class="rk-gold"/><circle cx="66" cy="91.5" r="1.8" class="rk-gold"/>' +
      '<text class="rk-jtext" x="50" y="118" text-anchor="middle">JOKER</text>';
  }

  /* The card face. `id` is the card id, `info` is {joker,suit,rank}, `o` = {cls, wild:boolean}. */
  function cardHTML(id, info, o) {
    o = o || {};
    ensureSprite();
    var isJ = !!(info && info.joker);
    var suit = isJ ? 'j' : (info ? info.suit : 0);
    var rank = isJ ? 0 : (info ? info.rank : 1);
    var isRed = suit === 1 || suit === 2;
    var cls = 'card su' + suit + (isJ ? ' joker' : '') + (isRed ? ' red' : '') + (o.wild ? ' wild' : '') + (o.cls ? ' ' + o.cls : '');
    var label = isJ ? 'Joker' : (RANK[rank] + ' of ' + (SUIT_NAME[suit] || ''));

    if (isJ) {
      var jIdx = '<b>J</b><svg class="ci" viewBox="0 0 24 24"><use href="#rk-jcap"/></svg>';
      return '<div class="' + cls + '" data-card="' + id + '" role="img" aria-label="' + label + '">' +
        '<span class="tl">' + jIdx + '</span>' +
        '<span class="br">' + jIdx + '</span>' +
        '<svg class="art" viewBox="0 0 100 142" preserveAspectRatio="xMidYMid meet">' + jokerArt() + '</svg>' +
        '</div>';
    }

    var idx = '<b>' + RANK[rank] + '</b><svg class="ci" viewBox="0 0 24 24"><use href="#rk-s' + suit + '"/></svg>';
    return '<div class="' + cls + '" data-card="' + id + '" role="img" aria-label="' + label + '">' +
      '<span class="tl">' + idx + '</span>' +
      '<span class="br">' + idx + '</span>' +
      '<svg class="art" viewBox="0 0 100 142" preserveAspectRatio="xMidYMid meet">' + faceArt(info) + '</svg>' +
      '</div>';
  }

  /* ---- card backs ---- */
  var THEMES = {
    coral: ['#e2563f', '#c23a28', '#fff3e0'],
    navy:  ['#1e3260', '#132142', '#f6e7c1'],
    teal:  ['#1f9a8a', '#106359', '#fff3dc']
  };

  function backSVG(theme) {
    var t = THEMES[theme] || THEMES.coral, bg = t[0], g = t[2], rings = '', i;
    for (i = 4; i <= 68; i += 3.8) {
      rings += '<circle r="' + i.toFixed(1) + '" fill="none" stroke="' + g + '" stroke-opacity="' + (i > 52 ? .6 : .85) + '" stroke-width=".85"/>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 142" preserveAspectRatio="none">' +
      '<rect width="100" height="142" fill="' + bg + '"/>' +
      '<clipPath id="bc"><rect x="6.5" y="6.5" width="87" height="129" rx="5.5"/></clipPath>' +
      '<g clip-path="url(#bc)"><g transform="translate(50 71)">' + rings + '</g></g>' +
      '<rect x="6.5" y="6.5" width="87" height="129" rx="5.5" fill="none" stroke="' + g + '" stroke-width="1.8"/>' +
      '<circle cx="50" cy="71" r="6" fill="' + bg + '" stroke="' + g + '" stroke-width="1.5"/>' +
      '<circle cx="50" cy="71" r="2.4" fill="' + g + '"/>' +
      '<path d="M85 125l3.5 3.5-3.5 3.5-3.5-3.5z" fill="none" stroke="' + g + '" stroke-width="1.2"/>' +
      '</svg>';
  }

  function setBack(theme) {
    if (!root.document) return;
    root.document.documentElement.style.setProperty('--back-img', 'url("data:image/svg+xml,' + encodeURIComponent(backSVG(theme)) + '")');
  }

  function setDeck(style) { // 'classic' (red/black) or 'four' (black, red, blue, green)
    if (root.document) root.document.documentElement.setAttribute('data-deck', style === 'four' ? 'four' : 'classic');
  }

  root.RummyCards = {
    cardHTML: cardHTML,
    setBack: setBack,
    setDeck: setDeck,
    backSVG: backSVG,
    THEMES: Object.keys(THEMES)
  };
})(typeof window !== 'undefined' ? window : globalThis);
