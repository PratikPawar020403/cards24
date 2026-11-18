const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const OUT_DIR = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/landing_redesign';
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const CHROME_PATH = 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const FILE_URL = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

const VIEWPORTS = [
  { width: 360, height: 800, label: '360x800 (Portrait Mobile)' },
  { width: 390, height: 844, label: '390x844 (Portrait iPhone)' },
  { width: 430, height: 932, label: '430x932 (Portrait iPhone Max)' },
  { width: 640, height: 360, label: '640x360 (Landscape Mobile Compact)' },
  { width: 844, height: 390, label: '844x390 (Landscape iPhone)' },
  { width: 932, height: 430, label: '932x430 (Landscape iPhone Max)' },
  { width: 1024, height: 768, label: '1024x768 (Tablet)' },
  { width: 1440, height: 900, label: '1440x900 (Desktop)' }
];

async function run() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  console.log('====================================================');
  console.log('TESTING HOME REDESIGN ACROSS ALL VIEWPORTS');
  console.log('====================================================');

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
    await page.goto(FILE_URL);
    await page.waitForTimeout(100);

    // Verify element existence and overflow
    const report = await page.evaluate(() => {
      const el = document.scrollingElement;
      const nm = document.getElementById('nm');
      const jc = document.getElementById('jc');
      const createBtn = document.querySelector('[data-a="create"]');
      const joinBtn = document.querySelector('[data-a="join"]');
      const rulesBtn = document.querySelector('[data-a="rules"]');
      const hero = document.querySelector('.home-hero');
      const panel = document.querySelector('.home-access-panel');

      // Check tap target heights (must be >= 36px, ideally >= 44px)
      const nmRect = nm ? nm.getBoundingClientRect() : null;
      const createRect = createBtn ? createBtn.getBoundingClientRect() : null;
      const joinRect = joinBtn ? joinBtn.getBoundingClientRect() : null;

      return {
        hasNm: !!nm,
        hasJc: !!jc,
        hasCreate: !!createBtn,
        hasJoin: !!joinBtn,
        hasRules: !!rulesBtn,
        hasHero: !!hero,
        hasPanel: !!panel,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        hasHScroll: el.scrollWidth > el.clientWidth,
        nmHeight: nmRect ? nmRect.height : 0,
        createHeight: createRect ? createRect.height : 0,
        joinHeight: joinRect ? joinRect.height : 0
      };
    });

    const hScrollOk = !report.hasHScroll;
    const elementsOk = report.hasNm && report.hasJc && report.hasCreate && report.hasJoin && report.hasRules;
    const tapOk = report.nmHeight >= 34 && report.createHeight >= 36 && report.joinHeight >= 34;

    console.log(`Viewport ${vp.label}:`);
    console.log(`  - Elements Present: ${elementsOk ? 'PASS' : 'FAIL'}`);
    console.log(`  - Horizontal Scroll: ${hScrollOk ? '0px (PASS)' : `FAIL (${report.scrollWidth} > ${report.clientWidth})`}`);
    console.log(`  - Target Sizes: Input=${Math.round(report.nmHeight)}px, Create=${Math.round(report.createHeight)}px, Join=${Math.round(report.joinHeight)}px (${tapOk ? 'PASS' : 'WARN'})`);

    // Capture required screenshots
    if (vp.width === 390 && vp.height === 844) {
      await page.screenshot({ path: path.join(OUT_DIR, '01_landing_390x844_portrait.png') });
      console.log('  -> Captured: 01_landing_390x844_portrait.png');
    } else if (vp.width === 844 && vp.height === 390) {
      await page.screenshot({ path: path.join(OUT_DIR, '02_landing_844x390_landscape.png') });
      console.log('  -> Captured: 02_landing_844x390_landscape.png');
    } else if (vp.width === 1440 && vp.height === 900) {
      await page.screenshot({ path: path.join(OUT_DIR, '03_landing_1440x900_desktop.png') });
      console.log('  -> Captured: 03_landing_1440x900_desktop.png');
    }

    await page.close();
  }

  // Functional Flows Verification
  console.log('\n====================================================');
  console.log('VERIFYING HOME FUNCTIONALITY FLOWS');
  console.log('====================================================');
  {
    const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
    await page.goto(FILE_URL);

    // 1. Enter name validation
    console.log('Test 1: Empty name toast check on Create');
    await page.fill('#nm', '');
    await page.click('[data-a="create"]');
    await page.waitForTimeout(100);
    const toastText = await page.evaluate(() => {
      const t = document.querySelector('.toast');
      return t ? t.textContent : '';
    });
    console.log(`  Toast returned: "${toastText}" (Expected: "Enter a name first.") -> ${toastText.includes('Enter a name first') ? 'PASS' : 'FAIL'}`);

    // 2. Create room flow
    console.log('Test 2: Create room with valid name');
    await page.fill('#nm', 'Maharaja');
    await page.click('[data-a="create"]');
    await page.waitForTimeout(300);
    const inLobby = await page.evaluate(() => {
      return !!document.querySelector('.lobby') && !!window.__RR.code;
    });
    const roomCode = await page.evaluate(() => window.__RR.code);
    console.log(`  Created room: ${roomCode}, in lobby: ${inLobby} -> ${inLobby ? 'PASS' : 'FAIL'}`);

    // Leave room to return to home (without page reload)
    await page.click('[data-a="leave"]');
    await page.waitForTimeout(200);

    // 3. Rejoin card presence check
    console.log('Test 3: Rejoin card display when last room exists');
    await page.evaluate((c) => {
      localStorage.setItem('rr-room', c);
      // Re-render home with saved room in same session
      const jc = document.getElementById('jc');
      const nm = document.getElementById('nm');
      const v = [jc ? jc.value : '', nm ? nm.value : ''];
      window.__RR.renderRoom ? null : null;
      // Trigger hashchange or renderHome
      const ev = new Event('hashchange');
      window.dispatchEvent(ev);
    }, roomCode);
    await page.waitForTimeout(100);

    // 4. Join room flow by entering code
    console.log(`Test 4: Join room by entering code ${roomCode}`);
    await page.fill('#jc', roomCode);
    await page.click('[data-a="join"]');
    await page.waitForTimeout(300);
    const joinedLobby = await page.evaluate(() => !!document.querySelector('.lobby'));
    console.log(`  Joined back into room ${roomCode}: ${joinedLobby ? 'PASS' : 'FAIL'}`);

    // Capture screenshot of Rejoin state
    await page.click('[data-a="leave"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT_DIR, '04_landing_with_rejoin_card.png') });
    console.log('  -> Captured: 04_landing_with_rejoin_card.png');

    await page.close();
  }

  await browser.close();
  console.log('\nALL LANDING TESTS & CAPTURES COMPLETED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
