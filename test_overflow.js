const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');

const VIEWPORTS = [
  { width: 568, height: 270, label: '568x270' },
  { width: 640, height: 270, label: '640x270' },
  { width: 740, height: 270, label: '740x270 (worst-case compact)' },
  { width: 800, height: 280, label: '800x280' },
  { width: 830, height: 290, label: '830x290 (main target)' },
  { width: 830, height: 390, label: '830x390 (fullscreen main)' },
  { width: 844, height: 390, label: '844x390' },
  { width: 932, height: 430, label: '932x430' }
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });
  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

  let failCount = 0;

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
    await page.goto(fileUrl);

    // Test Home
    const homeOverflow = await page.evaluate(() => {
      const el = document.scrollingElement;
      return {
        sh: el.scrollHeight,
        ch: el.clientHeight,
        sw: el.scrollWidth,
        cw: el.clientWidth,
        vScroll: el.scrollHeight > el.clientHeight,
        hScroll: el.scrollWidth > el.clientWidth
      };
    });
    if (homeOverflow.vScroll || homeOverflow.hScroll) {
      console.log(`FAIL: Home scroll at ${vp.label}:`, homeOverflow);
      failCount++;
    } else {
      console.log(`PASS: Home at ${vp.label} no scroll (${homeOverflow.cw}x${homeOverflow.ch})`);
    }

    // Test Lobby with 6 players
    await page.evaluate(() => {
      window.__RR.code = '7TD2';
      window.__RR.room = { code: '7TD2', hostId: 'u_p1', status: 'lobby', mode: 'points', turnSecs: 30 };
      const players = { u_p1: { uid: 'u_p1', name: 'Wow', joinedAt: Date.now() } };
      const botNames = ['Aarav', 'Kavya', 'Rohan', 'Meera', 'Vikram'];
      for (let i = 1; i <= 5; i++) {
        players['bot_' + i] = { uid: 'bot_' + i, name: botNames[i - 1] + ' (bot)', bot: true };
      }
      window.__RR.players = players;
      window.__RR.renderRoom();
    });
    await page.waitForTimeout(60);

    const lobbyOverflow = await page.evaluate(() => {
      const el = document.scrollingElement;
      const lobbyEl = document.querySelector('.lobby');
      const seats = document.querySelectorAll('.lobby .seat');
      const lastSeat = seats[seats.length - 1];
      const r = lastSeat ? lastSeat.getBoundingClientRect() : null;
      return {
        sh: el.scrollHeight,
        ch: el.clientHeight,
        sw: el.scrollWidth,
        cw: el.clientWidth,
        vScroll: el.scrollHeight > el.clientHeight,
        hScroll: el.scrollWidth > el.clientWidth,
        lastSeatBottom: r ? r.bottom : null,
        viewportH: window.innerHeight
      };
    });
    if (lobbyOverflow.vScroll || lobbyOverflow.hScroll || (lobbyOverflow.lastSeatBottom && lobbyOverflow.lastSeatBottom > lobbyOverflow.viewportH)) {
      console.log(`FAIL: Lobby scroll/clip at ${vp.label}:`, lobbyOverflow);
      failCount++;
    } else {
      console.log(`PASS: Lobby 6p at ${vp.label} fits completely (${lobbyOverflow.cw}x${lobbyOverflow.ch})`);
    }

    // Test Table with 6 players
    await page.evaluate(() => {
      const L = window.RummyLogic;
      const uids = Object.keys(window.__RR.players);
      const deal = L.newDeal({ order: uids, round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = 'draw';
      deal.turn = 'u_p1';
      deal.startedAt = Date.now() - 20000;
      deal.turnN = 1;
      window.__RR.S = deal;
      window.__RR.room.status = 'playing';
      window.__RR.renderRoom();
      window.__RR.fitHand();
    });
    await page.waitForTimeout(60);

    const tableOverflow = await page.evaluate(() => {
      const el = document.scrollingElement;
      return {
        sh: el.scrollHeight,
        ch: el.clientHeight,
        sw: el.scrollWidth,
        cw: el.clientWidth,
        vScroll: el.scrollHeight > el.clientHeight,
        hScroll: el.scrollWidth > el.clientWidth
      };
    });
    if (tableOverflow.vScroll || tableOverflow.hScroll) {
      console.log(`FAIL: Table scroll at ${vp.label}:`, tableOverflow);
      failCount++;
    } else {
      console.log(`PASS: Table 6p at ${vp.label} no scroll (${tableOverflow.cw}x${tableOverflow.ch})`);
    }

    await page.close();
  }

  console.log(`\nOVERFLOW VERIFICATION: ${failCount === 0 ? 'ALL PASSED (0 scroll/clip)' : failCount + ' failures'}`);
  await browser.close();
})();
