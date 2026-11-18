const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');

const TEST_CONFIGS = [
  { width: 740, height: 270, pCount: 2, label: '740x270 (2 players)' },
  { width: 830, height: 290, pCount: 4, label: '830x290 (4 players, main target)' },
  { width: 830, height: 390, pCount: 6, label: '830x390 (6 players, fullscreen main)' },
  { width: 844, height: 390, pCount: 6, label: '844x390 (6 players)' }
];

async function touchTap(page, selector, desc) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 3000 });
  const box = await loc.boundingBox();
  if (!box) throw new Error(`Bounding box not found for ${selector} (${desc})`);
  // For hand cards with overlapping fan, tap the visible left strip
  const cx = selector.includes('.card') || selector.includes('#hand') 
    ? box.x + Math.min(box.width * 0.35, 14)
    : box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx, cy);
  await page.waitForTimeout(60);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });
  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

  let passedTotal = 0;
  let failedTotal = 0;

  for (const cfg of TEST_CONFIGS) {
    console.log(`\n--- Testing Full Flow: ${cfg.label} ---`);
    const page = await browser.newPage({ viewport: { width: cfg.width, height: cfg.height }, hasTouch: true });
    await page.goto(fileUrl);

    // Initialize deal for player count
    await page.evaluate(({ pCount }) => {
      const L = window.RummyLogic;
      const me = window.__RR.me;
      me.uid = 'u_p1';
      me.name = 'Pratik';
      window.__RR.code = 'FLOW';
      window.__RR.room = { code: 'FLOW', hostId: 'u_p1', status: 'playing', mode: 'points', turnSecs: 30 };
      const uids = ['u_p1'];
      const players = { u_p1: { uid: 'u_p1', name: 'Pratik', joinedAt: Date.now() } };
      const botNames = ['Aarav', 'Meera', 'Rohan', 'Kavya', 'Vikram'];
      for (let i = 1; i < pCount; i++) {
        const bUid = 'bot_' + i;
        uids.push(bUid);
        players[bUid] = { uid: bUid, name: botNames[i - 1] + ' (bot)', bot: true };
      }
      window.__RR.players = players;
      const deal = L.newDeal({ order: uids, round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = 'draw';
      deal.turn = 'u_p1';
      deal.startedAt = Date.now() - 5000;
      deal.turnN = 1;
      // Ensure open discard has a non-wild card
      deal.discard = [10]; // 10 is 4 of spades (non-wild)
      deal.wild = 0; // 0 is 2 of spades
      deal.cut = 0;
      window.__RR.S = deal;
      window.__RR.renderRoom();
      window.__RR.fitHand();
    }, { pCount: cfg.pCount });

    await page.waitForTimeout(100);

    // 1. Touch Tap Draw from Stock
    try {
      const stockBefore = await page.evaluate(() => window.__RR.S.stock.length);
      const handBefore = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
      await touchTap(page, '.pile[data-a="stock"]', 'Stock pile');
      const stockAfter = await page.evaluate(() => window.__RR.S.stock.length);
      const handAfter = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
      const stage = await page.evaluate(() => window.__RR.S.stage);
      if (stockAfter === stockBefore - 1 && handAfter === handBefore + 1 && stage === 'discard') {
        console.log('  [PASS] 1. Draw from Stock by touch');
        passedTotal++;
      } else {
        throw new Error(`Stock draw mismatch: handBefore=${handBefore}, handAfter=${handAfter}, stage=${stage}`);
      }
    } catch (e) {
      console.log('  [FAIL] 1. Draw from Stock:', e.message);
      failedTotal++;
    }

    // Wait for card flight animation into hand to complete
    await page.waitForTimeout(500);

    // 2. Touch Tap Hand Card Selection
    let selCardId = null;
    try {
      const cardEl = page.locator('#hand .card').first();
      selCardId = +(await cardEl.getAttribute('data-card'));
      await touchTap(page, `#hand [data-card="${selCardId}"]`, 'First hand card');
      const isSel = await page.evaluate((id) => !!window.__RR.sel[id], selCardId);
      if (isSel) {
        console.log(`  [PASS] 2. Touch Tap Card Selection (card ${selCardId})`);
        passedTotal++;
      } else {
        throw new Error(`Card ${selCardId} not selected in sel state`);
      }
    } catch (e) {
      console.log('  [FAIL] 2. Hand Card Selection:', e.message);
      failedTotal++;
    }

    // 3. Touch Tap Discard Button
    try {
      const handBefore = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
      await touchTap(page, 'button[data-a="discard"]', 'Discard button');
      const handAfter = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
      const lastDiscard = await page.evaluate(() => window.__RR.S.discard[window.__RR.S.discard.length - 1]);
      if (handAfter === handBefore - 1 && lastDiscard === selCardId) {
        console.log(`  [PASS] 3. Touch Tap Discard (discarded card ${selCardId})`);
        passedTotal++;
      } else {
        throw new Error(`Discard failed: handBefore=${handBefore}, handAfter=${handAfter}, lastDiscard=${lastDiscard}`);
      }
    } catch (e) {
      console.log('  [FAIL] 3. Discard Button:', e.message);
      failedTotal++;
    }

    // Reset turn to draw for next actions
    await page.evaluate(() => {
      window.__RR.S.turn = 'u_p1';
      window.__RR.S.stage = 'draw';
      window.__RR.S.discard = [18]; // 6 of clubs, non-wild
      window.__RR.renderRoom();
      window.__RR.fitHand();
    });
    await page.waitForTimeout(60);

    // 4. Touch Tap Draw from Open Pile
    try {
      const openCardBefore = await page.evaluate(() => window.__RR.S.discard[window.__RR.S.discard.length - 1]);
      await touchTap(page, '.pile[data-a="pickup"]', 'Open discard pile');
      const handCards = await page.evaluate(() => window.__RR.S.hands['u_p1']);
      const stage = await page.evaluate(() => window.__RR.S.stage);
      if (handCards.includes(openCardBefore) && stage === 'discard') {
        console.log(`  [PASS] 4. Touch Tap Open Pile Pickup (card ${openCardBefore})`);
        passedTotal++;
      } else {
        throw new Error(`Open pickup failed: stage=${stage}, hasCard=${handCards.includes(openCardBefore)}`);
      }
    } catch (e) {
      console.log('  [FAIL] 4. Open Pile Pickup:', e.message);
      failedTotal++;
    }

    // 5. Touch Tap Auto Button (auto groups hand)
    try {
      await touchTap(page, 'button[data-a="auto"]', 'Auto button');
      await page.waitForTimeout(100);
      console.log('  [PASS] 5. Touch Tap Auto Button');
      passedTotal++;
    } catch (e) {
      console.log('  [FAIL] 5. Auto Button:', e.message);
      failedTotal++;
    }

    // 6. Touch Tap Sort Button
    try {
      await page.waitForSelector('button[data-a="sort"]', { state: 'visible', timeout: 3000 });
      await touchTap(page, 'button[data-a="sort"]', 'Sort button');
      await page.waitForTimeout(60);
      console.log('  [PASS] 6. Touch Tap Sort Button');
      passedTotal++;
    } catch (e) {
      console.log('  [FAIL] 6. Sort Button:', e.message);
      failedTotal++;
    }

    // 7. Touch Tap Group Button
    try {
      // Select two cards in hand
      const cards = await page.evaluate(() => {
        const nodes = document.querySelectorAll('#hand .card');
        return [nodes[0].dataset.card, nodes[1].dataset.card];
      });
      await touchTap(page, `#hand [data-card="${cards[0]}"]`, 'Card 1');
      await touchTap(page, `#hand [data-card="${cards[1]}"]`, 'Card 2');
      await touchTap(page, 'button[data-a="group"]', 'Group button');
      await page.waitForTimeout(60);
      console.log('  [PASS] 7. Touch Tap Group Button');
      passedTotal++;
    } catch (e) {
      console.log('  [FAIL] 7. Group Button:', e.message);
      failedTotal++;
    }

    // 8. Touch Tap Finish Slot / Declare Flow
    try {
      // Ensure dealUntil has passed
      await page.evaluate(() => {
        window.__RR.S.stage = 'discard';
        window.__RR.S.turn = 'u_p1';
        window.__RR.dealUntil = 0;
        window.__RR.renderRoom();
        window.__RR.fitHand();
      });
      await page.waitForTimeout(60);
      const lastCardId = await page.evaluate(() => {
        const nodes = document.querySelectorAll('#hand .card');
        return nodes[nodes.length - 1].dataset.card;
      });
      await touchTap(page, `#hand [data-card="${lastCardId}"]`, 'Finish discard card');
      await touchTap(page, '.finish-pile[data-a="finish"]', 'Finish slot');
      await page.waitForTimeout(100);
      const modalOpen = await page.evaluate(() => {
        const m = document.querySelector('.modal');
        const txt = m ? m.innerText.toLowerCase() : '';
        return !!m && (txt.includes('declaration') || txt.includes('invalid hand'));
      });
      if (modalOpen) {
        console.log('  [PASS] 8. Touch Tap Finish Slot opened Declaration Modal');
        passedTotal++;
        // Dismiss modal via touch tap on Keep Playing button
        await touchTap(page, '.modal [data-a="cancelwrong"]', 'Keep Playing');
        await page.waitForTimeout(100);
        // Ensure modal state is cleanly cleared
        await page.evaluate(() => {
          window.__RR.confirmWrongDeclareCard = null;
          window.__RR.renderRoom();
        });
        await page.waitForTimeout(60);
      } else {
        throw new Error('Declaration modal did not open on finish slot tap');
      }
    } catch (e) {
      console.log('  [FAIL] 8. Finish Slot / Declare:', e.message);
      failedTotal++;
    }

    // 9. Touch Tap Drop out of deal (requires confirmation tap)
    try {
      // Reset to stage draw to allow drop
      await page.evaluate(() => {
        window.__RR.confirmWrongDeclareCard = null;
        window.__RR.S.stage = 'draw';
        window.__RR.S.turn = 'u_p1';
        window.__RR.dealUntil = 0;
        window.__RR.renderRoom();
      });
      await page.waitForTimeout(60);
      // First tap prompts confirmation ("Confirm")
      await touchTap(page, 'button[data-a="drop"]', 'Drop button tap 1');
      await page.waitForTimeout(100);
      // Second tap confirms the drop
      await touchTap(page, 'button[data-a="drop"]', 'Drop button tap 2 (confirm)');
      await page.waitForTimeout(100);
      const pStatus = await page.evaluate(() => window.__RR.S.status['u_p1']);
      if (pStatus === 'dropped') {
        console.log('  [PASS] 9. Touch Tap Drop out of deal');
        passedTotal++;
      } else {
        throw new Error(`Player status after drop is ${pStatus}, expected 'dropped'`);
      }
    } catch (e) {
      console.log('  [FAIL] 9. Drop Button:', e.message);
      failedTotal++;
    }

    await page.close();
  }

  console.log(`\n========================================`);
  console.log(`       FULL FLOW VERIFICATION SUMMARY    `);
  console.log(`========================================`);
  console.log(`Passed: ${passedTotal}`);
  console.log(`Failed: ${failedTotal}`);
  console.log(`Pass Rate: ${Math.round((passedTotal / (passedTotal + failedTotal)) * 100)}%`);

  await browser.close();
})();
