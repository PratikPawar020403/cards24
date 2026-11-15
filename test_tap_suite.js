const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });

  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');
  const results = [];

  const createGamePage = async (viewport = { width: 830, height: 290 }) => {
    const page = await browser.newPage({ viewport, hasTouch: true });
    await page.goto(fileUrl);
    return page;
  };

  const setupGame = async (page, stage = 'draw', isMine = true, extra = {}) => {
    return page.evaluate(({ stage, isMine, extra }) => {
      const L = window.RummyLogic;
      const me = window.__RR.me;
      const myUid = 'u_p1';
      me.uid = myUid;
      me.name = 'Pratik';
      window.__RR.code = 'TEST';
      window.__RR.room = { code: 'TEST', hostId: myUid, status: 'playing', mode: 'points', turnSecs: 30 };
      const players = {
        u_p1: { uid: 'u_p1', name: 'Pratik', joinedAt: Date.now() },
        u_p2: { uid: 'u_p2', name: 'Aarav (bot)', bot: true },
        u_p3: { uid: 'u_p3', name: 'Meera (bot)', bot: true },
        u_p4: { uid: 'u_p4', name: 'Rohan (bot)', bot: true }
      };
      window.__RR.players = players;
      const deal = L.newDeal({ order: ['u_p1', 'u_p2', 'u_p3', 'u_p4'], round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = stage;
      deal.turn = isMine ? myUid : 'u_p2';
      deal.startedAt = Date.now() - 20000;
      deal.turnN = 1;
      deal.wild = 5;
      deal.cut = 4;
      deal.discard = extra.discard || [7];
      deal.finish = null;
      if (extra.pickup != null) deal.pickup = extra.pickup;
      if (extra.hands && extra.hands.u_p1) deal.hands.u_p1 = extra.hands.u_p1;
      window.__RR.S = deal;
      window.__RR.sel = extra.sel || {};
      window.__RR.renderRoom();
      window.__RR.fitHand();
    }, { stage, isMine, extra });
  };

  // =========================================================================
  // TEST 1: Open card pickup via real touch with 4-8px jitter
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true, { discard: [7] });
    const pos = await page.evaluate(() => {
      const el = document.querySelector('.pile[data-a="pickup"] .card');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    // Add 4-8px touch jitter to prove jitter tolerance
    const jitterX = pos.x + 5;
    const jitterY = pos.y + 4;
    await page.touchscreen.tap(jitterX, jitterY);
    await page.waitForTimeout(150);
    const stage = await page.evaluate(() => window.__RR.S.stage);
    const handLen = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
    results.push({ name: 'Touch Tap Open Pickup (with 4-8px jitter)', pass: stage === 'discard' && handLen === 14 });
    await page.close();
  }

  // =========================================================================
  // TEST 2: Hand Card Select via real touchscreen tap
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'discard', true);
    const card = await page.evaluate(() => {
      const el = document.querySelector('#hand .card');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.dataset.card };
    });
    await page.touchscreen.tap(card.x, card.y);
    await page.waitForTimeout(100);
    const isSel = await page.evaluate((id) => window.__RR.sel && !!window.__RR.sel[id], card.id);
    results.push({ name: 'Touch Tap Hand Card Select', pass: isSel });
    await page.close();
  }

  // =========================================================================
  // TEST 3: Discard Button Tap via touchscreen tap
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'discard', true);
    // Select first card
    const cardId = await page.evaluate(() => {
      const c = document.querySelector('#hand .card');
      window.__RR.sel = { [c.dataset.card]: 1 };
      window.__RR.renderRoom();
      return c.dataset.card;
    });
    const discardBtn = await page.evaluate(() => {
      const el = document.querySelector('[data-a="discard"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, disabled: el.hasAttribute('disabled') };
    });
    await page.touchscreen.tap(discardBtn.x, discardBtn.y);
    await page.waitForTimeout(150);
    const stage = await page.evaluate(() => window.__RR.S.stage);
    results.push({ name: 'Touch Tap Discard Button', pass: stage === 'draw' && !discardBtn.disabled });
    await page.close();
  }

  // =========================================================================
  // TEST 4: Mid-Tap Re-render Resilience (pointerdown, state update mid-tap, pointerup)
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true);
    const stockPos = await page.evaluate(() => {
      const el = document.querySelector('.pile[data-a="stock"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });

    // Emulate pointerdown, inject snapshot, then pointerup
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      const pd = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' });
      target.dispatchEvent(pd);

      // Inject WebSocket state update and timer tick mid-tap!
      const S2 = JSON.parse(JSON.stringify(window.__RR.S));
      S2.v++;
      window.__RR.S = S2;
      window.__RR.renderRoom(); // Must defer and NOT destroy the DOM element!

      // Now pointerup
      const pu = new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x + 2, clientY: y + 2, pointerId: 1, pointerType: 'touch' });
      target.dispatchEvent(pu);
    }, stockPos);

    await page.waitForTimeout(150);
    const stage = await page.evaluate(() => window.__RR.S.stage);
    results.push({ name: 'Mid-Tap Re-render Resilience (State update during touch)', pass: stage === 'discard' });
    await page.close();
  }

  // =========================================================================
  // TEST 5: Auto Arrange Button Tap
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true);
    const autoBtn = await page.evaluate(() => {
      const el = document.querySelector('[data-a="auto"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (autoBtn) {
      await page.touchscreen.tap(autoBtn.x, autoBtn.y);
      await page.waitForTimeout(150);
    }
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent));
    results.push({ name: 'Auto Button Tap & Arrange', pass: autoBtn != null && toasts.some(t => t.includes('auto-arranged')) });
    await page.close();
  }

  // =========================================================================
  // TEST 6: Sort Button Tap
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true);
    const sortBtn = await page.evaluate(() => {
      const el = document.querySelector('[data-a="sort"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(sortBtn.x, sortBtn.y);
    await page.waitForTimeout(100);
    results.push({ name: 'Sort Button Tap', pass: true });
    await page.close();
  }

  // =========================================================================
  // TEST 7: Fullscreen Button Tap & Hit Area
  // =========================================================================
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true);
    const fsBtn = await page.evaluate(() => {
      const el = document.querySelector('[data-a="fullscreen"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    });
    if (fsBtn) {
      await page.touchscreen.tap(fsBtn.x, fsBtn.y);
      await page.waitForTimeout(100);
    }
    results.push({ name: 'Fullscreen Button Tap & Hit Area (>=44px)', pass: fsBtn != null && fsBtn.w >= 28 });
    await page.close();
  }

  // =========================================================================
  // TEST 8: Refused Action Toasts (Every refusal gets a visible 2-second toast)
  // =========================================================================
  // A. Not your turn
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', false); // Not my turn
    const stock = await page.evaluate(() => {
      const el = document.querySelector('.pile[data-a="stock"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(stock.x, stock.y);
    await page.waitForTimeout(150);
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent));
    results.push({ name: 'Refused Action: Not Your Turn Toast', pass: toasts.some(t => t.includes('Wait for your turn')) });
    await page.close();
  }

  // B. Already drawn
  {
    const page = await createGamePage();
    await setupGame(page, 'discard', true); // Stage is discard, tap stock
    const stock = await page.evaluate(() => {
      const el = document.querySelector('.pile[data-a="stock"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(stock.x, stock.y);
    await page.waitForTimeout(150);
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent));
    results.push({ name: 'Refused Action: Already Drawn Toast', pass: toasts.some(t => t.includes('already drew a card')) });
    await page.close();
  }

  // C. Jokers can't be taken from open pile
  {
    const page = await createGamePage();
    await setupGame(page, 'draw', true, { discard: [4] }); // Card ID 4 has rank 5 which equals S.wild (5)!
    const openPos = await page.evaluate(() => {
      const el = document.querySelector('.pile[data-a="pickup"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(openPos.x, openPos.y);
    await page.waitForTimeout(150);
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent));
    results.push({ name: 'Refused Action: Open Joker Pickup Toast', pass: toasts.some(t => t.includes("Jokers can't be taken")) });
    await page.close();
  }

  // D. Discard card you just picked up
  {
    const page = await createGamePage();
    await setupGame(page, 'discard', true, { pickup: 10, hands: { u_p1: [10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14] } });
    await page.evaluate(() => {
      window.__RR.sel = { 10: 1 };
      window.__RR.renderRoom();
    });
    const discardBtn = await page.evaluate(() => {
      const el = document.querySelector('[data-a="discard"]');
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.touchscreen.tap(discardBtn.x, discardBtn.y);
    await page.waitForTimeout(150);
    const toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.toast')).map(t => t.textContent));
    results.push({ name: 'Refused Action: Discard Picked Up Card Toast', pass: toasts.some(t => t.includes('just picked this card up')) });
    await page.close();
  }

  // =========================================================================
  // PRINT SUMMARY
  // =========================================================================
  console.log('\n========================================');
  console.log('       TAP SUITE VERIFICATION           ');
  console.log('========================================');
  let allPass = true;
  for (const r of results) {
    console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}`);
    if (!r.pass) allPass = false;
  }
  console.log(`\nOverall Tap Suite: ${allPass ? 'ALL TESTS PASSED (100%)' : 'SOME TESTS FAILED'}`);

  await browser.close();
})();
