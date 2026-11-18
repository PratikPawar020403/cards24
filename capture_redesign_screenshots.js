const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/redesign';
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

  async function initTableState(page, pCount = 6, customDeal = {}) {
    await page.evaluate(({ pCount, customDeal }) => {
      const L = window.RummyLogic;
      const me = window.__RR.me;
      me.uid = 'u_p1';
      me.name = 'CARDS24';
      window.__RR.code = 'ROOM 4';
      window.__RR.room = { code: 'ROOM 4', hostId: 'u_p1', status: 'playing', mode: 'points', turnSecs: 30 };
      
      const uids = ['u_p1'];
      const players = {
        u_p1: { uid: 'u_p1', name: 'N.MAS', joinedAt: Date.now() }
      };
      const opponentNames = ['CARIOS', 'ROOMY', 'WARRIOR', 'MUTHA', 'VIKRAM'];
      for (let i = 1; i < pCount; i++) {
        const bUid = 'bot_' + i;
        uids.push(bUid);
        players[bUid] = { uid: bUid, name: opponentNames[i - 1], bot: true };
      }
      window.__RR.players = players;
      const deal = L.newDeal({ order: uids, round: 275, mode: 'points', baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = 'draw';
      deal.turn = 'u_p1';
      deal.startedAt = Date.now() - 18000; // 12 seconds remaining on 30s timer
      deal.turnN = 1;
      
      // Let's set specific aesthetic cards in hand matching reference or a handsome hand:
      // A♥, 2♥, 3♥ | 4♣, 5♣, 6♣ | 8♠, 9♠ | J♦, Q♦, A♦
      deal.hands['u_p1'] = [13, 14, 15, 42, 43, 44, 7, 8, 36, 37, 26, 52, 53];
      deal.discard = [47]; // 9 of clubs on discard pile
      deal.wild = 0;       // Aces are wild
      deal.cut = 52;       // Joker cut
      
      if (customDeal) Object.assign(deal, customDeal);
      
      window.__RR.S = deal;
      window.__RR.renderRoom();
      window.__RR.fitHand();
    }, { pCount, customDeal });
    await page.waitForTimeout(300);
  }

  // 1. Mobile 844x390 (6 players - Primary Reference Match)
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '01_mobile_844x390_6p.png') });
    await page.close();
  }

  // 2. Mobile 932x430 (6 players)
  {
    const page = await browser.newPage({ viewport: { width: 932, height: 430 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '02_mobile_932x430_6p.png') });
    await page.close();
  }

  // 3. Mobile Compact 640x360 (6 players)
  {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '03_mobile_640x360_6p.png') });
    await page.close();
  }

  // 4. Mobile 844x390 (4 players)
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 4);
    await page.screenshot({ path: path.join(OUT_DIR, '04_mobile_844x390_4p.png') });
    await page.close();
  }

  // 5. Mobile 844x390 (2 players)
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 2);
    await page.screenshot({ path: path.join(OUT_DIR, '05_mobile_844x390_2p.png') });
    await page.close();
  }

  // 6. Tablet 1024x768 (6 players)
  {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '06_tablet_1024x768_6p.png') });
    await page.close();
  }

  // 7. Desktop 1440x900 (6 players)
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6);
    await page.screenshot({ path: path.join(OUT_DIR, '07_desktop_1440x900_6p.png') });
    await page.close();
  }

  // 8. Mobile Portrait 390x844 (Rotate Screen prompt)
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await page.screenshot({ path: path.join(OUT_DIR, '08_mobile_portrait_rotate_screen.png') });
    await page.close();
  }

  // 9. Mobile 844x390 (Card Selected & Discard active)
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await page.goto(FILE_URL);
    await initTableState(page, 6, { stage: 'discard' });
    // Click first card to select it
    await page.click('#hand .card');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT_DIR, '09_mobile_844x390_card_selected.png') });
    await page.close();
  }

  await browser.close();
  console.log('ALL REDESIGN SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

capture().catch(err => {
  console.error('Capture error:', err);
  process.exit(1);
});
