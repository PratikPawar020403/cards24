const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/audit';
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const CHROME_PATH = 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const FILE_URL = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

async function capture() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  // Helper to init game state in page
  async function initTableState(page, pCount = 4, mode = 'points') {
    await page.evaluate(({ pCount, mode }) => {
      const L = window.RummyLogic;
      const me = window.__RR.me;
      me.uid = 'u_p1';
      me.name = 'Pratik (You)';
      window.__RR.code = 'AUDIT';
      window.__RR.room = { code: 'AUDIT', hostId: 'u_p1', status: 'playing', mode: mode, turnSecs: 30 };
      const uids = ['u_p1'];
      const players = {
        u_p1: { uid: 'u_p1', name: 'Pratik (You)', joinedAt: Date.now() }
      };
      const botNames = ['Aarav', 'Meera', 'Rohan', 'Kavya', 'Vikram'];
      for (let i = 1; i < pCount; i++) {
        const bUid = 'bot_' + i;
        uids.push(bUid);
        players[bUid] = { uid: bUid, name: botNames[i - 1] + ' (bot)', bot: true };
      }
      window.__RR.players = players;
      const deal = L.newDeal({ order: uids, round: 1, mode: mode, baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = 'draw';
      deal.turn = 'u_p1';
      deal.startedAt = Date.now() - 6000;
      deal.turnN = 1;
      deal.discard = [18]; // 6 of Hearts
      deal.wild = 6;      // Wild rank 6
      deal.cut = 18;      // Cut card
      window.__RR.S = deal;
      window.__RR.renderRoom();
      window.__RR.fitHand();
    }, { pCount, mode });
    await page.waitForTimeout(200);
  }

  // 1. Desktop Table 1440x900 (4 players)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 4);
    await page.screenshot({ path: path.join(OUT_DIR, '01_desktop_table_1440x900_4p.png') });
    await page.close();
  }

  // 2. Desktop Table 1280x720 (6 players)
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '02_desktop_table_1280x720_6p.png') });
    await page.close();
  }

  // 3. Mobile Landscape 844x390 (iPhone 12/13/14 Pro - 6 players)
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '03_mobile_table_844x390_6p.png') });
    await page.close();
  }

  // 4. Mobile Landscape 830x290 (Short phone, Android / notch landscape - 4 players)
  {
    const page = await browser.newPage({ viewport: { width: 830, height: 290 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(FILE_URL);
    await initTableState(page, 4);
    await page.screenshot({ path: path.join(OUT_DIR, '04_mobile_table_830x290_4p.png') });
    await page.close();
  }

  // 5. Mobile Landscape 640x270 (Extra short phone - 4 players)
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 270 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await page.goto(FILE_URL);
    await initTableState(page, 4);
    await page.screenshot({ path: path.join(OUT_DIR, '05_mobile_table_640x270_4p.png') });
    await page.close();
  }

  // 6. Home Screen (Desktop & Mobile)
  {
    const pageD = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await pageD.goto(FILE_URL);
    await pageD.waitForSelector('.home');
    await pageD.screenshot({ path: path.join(OUT_DIR, '06_desktop_home_1280x720.png') });
    await pageD.close();

    const pageM = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await pageM.goto(FILE_URL);
    await pageM.waitForSelector('.home');
    await pageM.screenshot({ path: path.join(OUT_DIR, '07_mobile_home_844x390.png') });
    await pageM.close();
  }

  // 7. Lobby Screen (Desktop & Mobile)
  {
    const pageD = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await pageD.goto(FILE_URL);
    await pageD.evaluate(() => {
      window.__RR.code = 'LOBBY1';
      window.__RR.room = { code: 'LOBBY1', hostId: 'u_p1', status: 'lobby', mode: 'points', turnSecs: 30 };
      window.__RR.players = {
        u_p1: { uid: 'u_p1', name: 'Pratik (Host)', host: true },
        bot_1: { uid: 'bot_1', name: 'Aarav (bot)', bot: true },
        bot_2: { uid: 'bot_2', name: 'Kavya (bot)', bot: true }
      };
      window.__RR.renderRoom();
    });
    await pageD.waitForTimeout(200);
    await pageD.screenshot({ path: path.join(OUT_DIR, '08_desktop_lobby_1280x720.png') });
    await pageD.close();

    const pageM = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await pageM.goto(FILE_URL);
    await pageM.evaluate(() => {
      window.__RR.code = 'LOBBY1';
      window.__RR.room = { code: 'LOBBY1', hostId: 'u_p1', status: 'lobby', mode: 'points', turnSecs: 30 };
      window.__RR.players = {
        u_p1: { uid: 'u_p1', name: 'Pratik (Host)', host: true },
        bot_1: { uid: 'bot_1', name: 'Aarav (bot)', bot: true },
        bot_2: { uid: 'bot_2', name: 'Kavya (bot)', bot: true }
      };
      window.__RR.renderRoom();
    });
    await pageM.waitForTimeout(200);
    await pageM.screenshot({ path: path.join(OUT_DIR, '09_mobile_lobby_844x390.png') });
    await pageM.close();
  }

  // 8. Modals: Table Menu & Scores
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 4);

    // Open menu
    await page.click('[data-a="menu"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, '10_modal_table_menu.png') });

    // Open scores
    await page.click('[data-a="scores"]');
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT_DIR, '11_modal_scores.png') });

    await page.close();
  }

  await browser.close();
  console.log('All audit screenshots captured successfully in:', OUT_DIR);
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
