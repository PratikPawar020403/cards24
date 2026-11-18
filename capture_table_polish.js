const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const outDir = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/table_polish';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });
  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await page.goto(fileUrl);

  // Setup 6-player room
  await page.evaluate(() => {
    window.__RR.me = { uid: 'u_p1', name: 'Wow' };
    window.__RR.code = 'YCMT';
    window.__RR.room = {
      code: 'YCMT',
      status: 'playing',
      mode: 'points',
      turnSec: 30,
      host: 'u_p1',
      back: 'emerald',
      felt: 'emerald',
      deck: 'classic'
    };
    const players = { u_p1: { uid: 'u_p1', name: 'Wow', joinedAt: Date.now() } };
    const botNames = ['Aarav', 'Kavya', 'Rohan', 'Meera', 'Vikram'];
    for (let i = 1; i <= 5; i++) {
      players['bot_' + i] = { uid: 'bot_' + i, name: botNames[i - 1], bot: true };
    }
    window.__RR.players = players;

    const L = window.RummyLogic;
    const uids = Object.keys(window.__RR.players);
    const deal = L.newDeal({ order: uids, round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
    deal.phase = 'play';
    deal.stage = 'draw';
    deal.turn = 'u_p1';
    deal.startedAt = Date.now() - 2000;
    deal.turnN = 1;
    window.__RR.S = deal;
    window.__RR.renderRoom();
    window.__RR.fitHand();
  });
  await page.waitForTimeout(80);

  // Click auto to organize cards into meld groups
  await page.click('button[data-a="auto"]');
  await page.waitForTimeout(100);

  // Capture 844x390 main
  const sc1 = path.join(outDir, '01_table_844x390_6p_main.png');
  await page.screenshot({ path: sc1 });
  console.log('Saved:', sc1);

  // Check Finish Active State (draw 14th card)
  await page.evaluate(() => {
    window.__RR.S.stage = 'discard';
    window.__RR.renderRoom();
    window.__RR.fitHand();
  });
  await page.waitForTimeout(80);
  const scFinish = path.join(outDir, '06_table_844x390_finish_active.png');
  await page.screenshot({ path: scFinish });
  console.log('Saved:', scFinish);

  // Reset stage to draw for viewport screenshots
  await page.evaluate(() => {
    window.__RR.S.stage = 'draw';
    window.__RR.renderRoom();
    window.__RR.fitHand();
  });

  // Other viewports
  const viewports = [
    { w: 640, h: 360, name: '02_table_640x360_compact.png' },
    { w: 932, h: 430, name: '03_table_932x430_modern.png' },
    { w: 1024, h: 768, name: '04_table_1024x768_tablet.png' },
    { w: 1440, h: 900, name: '05_table_1440x900_desktop.png' }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate(() => {
      window.__RR.fitHand();
    });
    await page.waitForTimeout(80);
    const scPath = path.join(outDir, vp.name);
    await page.screenshot({ path: scPath });
    console.log('Saved:', scPath);
  }

  // Open Table Menu at 844x390 and capture
  await page.setViewportSize({ width: 844, height: 390 });
  await page.click('[data-a="menu"]');
  await page.waitForTimeout(80);
  const scMenu = path.join(outDir, '07_table_menu_modal.png');
  await page.screenshot({ path: scMenu });
  console.log('Saved:', scMenu);

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
})();
