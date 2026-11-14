/* Indian Rummy rules engine: pure functions, shared by the page and the Node tests. */
(function (root) {
  'use strict';

  var SUIT_SYM = ['♠', '♥', '♦', '♣']; // spade heart diamond club
  var RANK_LBL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  var TOTAL_CARDS = 108; // two decks, each with two printed jokers

  function mkInfo(id) {
    var k = id % 54;
    if (k >= 52) return { id: id, joker: true, suit: -1, rank: 0 };
    return { id: id, joker: false, suit: Math.floor(k / 13), rank: (k % 13) + 1 };
  }
  var INFO = [];
  for (var i = 0; i < TOTAL_CARDS; i++) INFO.push(mkInfo(i));

  function pts(id, wild) {
    var c = INFO[id];
    if (c.joker || c.rank === wild) return 0;
    return c.rank === 1 || c.rank >= 10 ? 10 : c.rank;
  }

  function pc(m) { var n = 0; while (m) { m &= m - 1; n++; } return n; }
  function ctz(m) { return 31 - Math.clz32(m & -m); }

  /* ---------- group classification ---------- */
  function seqOK(cs, isJ) {
    var L = cs.length;
    if (L < 3 || L > 13) return false;
    var nat = [], k;
    for (k = 0; k < L; k++) if (!isJ(cs[k])) nat.push(cs[k]);
    if (!nat.length) return false;
    var suit = nat[0].suit, seen = {};
    for (k = 0; k < nat.length; k++) {
      if (nat[k].suit !== suit) return false;
      if (seen[nat[k].rank]) return false;
      seen[nat[k].rank] = 1;
    }
    for (var hi = 0; hi < 2; hi++) {
      var mn = 99, mx = -1;
      for (k = 0; k < nat.length; k++) {
        var v = hi && nat[k].rank === 1 ? 14 : nat[k].rank;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      var lo = hi ? 2 : 1, up = hi ? 14 : 13;
      var s = Math.max(lo, mx - L + 1);
      if (s <= mn && s + L - 1 <= up) return true;
    }
    return false;
  }

  function setOK(cs, isJ) {
    var L = cs.length;
    if (L < 3 || L > 4) return false;
    var rank = -1, suits = {}, natN = 0;
    for (var k = 0; k < L; k++) {
      if (isJ(cs[k])) continue;
      natN++;
      if (rank === -1) rank = cs[k].rank;
      else if (cs[k].rank !== rank) return false;
      if (suits[cs[k].suit]) return false;
      suits[cs[k].suit] = 1;
    }
    return natN >= 1;
  }

  /* 0 invalid, 1 set, 2 sequence with joker, 3 pure sequence */
  function classify(ids, wild) {
    var L = ids.length;
    if (L < 3) return 0;
    var cs = new Array(L), anyPrinted = false;
    for (var k = 0; k < L; k++) { cs[k] = INFO[ids[k]]; if (cs[k].joker) anyPrinted = true; }
    var printed = function (c) { return c.joker; };
    var wildish = function (c) { return c.joker || (wild > 0 && c.rank === wild); };
    if (!anyPrinted && seqOK(cs, function () { return false; })) return 3;
    if (seqOK(cs, printed) || seqOK(cs, wildish)) return 2;
    if (setOK(cs, printed) || setOK(cs, wildish)) return 1;
    return 0;
  }

  /* ---------- optimal arrangement solver ---------- */
  function analyze(hand, wild) {
    var n = hand.length, full = 1 << n, vals = [], byLow = [], k;
    for (k = 0; k < n; k++) { vals.push(pts(hand[k], wild)); byLow.push([]); }
    for (var m = 7; m < full; m++) {
      var c = pc(m);
      if (c < 3 || c > 13) continue;
      var ids = [];
      for (k = 0; k < n; k++) if ((m >> k) & 1) ids.push(hand[k]);
      var t = classify(ids, wild);
      if (t) byLow[ctz(m)].push({ m: m, t: t });
    }
    return { hand: hand, wild: wild, n: n, vals: vals, byLow: byLow };
  }

  function best(A, rem, req) {
    var memo = new Map();
    function f(r, p, s) {
      if (r === 0) return { c: !req || (p && s >= 2) ? 0 : Infinity, g: null };
      var key = r * 8 + p * 3 + s;
      var hit = memo.get(key);
      if (hit) return hit;
      var b = ctz(r);
      var bestC = A.vals[b] + 0.001 + f(r ^ (1 << b), p, s).c, ch = null;
      var list = A.byLow[b];
      for (var q = 0; q < list.length; q++) {
        var g = list[q];
        if ((g.m & r) !== g.m) continue;
        var np = p || g.t === 3 ? 1 : 0;
        var ns = s + (g.t >= 2 ? 1 : 0);
        if (ns > 2) ns = 2;
        var c = f(r ^ g.m, np, ns).c;
        if (c < bestC) { bestC = c; ch = g; }
      }
      var res = { c: bestC, g: ch, b: b };
      memo.set(key, res);
      return res;
    }
    var top = f(rem, 0, 0);
    if (top.c === Infinity) return { cost: Infinity, groups: [], leftover: [] };
    var groups = [], leftover = [], r = rem, p = 0, s = 0;
    while (r) {
      var node = f(r, p, s), bit = ctz(r);
      if (node.g) {
        var ids = [];
        for (var k = 0; k < A.n; k++) if ((node.g.m >> k) & 1) ids.push(A.hand[k]);
        groups.push({ ids: ids, type: node.g.t });
        if (node.g.t === 3) p = 1;
        if (node.g.t >= 2) s = Math.min(2, s + 1);
        r ^= node.g.m;
      } else {
        leftover.push(A.hand[bit]);
        r ^= 1 << bit;
      }
    }
    return { cost: top.c, groups: groups, leftover: leftover };
  }

  /* Best arrangement of a 13-card hand. */
  function solve(hand, wild) {
    var A = analyze(hand, wild), full = (1 << A.n) - 1;
    var r = best(A, full, true);
    if (r.cost !== Infinity) {
      return { feasible: true, valid: r.cost === 0, penalty: Math.min(80, Math.floor(r.cost)), groups: r.groups, leftover: r.leftover };
    }
    var r2 = best(A, full, false), total = 0;
    for (var k = 0; k < A.n; k++) total += A.vals[k];
    return { feasible: false, valid: false, penalty: Math.min(80, total), groups: r2.groups, leftover: r2.leftover };
  }

  /* For a 14-card hand: result of discarding each card. */
  function evalDiscards(hand, wild) {
    var A = analyze(hand, wild), full = (1 << A.n) - 1, out = [];
    for (var d = 0; d < A.n; d++) {
      var rem = full ^ (1 << d);
      var s = best(A, rem, true);
      var feasible = s.cost !== Infinity;
      var relaxed = feasible ? s.cost : best(A, rem, false).cost;
      out.push({ id: hand[d], feasible: feasible, valid: feasible && s.cost === 0, cost: feasible ? Math.floor(s.cost) : Math.floor(relaxed), relaxed: Math.floor(relaxed) });
    }
    return out;
  }

  /* ---------- state helpers ---------- */
  function rndInt(n) {
    var g = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (g && g.getRandomValues) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n, x;
      do { g.getRandomValues(a); x = a[0]; } while (x >= lim);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = rndInt(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var MODES = {
    points: { label: 'Points Rummy', limit: 0, blurb: 'Play as many deals as you like. Lowest running total leads.' },
    pool101: { label: 'Pool 101', limit: 101, blurb: 'Reach 101 points and you are out. Last player standing wins.' },
    pool201: { label: 'Pool 201', limit: 201, blurb: 'Reach 201 points and you are out. Last player standing wins.' }
  };

  function activeList(S) {
    return S.order.filter(function (u) { return S.status[u] === 'active'; });
  }

  function newDeal(opts) {
    var order = opts.order.slice(), n = order.length;
    var deck = [], i;
    for (i = 0; i < TOTAL_CARDS; i++) deck.push(i);
    shuffle(deck);
    var hands = {}, status = {}, draws = {}, dropPts = {};
    order.forEach(function (u) { hands[u] = []; status[u] = 'active'; draws[u] = 0; dropPts[u] = 0; });
    for (i = 0; i < 13; i++) order.forEach(function (u) { hands[u].push(deck.pop()); });
    var open = deck.pop(), cut = deck.pop();
    var wild = INFO[cut].joker ? 1 : INFO[cut].rank;
    var mode = opts.mode || 'points';
    return {
      v: 1, round: opts.round, mode: mode, limit: MODES[mode].limit,
      phase: 'play', order: order, turn: order[opts.round % n], stage: 'draw', turnN: 0,
      stock: deck, discard: [open], cut: cut, wild: wild,
      hands: hands, status: status, draws: draws, dropPts: dropPts,
      baseTotals: opts.baseTotals || {}, declarer: null, finish: null,
      pickup: null, last: null, log: [], startedAt: opts.now || 0, turnAt: opts.now || 0, result: null
    };
  }

  function nextActive(S, from) {
    var n = S.order.length, idx = S.order.indexOf(from);
    for (var k = 1; k <= n; k++) {
      var u = S.order[(idx + k) % n];
      if (S.status[u] === 'active') return u;
    }
    return from;
  }

  function pushLog(S, entry) {
    S.last = entry;
    S.log.push(entry);
    if (S.log.length > 8) S.log.shift();
  }

  function refillStock(S) {
    if (S.stock.length) return;
    if (S.discard.length <= 1) throw new Error('No cards left to draw.');
    var top = S.discard.pop();
    S.stock = shuffle(S.discard.slice());
    S.discard = [top];
  }

  function endRound(S, winner, groupsOverride) {
    var points = {}, groups = {}, totals = clone(S.baseTotals || {});
    S.order.forEach(function (u) {
      if (u === winner) {
        points[u] = 0;
        var w = groupsOverride || solve(S.hands[u], S.wild);
        groups[u] = { groups: (w.groups || []).map(function (g) { return g.ids; }), leftover: w.leftover || [] };
      } else if (S.status[u] === 'dropped') {
        points[u] = S.dropPts[u];
        groups[u] = null;
      } else {
        var r = solve(S.hands[u], S.wild);
        points[u] = r.penalty;
        groups[u] = { groups: r.groups.map(function (g) { return g.ids; }), leftover: r.leftover };
      }
      totals[u] = (totals[u] || 0) + points[u];
    });
    var limit = S.limit || 0, elim = [], gameOver = false, champion = null;
    if (limit) {
      Object.keys(totals).forEach(function (u) { if (totals[u] >= limit) elim.push(u); });
      var alive = Object.keys(totals).filter(function (u) { return totals[u] < limit; });
      if (alive.length <= 1) {
        gameOver = true;
        if (alive.length === 1) champion = alive[0];
        else {
          champion = Object.keys(totals).sort(function (a, b) { return totals[a] - totals[b]; })[0];
        }
      }
    }
    S.phase = 'ended';
    S.result = { winner: winner, points: points, totals: totals, groups: groups, elim: elim, gameOver: gameOver, champion: champion };
    return S;
  }

  function endRoundWithWrong(S, winner, wrongDeclarer, penalty) {
    var points = {}, groups = {}, totals = clone(S.baseTotals || {});
    S.order.forEach(function (u) {
      if (u === wrongDeclarer) {
        points[u] = penalty;
        var r = solve(S.hands[u] || [], S.wild);
        groups[u] = { groups: r.groups.map(function (g) { return g.ids; }), leftover: r.leftover };
      } else if (u === winner) {
        points[u] = 0;
        var w = solve(S.hands[u] || [], S.wild);
        groups[u] = { groups: (w.groups || []).map(function (g) { return g.ids; }), leftover: w.leftover || [] };
      } else if (S.status[u] === 'dropped') {
        points[u] = S.dropPts[u];
        groups[u] = null;
      } else {
        var r2 = solve(S.hands[u] || [], S.wild);
        points[u] = r2.penalty;
        groups[u] = { groups: r2.groups.map(function (g) { return g.ids; }), leftover: r2.leftover };
      }
      totals[u] = (totals[u] || 0) + points[u];
    });
    var limit = S.limit || 0, elim = [], gameOver = false, champion = null;
    if (limit) {
      Object.keys(totals).forEach(function (u) { if (totals[u] >= limit) elim.push(u); });
      var alive = Object.keys(totals).filter(function (u) { return totals[u] < limit; });
      if (alive.length <= 1) {
        gameOver = true;
        if (alive.length === 1) champion = alive[0];
        else {
          champion = Object.keys(totals).sort(function (a, b) { return totals[a] - totals[b]; })[0];
        }
      }
    }
    S.phase = 'ended';
    S.result = { winner: winner, wrongDeclarer: wrongDeclarer, points: points, totals: totals, groups: groups, elim: elim, gameOver: gameOver, champion: champion };
    return S;
  }

  function checkLastStanding(S) {
    var act = activeList(S);
    if (act.length === 1) endRound(S, act[0], null);
  }

  /* Apply one player action; returns the next state or throws. */
  function apply(state, act, now) {
    var S = clone(state), u = act.uid;
    if (S.phase !== 'play') throw new Error('This deal is over.');
    var hand = S.hands[u];
    now = now || 0;

    if (act.type === 'auto') {
      if (S.status[u] !== 'active' || S.turn !== u) throw new Error('Not this player\'s turn.');
      var prev = (S.misses && S.misses[u]) || 0;
      if (prev + 1 >= 2) return apply(S, { type: 'kick', uid: u }, now);
      var T = S;
      if (T.stage === 'draw') T = apply(T, { type: 'drawStock', uid: u }, now);
      var mv = botMove(T, u);
      T = apply(T, { type: 'discard', card: mv.card, uid: u }, now);
      T.misses = T.misses || {};
      T.misses[u] = prev + 1;
      return T;
    }

    if (act.type === 'kick') {
      if (S.status[u] !== 'active') throw new Error('Player is not active.');
      var wasTurn = S.turn === u;
      S.status[u] = 'dropped';
      S.dropPts[u] = S.draws[u] === 0 ? 20 : 40;
      S.discard = hand.concat(S.discard);
      S.hands[u] = [];
      pushLog(S, { u: u, a: 'kick' });
      checkLastStanding(S);
      if (S.phase === 'play' && wasTurn) { S.turn = nextActive(S, u); S.stage = 'draw'; S.turnN++; S.turnAt = now; }
      return S;
    }

    if (S.status[u] !== 'active') throw new Error('You are out of this deal.');
    if (S.turn !== u) throw new Error('It is not your turn.');
    if (S.misses) S.misses[u] = 0;

    if (act.type === 'drawStock' || act.type === 'drawDiscard') {
      if (S.stage !== 'draw') throw new Error('You have already drawn.');
      var card;
      if (act.type === 'drawStock') { refillStock(S); card = S.stock.pop(); }
      else {
        var topC = S.discard[S.discard.length - 1];
        if (topC === undefined) throw new Error('Discard pile is empty.');
        if (INFO[topC].joker || INFO[topC].rank === S.wild) throw new Error('Jokers cannot be taken from the discard pile.');
        card = S.discard.pop();
      }
      S.pickup = act.type === 'drawDiscard' ? card : null;
      hand.push(card);
      S.draws[u]++;
      S.stage = 'discard';
      pushLog(S, { u: u, a: act.type === 'drawStock' ? 'stock' : 'pickup', c: act.type === 'drawStock' ? null : card });
      return S;
    }

    if (act.type === 'drop') {
      if (S.stage !== 'draw') throw new Error('You can only drop before drawing.');
      S.status[u] = 'dropped';
      S.dropPts[u] = S.draws[u] === 0 ? 20 : 40;
      S.discard = hand.concat(S.discard);
      S.hands[u] = [];
      S.pickup = null;
      pushLog(S, { u: u, a: 'drop' });
      checkLastStanding(S);
      if (S.phase === 'play') { S.turn = nextActive(S, u); S.stage = 'draw'; S.turnN++; S.turnAt = now; }
      return S;
    }

    if (act.type === 'discard') {
      if (S.stage !== 'discard') throw new Error('Draw a card first.');
      var ix = hand.indexOf(act.card);
      if (ix < 0) throw new Error('That card is not in your hand.');
      if (S.pickup === act.card) throw new Error('You cannot discard the card you just picked up.');
      S.pickup = null;
      hand.splice(ix, 1);
      S.discard.push(act.card);
      pushLog(S, { u: u, a: 'discard', c: act.card });
      S.turn = nextActive(S, u); S.stage = 'draw'; S.turnN++; S.turnAt = now;
      return S;
    }

    if (act.type === 'leave') {
      if (S.status[u] !== 'active') return S;
      var wasTurn = S.turn === u;
      S.status[u] = 'dropped';
      S.dropPts[u] = S.draws[u] === 0 ? 20 : 40;
      S.discard = (hand || []).concat(S.discard);
      S.hands[u] = [];
      S.pickup = null;
      pushLog(S, { u: u, a: 'leave' });
      checkLastStanding(S);
      if (S.phase === 'play' && wasTurn) {
        S.turn = nextActive(S, u);
        S.stage = 'draw';
        S.turnN++;
        S.turnAt = now;
      }
      return S;
    }

    if (act.type === 'declare') {
      if (S.stage !== 'discard') throw new Error('Draw a card first.');
      var ix2 = hand.indexOf(act.card);
      if (ix2 < 0) throw new Error('That card is not in your hand.');
      var rest = hand.slice(); rest.splice(ix2, 1);
      var r = solve(rest, S.wild);
      S.finish = act.card;
      S.declarer = u;

      if (r.valid) {
        S.hands[u] = rest;
        S.wrongDeclaration = null;
        pushLog(S, { u: u, a: 'declare', c: act.card });
        return endRound(S, u, r);
      } else {
        // Wrong declaration! 80 points penalty
        S.wrongDeclaration = { uid: u, card: act.card, penalty: 80 };
        pushLog(S, { u: u, a: 'wrong_declare', c: act.card, p: 80 });
        var activeOthers = S.order.filter(function (x) { return x !== u && S.status[x] === 'active'; });
        if (activeOthers.length <= 1) {
          var winner = activeOthers[0] || u;
          return endRoundWithWrong(S, winner, u, 80);
        } else {
          S.status[u] = 'dropped';
          S.dropPts[u] = 80;
          S.discard.push(act.card);
          S.discard = rest.concat(S.discard);
          S.hands[u] = [];
          S.turn = nextActive(S, u);
          S.stage = 'draw';
          S.turnN++;
          S.turnAt = now;
          return S;
        }
      }
    }
    throw new Error('Unknown action.');
  }

  /* ---------- bot ---------- */
  function connectedness(hand, idx) {
    var c = INFO[hand[idx]];
    if (c.joker) return 100;
    var sc = 0;
    for (var j = 0; j < hand.length; j++) {
      if (j === idx) continue;
      var o = INFO[hand[j]];
      if (o.joker) { sc += 1; continue; }
      if (o.rank === c.rank && o.suit !== c.suit) sc += 2;
      if (o.suit === c.suit) {
        var d = Math.abs(o.rank - c.rank);
        if (d === 12) d = 1;
        if (d === 1) sc += 3; else if (d === 2) sc += 2;
      }
    }
    return sc;
  }

  function score(e) { return e.valid ? -1000 : e.relaxed + (e.feasible ? 0 : 22); }

  function botMove(S, u) {
    var hand = S.hands[u];
    if (S.stage === 'draw') {
      if (S.draws[u] > 40) return { type: 'drop' };
      var top = S.discard[S.discard.length - 1];
      if (top === undefined) return { type: 'drawStock' };
      var cur = analyze(hand, S.wild), full = (1 << cur.n) - 1;
      var rs = best(cur, full, true);
      var curScore = rs.cost !== Infinity ? rs.cost : best(cur, full, false).cost + 22;
      var ev = evalDiscards(hand.concat([top]), S.wild), bestS = Infinity, k;
      for (k = 0; k < ev.length; k++) {
        if (ev[k].id === top) continue; // taking a card only to throw it back is pointless
        var sc = score(ev[k]);
        if (sc < bestS) bestS = sc;
      }
      if (INFO[top].joker || INFO[top].rank === S.wild) return { type: 'drawStock' };
      if (bestS < curScore) return { type: 'drawDiscard' };
      return { type: 'drawStock' };
    }
    var evs = evalDiscards(hand, S.wild), k2;
    for (k2 = 0; k2 < evs.length; k2++) if (evs[k2].valid) return { type: 'declare', card: evs[k2].id };
    var pick = -1, pickKey = null;
    for (k2 = 0; k2 < evs.length; k2++) {
      if (evs[k2].id === S.pickup) continue;
      var key = [score(evs[k2]), connectedness(hand, k2), -pts(evs[k2].id, S.wild)];
      if (!pickKey || key[0] < pickKey[0] || (key[0] === pickKey[0] && (key[1] < pickKey[1] || (key[1] === pickKey[1] && key[2] < pickKey[2])))) {
        pick = k2; pickKey = key;
      }
    }
    return { type: 'discard', card: evs[pick].id };
  }

  var API = {
    SUIT_SYM: SUIT_SYM, RANK_LBL: RANK_LBL, INFO: INFO, MODES: MODES,
    pts: pts, classify: classify, analyze: analyze, best: best, solve: solve, evalDiscards: evalDiscards,
    newDeal: newDeal, apply: apply, botMove: botMove, activeList: activeList, shuffle: shuffle, clone: clone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.RummyLogic = API;
})(typeof window !== 'undefined' ? window : globalThis);
