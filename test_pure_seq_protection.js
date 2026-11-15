const L = require('./logic.js');

function show(id) {
  const c = L.INFO[id];
  return c.joker ? `PJ(${id})` : `${L.RANK_LBL[c.rank]}${L.SUIT_SYM[c.suit]}(${id})`;
}
function showList(ids) { return ids.map(show).join(' '); }

let passed = 0;
let total = 4;

console.log('====================================================');
console.log('TEST SUITE: PURE SEQUENCE PROTECTION IN SCORING');
console.log('====================================================\n');

// Test 1: pure A,2,3 of spades + sets of 4s, 7s, 9s + a loose 2 of clubs, wild = Q
// Cards: AS(0), 2S(1), 3S(2); 4H(16), 4D(29), 4C(42); 7S(6), 7H(19), 7D(32); 9S(8), 9H(21), 9D(34); 2C(40)
{
  const hand = [0, 1, 2, 16, 29, 42, 6, 19, 32, 8, 21, 34, 40];
  const s = L.solve(hand, 12);
  const totalRaw = hand.reduce((acc, id) => acc + L.pts(id, 12), 0);
  const pureVal = [0, 1, 2].reduce((acc, id) => acc + L.pts(id, 12), 0);
  console.log('Test 1: Pure A,2,3 of spades + sets of 4s, 7s, 9s + loose 2 of clubs (Wild = Q):');
  console.log(`  Cards: ${showList(hand)}`);
  console.log(`  Total raw points: ${totalRaw}, Protected pure points: ${pureVal}`);
  console.log(`  Engine returned: penalty = ${s.penalty}, valid = ${s.valid}, feasible = ${s.feasible}`);
  console.log(`  Groups:`, s.groups.map(g => ({ cards: showList(g.ids), type: g.type })));
  console.log(`  Leftover: ${showList(s.leftover)}`);

  if (s.penalty === 62 && s.valid === false && s.feasible === false && s.groups.length === 1 && s.groups[0].type === 3) {
    console.log('  -> [PASS] Test 1: Correctly protected pure sequence (15 pts), charged 62 pts penalty.\n');
    passed++;
  } else {
    console.log('  -> [FAIL] Test 1: Expected penalty 62, valid false.\n');
  }
}

// Test 2: The same cards with the pure sequence replaced by a set of Ks (no pure sequence anywhere)
// Replace AS(0), 2S(1), 3S(2) with KS(12), KH(25), KD(38)
{
  const hand = [12, 25, 38, 16, 29, 42, 6, 19, 32, 8, 21, 34, 40];
  const s = L.solve(hand, 12);
  const totalRaw = hand.reduce((acc, id) => acc + L.pts(id, 12), 0);
  const expectedPenalty = Math.min(80, totalRaw);
  console.log('Test 2: Pure sequence replaced by set of Ks (no pure sequence anywhere):');
  console.log(`  Cards: ${showList(hand)}`);
  console.log(`  Total raw points: ${totalRaw}, Expected penalty: min(80, ${totalRaw}) = ${expectedPenalty}`);
  console.log(`  Engine returned: penalty = ${s.penalty}, valid = ${s.valid}, feasible = ${s.feasible}`);

  if (s.penalty === expectedPenalty && s.valid === false && s.feasible === false) {
    console.log(`  -> [PASS] Test 2: Correctly counted full hand capped at 80 pts (${s.penalty}).\n`);
    passed++;
  } else {
    console.log(`  -> [FAIL] Test 2: Expected penalty ${expectedPenalty}, got ${s.penalty}.\n`);
  }
}

// Test 3: Case n still returns 33
// Pure seq: AH 2H 3H 4H 5H (13, 14, 15, 16, 17) -> 0 pts
// Second seq: 8C 9C PJ (46, 47, 52) -> 0 pts
// Loose cards: KD(38, 10pts), KC(51, 10pts), 5S(4, 5pts), 6S(5, 6pts), 2D(27, 2pts) -> 33 pts
{
  const hand = [13, 14, 15, 16, 17, 46, 47, 52, 38, 51, 4, 5, 27];
  const s = L.solve(hand, 12);
  console.log('Test 3: Case n (pure + second sequence + loose cards):');
  console.log(`  Cards: ${showList(hand)}`);
  console.log(`  Engine returned: penalty = ${s.penalty}, valid = ${s.valid}, feasible = ${s.feasible}`);

  if (s.penalty === 33 && s.valid === false && s.feasible === true) {
    console.log('  -> [PASS] Test 3: Case n still returns 33.\n');
    passed++;
  } else {
    console.log(`  -> [FAIL] Test 3: Expected penalty 33, feasible true, got penalty ${s.penalty}, feasible ${s.feasible}.\n`);
  }
}

// Test 4: Winner's hand still scores 0
// 1 pure seq + 1 impure seq + 2 sets
{
  const hand = [13, 14, 15, 16, 19, 20, 52, 10, 23, 36, 12, 25, 38];
  const s = L.solve(hand, 12);
  console.log('Test 4: Winning hand (1 pure + 1 impure + 2 sets):');
  console.log(`  Cards: ${showList(hand)}`);
  console.log(`  Engine returned: penalty = ${s.penalty}, valid = ${s.valid}, feasible = ${s.feasible}`);

  if (s.penalty === 0 && s.valid === true && s.feasible === true) {
    console.log('  -> [PASS] Test 4: Winner hand still scores 0.\n');
    passed++;
  } else {
    console.log(`  -> [FAIL] Test 4: Expected penalty 0, valid true, got penalty ${s.penalty}, valid ${s.valid}.\n`);
  }
}

console.log(`Summary: ${passed} / ${total} tests passed (${Math.round((passed / total) * 100)}%).`);
if (passed !== total) process.exit(1);
