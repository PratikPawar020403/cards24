/* ==========================================================================
   Cards24 Indian-Inspired Playing Card Artwork Kit (JavaScript / SVG)
   Component Architecture:
     - PlayingCard
     - CardFront
     - CardBack
     - NumberCard
     - AceCard
     - FaceCard
     - JokerCard
     - CardDeck
   ========================================================================== */

(function (root) {
  'use strict';

  var CONFIG = {
    ranks: ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    suits: ['spades', 'hearts', 'diamonds', 'clubs'],
    colors: {
      charcoal: '#1f2124',
      burgundy: '#781d2d',
      blue: '#165ba8',
      green: '#146c43',
      ivory: '#f8f4e6',
      border: '#281e18',
      gold: '#c8a452',
      emerald: '#114a2e'
    }
  };

  /* Suit Glyphs (drawn in 24x24 viewBox for crisp vector scaling) */
  var PATH = [
    // 0: Spades (Charcoal)
    'M12 2C8.2 7.4 2.6 10.4 2.6 15a4.7 4.7 0 0 0 8 3.3c-.1 1.7-.7 3-1.9 4.1h6.6c-1.2-1.1-1.8-2.4-1.9-4.1a4.7 4.7 0 0 0 8-3.3C21.4 10.4 15.8 7.4 12 2z',
    // 1: Hearts (Burgundy)
    'M12 21.8C5.8 17 2.4 13.6 2.4 9.4a5 5 0 0 1 9.6-2.2 5 5 0 0 1 9.6 2.2c0 4.2-3.4 7.6-9.6 12.4z',
    // 2: Diamonds (Burgundy)
    'M12 1.8c2.4 3.6 6 7.1 9.6 10.6-3.6 3.5-7.2 7-9.6 10.6C9.6 19 6 15.5 2.4 12 6 8.5 9.6 5 12 1.8z',
    // 3: Clubs (Charcoal)
    'M12 2a4.6 4.6 0 0 0-3.6 7.5 4.6 4.6 0 1 0 2.4 8.2c-.1 1.8-.7 3.2-1.8 4.3h6c-1.1-1.1-1.7-2.5-1.8-4.3a4.6 4.6 0 1 0 2.4-8.2A4.6 4.6 0 0 0 12 2z'
  ];

  /* Standard conventional pip layouts on 100 x 142 card canvas. [col, y, flip?] */
  var X = { L: 34, C: 50, R: 66 };
  var PIPS = {
    2: [['C', 40], ['C', 102, 1]],
    3: [['C', 40], ['C', 71], ['C', 102, 1]],
    4: [['L', 40], ['R', 40], ['L', 102, 1], ['R', 102, 1]],
    5: [['L', 40], ['R', 40], ['C', 71], ['L', 102, 1], ['R', 102, 1]],
    6: [['L', 40], ['R', 40], ['L', 71], ['R', 71], ['L', 102, 1], ['R', 102, 1]],
    7: [['L', 40], ['R', 40], ['C', 54], ['L', 71], ['R', 71], ['L', 102, 1], ['R', 102, 1]],
    8: [['L', 40], ['R', 40], ['C', 54], ['L', 71], ['R', 71], ['C', 88, 1], ['L', 102, 1], ['R', 102, 1]],
    9: [['L', 38], ['R', 38], ['L', 58], ['R', 58], ['C', 71], ['L', 84, 1], ['R', 84, 1], ['L', 104, 1], ['R', 104, 1]],
    10: [['L', 38], ['R', 38], ['C', 48], ['L', 58], ['R', 58], ['L', 84, 1], ['R', 84, 1], ['C', 94, 1], ['L', 104, 1], ['R', 104, 1]]
  };

  var spriteDone = false;
  function ensureSprite() {
    if (spriteDone || !root.document || !root.document.body) return;
    spriteDone = true;
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>';
    for (var i = 0; i < 4; i++) {
      s += '<symbol id="rk-s' + i + '" viewBox="0 0 24 24"><path d="' + PATH[i] + '"/></symbol>';
    }
    s += '</defs></svg>';
    root.document.body.insertAdjacentHTML('afterbegin', s);
  }

  function glyph(suit, x, y, size, flip) {
    var h = size / 2, t = flip ? ' transform="rotate(180 ' + x + ' ' + y + ')"' : '';
    return '<use href="#rk-s' + suit + '" x="' + (x - h) + '" y="' + (y - h) + '" width="' + size + '" height="' + size + '"' + t + '/>';
  }

  /* --------------------------------------------------------------------------
     Component: AceCard
     One prominent, large central suit symbol. Clean, iconic, balanced.
     -------------------------------------------------------------------------- */
  function AceCard(suit) {
    return glyph(suit, 50, 71, 42, 0);
  }

  /* --------------------------------------------------------------------------
     Component: NumberCard
     Standard conventional pip arrangements (2–10) with balanced spacing.
     -------------------------------------------------------------------------- */
  function NumberCard(suit, rank) {
    var size = rank === 10 ? 14 : (rank >= 7 ? 15 : 16);
    var a = '';
    (PIPS[rank] || []).forEach(function (p) {
      a += glyph(suit, X[p[0]], p[1], size, p[2]);
    });
    return a;
  }

  /* --------------------------------------------------------------------------
     Component: FaceCard (Jack, Queen, King)
     Indian architectural jharokha pointed multi-foil frame with fine geometric
     linework and oversized serif lettering (J, Q, K). No human figures.
     -------------------------------------------------------------------------- */
  function FaceCard(suit, rank) {
    var letter = CONFIG.ranks[rank];
    var isRed = suit === 1 || suit === 2;
    var col = isRed ? CONFIG.colors.burgundy : CONFIG.colors.charcoal;

    var outer = 'M 50 24 L 64 29 L 73 38 L 73 104 L 64 113 L 50 118 L 36 113 L 27 104 L 27 38 L 36 29 Z';
    var inner = 'M 50 28 L 61 33 L 69 41 L 69 101 L 61 109 L 50 114 L 39 109 L 31 101 L 31 41 L 39 33 Z';

    var s = '<g stroke="' + col + '">';
    s += '<path d="' + outer + '" fill="none" stroke-width="1.4"/>';
    s += '<path d="' + inner + '" fill="none" stroke-width="0.8"/>';

    // Finials at top and bottom apexes
    s += '<path d="M 50 20 L 52.5 23 L 50 26 L 47.5 23 Z" fill="' + col + '"/>';
    s += '<path d="M 50 116 L 52.5 119 L 50 122 L 47.5 119 Z" fill="' + col + '"/>';

    // Geometric knotwork / crosshatch bands
    s += '<g stroke-width="0.6" stroke-opacity="0.85">';
    s += '<line x1="31" y1="41" x2="69" y2="41"/>';
    s += '<line x1="33" y1="36" x2="67" y2="36"/>';
    for (var x = 35; x <= 65; x += 5) {
      s += '<line x1="' + x + '" y1="36" x2="' + (x + 3) + '" y2="41"/>';
      s += '<line x1="' + (x + 3) + '" y1="36" x2="' + x + '" y2="41"/>';
    }
    s += '<line x1="31" y1="101" x2="69" y2="101"/>';
    s += '<line x1="33" y1="106" x2="67" y2="106"/>';
    for (var bx = 35; bx <= 65; bx += 5) {
      s += '<line x1="' + bx + '" y1="101" x2="' + (bx + 3) + '" y2="106"/>';
      s += '<line x1="' + (bx + 3) + '" y1="101" x2="' + bx + '" y2="106"/>';
    }
    s += '</g>';

    // Oversized serif lettering
    s += '<text class="rk-letter" x="50" y="81" text-anchor="middle" fill="' + col + '" font-family="Georgia, \'Times New Roman\', serif" font-size="46" font-weight="bold">' + letter + '</text>';
    s += '</g>';
    return s;
  }

  /* --------------------------------------------------------------------------
     Component: JokerCard
     16-pointed Indian star mandala with concentric petals, radial rays,
     vertical JOKER lettering on left and mirrored right, star symbols at corners.
     Two distinct cards: Charcoal (id 52, 106) and Deep Burgundy (id 53, 107).
     -------------------------------------------------------------------------- */
  function JokerCard(id, color) {
    var col = color || (id % 2 === 1 ? CONFIG.colors.burgundy : CONFIG.colors.charcoal);

    var s = '<g fill="none" stroke="' + col + '" stroke-width="0.9">';
    // Concentric central rings
    s += '<circle cx="50" cy="71" r="3.5" fill="' + col + '"/>';
    s += '<circle cx="50" cy="71" r="6"/>';
    s += '<circle cx="50" cy="71" r="10.5"/>';
    s += '<circle cx="50" cy="71" r="17"/>';
    s += '<circle cx="50" cy="71" r="23"/>';
    s += '<circle cx="50" cy="71" r="30.5"/>';

    // 8 floral circles around center
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var px = 50 + 8.5 * Math.cos(a);
      var py = 71 + 8.5 * Math.sin(a);
      s += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="2.8"/>';
    }

    // 16 inner faceted points
    var dPts = [];
    for (var j = 0; j < 32; j++) {
      var aj = j * Math.PI / 16;
      var rj = (j % 2 === 0) ? 23 : 17;
      dPts.push((50 + rj * Math.cos(aj)).toFixed(1) + ',' + (71 + rj * Math.sin(aj)).toFixed(1));
    }
    s += '<polygon points="' + dPts.join(' ') + '" stroke-width="0.8"/>';

    // 16 large outer star points
    var oPts = [];
    for (var k = 0; k < 32; k++) {
      var ak = k * Math.PI / 16;
      var rk = (k % 2 === 0) ? 33.5 : 23;
      oPts.push((50 + rk * Math.cos(ak)).toFixed(1) + ',' + (71 + rk * Math.sin(ak)).toFixed(1));
    }
    s += '<polygon points="' + oPts.join(' ') + '" stroke-width="1.1"/>';

    // Radial spines
    for (var l = 0; l < 16; l++) {
      var al = l * Math.PI / 8;
      var x1 = (50 + 10.5 * Math.cos(al)).toFixed(1);
      var y1 = (71 + 10.5 * Math.sin(al)).toFixed(1);
      var x2 = (50 + 33.5 * Math.cos(al)).toFixed(1);
      var y2 = (71 + 33.5 * Math.sin(al)).toFixed(1);
      s += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke-width="0.6"/>';
    }
    s += '</g>';
    return s;
  }

  /* --------------------------------------------------------------------------
     Component: CardBack
     Deep emerald green with fine repeating geometric jali texture,
     double antique-gold border with corner brackets, and center lotus mandala.
     -------------------------------------------------------------------------- */
  function CardBack(theme) {
    var bg = (theme === 'burgundy') ? CONFIG.colors.burgundy : ((theme === 'navy') ? '#142542' : CONFIG.colors.emerald);
    var strokeJali = (theme === 'burgundy') ? '#932437' : ((theme === 'navy') ? '#1e3860' : '#165d3a');
    var dotJali = (theme === 'burgundy') ? '#56121f' : ((theme === 'navy') ? '#0c172a' : '#0d3a24');
    var gold = CONFIG.colors.gold;

    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 142" preserveAspectRatio="none">';
    s += '<defs>';
    s += '<pattern id="bk-jali" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">';
    s += '<rect width="8" height="8" fill="' + bg + '"/>';
    s += '<path d="M 0 4 L 4 0 L 8 4 L 4 8 Z" fill="none" stroke="' + strokeJali + '" stroke-width="0.6"/>';
    s += '<circle cx="4" cy="4" r="0.8" fill="' + dotJali + '"/>';
    s += '</pattern>';
    s += '</defs>';

    s += '<rect width="100" height="142" fill="url(#bk-jali)"/>';
    // Double antique-gold border
    s += '<rect x="6.5" y="6.5" width="87" height="129" rx="5" fill="none" stroke="' + gold + '" stroke-width="1.2"/>';
    s += '<rect x="9.5" y="9.5" width="81" height="123" rx="3.5" fill="none" stroke="' + gold + '" stroke-width="0.7"/>';

    // Stepped geometric corner ornaments
    var corners = [
      [9.5, 9.5, 1, 1],
      [90.5, 9.5, -1, 1],
      [9.5, 132.5, 1, -1],
      [90.5, 132.5, -1, -1]
    ];
    corners.forEach(function (c) {
      var cx = c[0], cy = c[1], sx = c[2], sy = c[3];
      s += '<path d="M ' + cx + ' ' + (cy + 6 * sy) + ' L ' + (cx + 6 * sx) + ' ' + cy + '" fill="none" stroke="' + gold + '" stroke-width="0.9"/>';
      s += '<circle cx="' + (cx + 3 * sx) + '" cy="' + (cy + 3 * sy) + '" r="1" fill="' + gold + '"/>';
    });

    // Center Indian geometric lotus / floral mandala in antique gold
    s += '<g transform="translate(50 71)" stroke="' + gold + '" fill="none">';
    s += '<circle r="2.2" fill="' + gold + '"/>';
    s += '<circle r="4.5" stroke-width="0.7"/>';
    s += '<circle r="8" stroke-width="0.7"/>';
    s += '<circle r="12.5" stroke-width="0.9"/>';

    // 8 lotus petals
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var a1 = (i - 0.35) * Math.PI / 4;
      var a2 = (i + 0.35) * Math.PI / 4;
      var rTip = 12.5, rBase = 4.5;
      var x0 = (rBase * Math.cos(a1)).toFixed(1), y0 = (rBase * Math.sin(a1)).toFixed(1);
      var xt = (rTip * Math.cos(a)).toFixed(1), yt = (rTip * Math.sin(a)).toFixed(1);
      var x1 = (rBase * Math.cos(a2)).toFixed(1), y1 = (rBase * Math.sin(a2)).toFixed(1);
      s += '<path d="M ' + x0 + ' ' + y0 + ' Q ' + (xt * 0.7) + ' ' + (yt * 0.7) + ' ' + xt + ' ' + yt + ' Q ' + (xt * 0.7) + ' ' + (yt * 0.7) + ' ' + x1 + ' ' + y1 + '" stroke-width="0.8"/>';
      s += '<circle cx="' + xt + '" cy="' + yt + '" r="0.7" fill="' + gold + '"/>';
    }
    // 4 corner radiant dots
    for (var d = 0; d < 4; d++) {
      var da = (d + 0.5) * Math.PI / 2;
      var dist = 16.5;
      var dx = (dist * Math.cos(da)).toFixed(1), dy = (dist * Math.sin(da)).toFixed(1);
      s += '<circle cx="' + dx + '" cy="' + dy + '" r="1.2" fill="' + gold + '"/>';
    }
    s += '</g>';

    s += '</svg>';
    return s;
  }

  /* --------------------------------------------------------------------------
     Component: CardFront
     Selects appropriate artwork (AceCard, NumberCard, FaceCard, or JokerCard)
     -------------------------------------------------------------------------- */
  function CardFront(info) {
    if (info.joker) {
      return JokerCard(info.id || 52);
    }
    if (info.rank === 1) {
      return AceCard(info.suit);
    }
    if (info.rank >= 2 && info.rank <= 10) {
      return NumberCard(info.suit, info.rank);
    }
    return FaceCard(info.suit, info.rank);
  }

  /* --------------------------------------------------------------------------
     Component: PlayingCard
     Renders the complete card element with mirrored corner indices,
     central artwork, interaction classes, and data-card identifier.
     -------------------------------------------------------------------------- */
  function PlayingCard(id, info, o) {
    o = o || {};
    ensureSprite();

    var isJ = !!(info && info.joker);
    var suit = isJ ? 'j' : (info ? info.suit : 0);
    var rank = isJ ? 0 : (info ? info.rank : 1);
    var isRed = isJ ? (id % 2 === 1) : (suit === 1 || suit === 2);
    var isCourt = !isJ && rank >= 11;

    var cls = 'card su' + suit;
    if (isJ) cls += ' joker' + (isRed ? ' red-joker' : ' black-joker');
    if (isRed) cls += ' red';
    if (isCourt) cls += ' court';
    if (o.wild) cls += ' wild';
    if (o.cls) cls += ' ' + o.cls;

    var label = isJ
      ? (isRed ? 'Red Joker' : 'Black Joker')
      : (CONFIG.ranks[rank] + ' of ' + (CONFIG.suits[suit] || ''));

    // Joker card structure (Vertical JOKER text on sides + corner stars)
    if (isJ) {
      var vTxt = '<span>J</span><span>O</span><span>K</span><span>E</span><span>R</span>';
      return '<div class="' + cls + '" data-card="' + id + '" role="img" aria-label="' + label + '">' +
        '<span class="joker-star tr">★</span>' +
        '<span class="joker-star bl">★</span>' +
        '<span class="joker-vtxt left">' + vTxt + '</span>' +
        '<span class="joker-vtxt right">' + vTxt + '</span>' +
        '<svg class="art" viewBox="0 0 100 142" preserveAspectRatio="xMidYMid meet">' +
        JokerCard(id, isRed ? CONFIG.colors.burgundy : CONFIG.colors.charcoal) +
        '</svg>' +
        '</div>';
    }

    // Natural card structure (Rank + suit top-left and mirrored bottom-right)
    var idx = '<b>' + CONFIG.ranks[rank] + '</b><svg class="ci" viewBox="0 0 24 24"><use href="#rk-s' + suit + '"/></svg>';
    return '<div class="' + cls + '" data-card="' + id + '" role="img" aria-label="' + label + '">' +
      '<span class="tl">' + idx + '</span>' +
      '<span class="br">' + idx + '</span>' +
      '<svg class="art" viewBox="0 0 100 142" preserveAspectRatio="xMidYMid meet">' +
      CardFront(info) +
      '</svg>' +
      '</div>';
  }

  /* --------------------------------------------------------------------------
     Component: CardDeck
     Renders all 54 cards (52 standard + 2 distinct Jokers) + CardBack
     -------------------------------------------------------------------------- */
  function CardDeck() {
    var cards = [];
    // 4 suits x 13 ranks
    for (var s = 0; s < 4; s++) {
      for (var r = 1; r <= 13; r++) {
        var id = s * 13 + (r - 1);
        cards.push(PlayingCard(id, { id: id, joker: false, suit: s, rank: r }, {}));
      }
    }
    // 2 Jokers: Charcoal (52) and Burgundy (53)
    cards.push(PlayingCard(52, { id: 52, joker: true, suit: -1, rank: 0 }, {}));
    cards.push(PlayingCard(53, { id: 53, joker: true, suit: -1, rank: 0 }, {}));
    return cards;
  }

  function setBack(theme) {
    if (!root.document) return;
    root.document.documentElement.style.setProperty(
      '--back-img',
      'url("data:image/svg+xml,' + encodeURIComponent(CardBack(theme)) + '")'
    );
  }

  function setDeck(style) {
    if (root.document) {
      root.document.documentElement.setAttribute('data-deck', style === 'four' ? 'four' : 'classic');
    }
  }

  /* Export RummyCards namespace */
  root.RummyCards = {
    CONFIG: CONFIG,
    PlayingCard: PlayingCard,
    CardFront: CardFront,
    CardBack: CardBack,
    NumberCard: NumberCard,
    AceCard: AceCard,
    FaceCard: FaceCard,
    JokerCard: JokerCard,
    CardDeck: CardDeck,
    cardHTML: PlayingCard,
    setBack: setBack,
    setDeck: setDeck,
    backSVG: CardBack
  };

})(typeof window !== 'undefined' ? window : globalThis);
