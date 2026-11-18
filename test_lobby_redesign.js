const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const FILE_URL = 'file:///' + path.resolve(__dirname, 'Rummy.html').replace(/\\/g, '/');
const ARTIFACTS_DIR = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/lobby_redesign';

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function runTests() {
  console.log('--- STARTING CARDS24 LOBBY REDESIGN TESTS ---');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  const viewports = [
    { name: '01_mobile_360x800_portrait', w: 360, h: 800, isMobile: true, portrait: true },
    { name: '02_mobile_390x844_portrait', w: 390, h: 844, isMobile: true, portrait: true },
    { name: '03_mobile_640x360_landscape', w: 640, h: 360, isMobile: true, landscape: true },
    { name: '04_mobile_844x390_landscape', w: 844, h: 390, isMobile: true, landscape: true },
    { name: '05_mobile_932x430_landscape', w: 932, h: 430, isMobile: true, landscape: true },
    { name: '06_tablet_1024x768', w: 1024, h: 768, isMobile: false },
    { name: '07_desktop_1440x900', w: 1440, h: 900, isMobile: false }
  ];

  let passed = 0;
  let failed = 0;

  // 1. Interactive Tests on 844x390 landscape
  console.log('\n--- Test Suite 1: Lobby Functional & Interactive Tests (844x390) ---');
  {
    const context = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true
    });
    const page = await context.newPage();
    await page.goto(FILE_URL);
    await page.waitForSelector('.home');
    await page.fill('#nm', 'Maharaja');

    // Create room
    await page.click('[data-a="create"]');
    await page.waitForSelector('.lobby');

    // Check in lobby
    const inLobby = await page.evaluate(() => !!document.querySelector('.lobby') && document.body.dataset.view === 'lobby');
    console.log(`[PASS] Room created, lobby active: ${inLobby}`);
    if (inLobby) passed++; else failed++;

    // Check Classic Deck toggle is removed
    const hasDeckBtn = await page.evaluate(() => !!document.querySelector('[data-a="deck"]'));
    console.log(`[PASS] Classic deck toggle removed: ${!hasDeckBtn}`);
    if (!hasDeckBtn) passed++; else failed++;

    // Check Table Felt button exists
    const hasFeltBtn = await page.evaluate(() => !!document.querySelector('[data-a="felt"]'));
    console.log(`[PASS] Table felt toggle present: ${hasFeltBtn}`);
    if (hasFeltBtn) passed++; else failed++;

    // Check initial mode is points
    let currentMode = await page.evaluate(() => {
      const card = document.querySelector('.mode-card.selected');
      return card ? card.dataset.m : null;
    });
    console.log(`[PASS] Initial selected mode: ${currentMode} (expected 'points')`);
    if (currentMode === 'points') passed++; else failed++;

    // Click Pool 101 mode
    await page.click('.mode-card[data-m="pool101"]');
    await page.waitForTimeout(100);
    currentMode = await page.evaluate(() => {
      const card = document.querySelector('.mode-card.selected');
      return card ? card.dataset.m : null;
    });
    console.log(`[PASS] Switched to Pool 101: ${currentMode} (expected 'pool101')`);
    if (currentMode === 'pool101') passed++; else failed++;

    // Click Pool 201 mode
    await page.click('.mode-card[data-m="pool201"]');
    await page.waitForTimeout(100);
    currentMode = await page.evaluate(() => {
      const card = document.querySelector('.mode-card.selected');
      return card ? card.dataset.m : null;
    });
    console.log(`[PASS] Switched to Pool 201: ${currentMode} (expected 'pool201')`);
    if (currentMode === 'pool201') passed++; else failed++;

    // Click Points Rummy mode
    await page.click('.mode-card[data-m="points"]');
    await page.waitForTimeout(100);
    currentMode = await page.evaluate(() => {
      const card = document.querySelector('.mode-card.selected');
      return card ? card.dataset.m : null;
    });
    console.log(`[PASS] Switched back to Points Rummy: ${currentMode} (expected 'points')`);
    if (currentMode === 'points') passed++; else failed++;

    // Check Table Felt cycling
    const feltBefore = await page.evaluate(() => document.querySelector('.theme-name').innerText);
    await page.click('[data-a="felt"]');
    await page.waitForTimeout(100);
    const feltAfter = await page.evaluate(() => document.querySelector('.theme-name').innerText);
    console.log(`[PASS] Felt cycled from "${feltBefore}" to "${feltAfter}"`);
    if (feltBefore !== feltAfter) passed++; else failed++;

    // Check single player has waiting banner (not deal button)
    let hasWaiting = await page.evaluate(() => !!document.querySelector('.lobby-status-banner.waiting'));
    let hasDealBtn = await page.evaluate(() => !!document.querySelector('.btn-deal-action'));
    console.log(`[PASS] 1 Player: waiting banner=${hasWaiting}, deal button=${hasDealBtn}`);
    if (hasWaiting && !hasDealBtn) passed++; else failed++;

    // Add Bot 1 -> 2 players
    await page.click('[data-a="addbot"]');
    await page.waitForTimeout(150);
    let playerCount = await page.evaluate(() => document.querySelectorAll('.lobby-seat.taken').length);
    hasDealBtn = await page.evaluate(() => !!document.querySelector('.btn-deal-action'));
    console.log(`[PASS] 2 Players: count=${playerCount}, deal button=${hasDealBtn}`);
    if (playerCount === 2 && hasDealBtn) passed++; else failed++;

    // Add Bots up to 6 players
    while (playerCount < 6) {
      await page.click('[data-a="addbot"]');
      await page.waitForTimeout(100);
      playerCount = await page.evaluate(() => document.querySelectorAll('.lobby-seat.taken').length);
    }
    const addBotDisabled = await page.evaluate(() => document.querySelector('[data-a="addbot"]').hasAttribute('disabled'));
    console.log(`[PASS] 6 Players reached: count=${playerCount}, addbot disabled=${addBotDisabled}`);
    if (playerCount === 6 && addBotDisabled) passed++; else failed++;

    // Remove one bot
    const removeBtn = await page.$('.btn-remove-player');
    if (removeBtn) {
      await removeBtn.click();
      await page.waitForTimeout(150);
      playerCount = await page.evaluate(() => document.querySelectorAll('.lobby-seat.taken').length);
      console.log(`[PASS] Removed bot: player count now=${playerCount} (expected 5)`);
      if (playerCount === 5) passed++; else failed++;
    }

    // Capture primary landscape screenshot with 5 players
    const ssPathLandscape = path.join(ARTIFACTS_DIR, '04_mobile_844x390_landscape.png');
    await page.screenshot({ path: ssPathLandscape, fullPage: false });
    console.log(`  Saved screenshot: ${ssPathLandscape}`);

    await context.close();
  }

  // 2. Viewport & Responsiveness Tests (all 7 viewports)
  console.log('\n--- Test Suite 2: Viewport Rendering & Overflow Audits ---');
  for (const vp of viewports) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.isMobile,
      isMobile: vp.isMobile
    });
    const page = await context.newPage();
    await page.goto(FILE_URL);
    await page.waitForSelector('.home');
    await page.fill('#nm', 'Maharaja');
    await page.click('[data-a="create"]');
    await page.waitForSelector('.lobby');

    // Add 2 bots so deal button is visible
    await page.click('[data-a="addbot"]');
    await page.waitForTimeout(100);
    await page.click('[data-a="addbot"]');
    await page.waitForTimeout(100);

    // Overflow check
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.lobby');
      const inner = document.querySelector('.lobby-inner');
      return {
        lobbyScrollW: el ? el.scrollWidth : 0,
        lobbyClientW: el ? el.clientWidth : 0,
        innerScrollW: inner ? inner.scrollWidth : 0,
        innerClientW: inner ? inner.clientWidth : 0,
        hasHorizontalScroll: (el ? el.scrollWidth > el.clientWidth : false) || (inner ? inner.scrollWidth > inner.clientWidth : false)
      };
    });

    // Rotate screen check
    const rotateVisible = await page.evaluate(() => {
      const rot = document.querySelector('.rotate');
      if (!rot) return false;
      const comp = window.getComputedStyle(rot);
      return comp.display !== 'none';
    });

    const isGood = !overflow.hasHorizontalScroll && !rotateVisible;
    console.log(`Viewport ${vp.w}x${vp.h} (${vp.name}): overflow=${overflow.hasHorizontalScroll}, rotateVisible=${rotateVisible} -> ${isGood ? 'PASS' : 'FAIL'}`);
    if (isGood) passed++; else failed++;

    // Screenshot for each viewport
    const ssPath = path.join(ARTIFACTS_DIR, `${vp.name}.png`);
    await page.screenshot({ path: ssPath, fullPage: false });
    console.log(`  Saved screenshot: ${ssPath}`);

    await context.close();
  }

  await browser.close();
  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
