const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });

  const context = await browser.newContext({
    viewport: { width: 830, height: 290 },
    deviceScaleFactor: 2,
    hasTouch: true
  });

  const page = await context.newPage();
  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');
  await page.goto(fileUrl);

  await page.evaluate(() => {
    const L = window.RummyLogic;
    const me = window.__RR.me;
    const myUid = 'u_p1';
    me.uid = myUid;
    me.name = 'Pratik';
    window.__RR.code = 'TEST';
    window.__RR.room = { code: 'TEST', hostId: myUid, status: 'playing', mode: 'points', turnSecs: 30 };
    const players = {
      [myUid]: { uid: myUid, name: 'Pratik', joinedAt: Date.now() },
      u_p2: { uid: 'u_p2', name: 'Aarav (bot)', bot: true }
    };
    window.__RR.players = players;
    const deal = L.newDeal({ order: [myUid, 'u_p2'], round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
    deal.phase = 'play';
    deal.stage = 'draw';
    deal.turn = myUid;
    deal.startedAt = Date.now() - 20000;
    deal.turnN = 1;
    // ensure top discard is not wild
    deal.discard = [7]; // rank 7 is not wild
    deal.wild = 5;
    window.__RR.S = deal;

    window.__actions = [];
    document.addEventListener('click', (ev) => {
      window.__lastClick = { target: ev.target.tagName + '.' + ev.target.className, time: Date.now() };
    }, true);

    window.__RR.renderRoom();
    window.__RR.fitHand();
  });

  await page.waitForTimeout(200);

  console.log('=== TEST 1: Open Pile Tap (Pickup) ===');
  const openCardBox = await page.evaluate(() => {
    const el = document.querySelector('.pile[data-a="pickup"] .card');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, html: el.outerHTML };
  });
  console.log('Open Card Box found:', !!openCardBox);

  if (openCardBox) {
    // Tap with page.touchscreen
    await page.touchscreen.tap(openCardBox.x, openCardBox.y);
    await page.waitForTimeout(200);
  }

  const stageAfterOpenTap = await page.evaluate(() => window.__RR.S.stage);
  const handLenAfterOpenTap = await page.evaluate(() => window.__RR.S.hands['u_p1'].length);
  console.log('Stage after tap on Open Card:', stageAfterOpenTap);
  console.log('Hand length after tap:', handLenAfterOpenTap);
  const openTapPass = stageAfterOpenTap === 'discard' && handLenAfterOpenTap === 14;
  console.log('Test 1 (Open Card Tap):', openTapPass ? 'PASS' : 'FAIL (Card was not picked up; stage is still ' + stageAfterOpenTap + ')');

  console.log('\n=== TEST 2: Hand Card Select & Discard ===');
  const cardBox = await page.evaluate(() => {
    const el = document.querySelector('#hand .card');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, cardId: el.dataset.card };
  });
  console.log('Hand Card Box found:', !!cardBox);

  if (cardBox) {
    await page.touchscreen.tap(cardBox.x, cardBox.y);
    await page.waitForTimeout(200);
  }

  const isSelected = await page.evaluate((id) => {
    const el = document.querySelector('#hand [data-card="' + id + '"]');
    return el ? el.classList.contains('sel') : false;
  }, cardBox ? cardBox.cardId : -1);

  console.log('Hand Card Selected class present:', isSelected);
  console.log('Test 2 (Hand Card Tap Selection):', isSelected ? 'PASS' : 'FAIL (Card did not get selected)');

  await browser.close();
})();
