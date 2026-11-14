const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const VIEWPORTS = [
  { w: 568, h: 270, label: '568x270' },
  { w: 640, h: 270, label: '640x270' },
  { w: 740, h: 280, label: '740x280' },
  { w: 800, h: 280, label: '800x280' },
  { w: 667, h: 375, label: '667x375' },
  { w: 844, h: 390, label: '844x390' },
  { w: 932, h: 430, label: '932x430' }
];

const PLAYER_COUNTS = [2, 4, 6];
const STAGES = ['draw', 'discard', 'result'];

const screenshotsDir = path.resolve('test_screenshots');
if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir);

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });

  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');
  let allPassed = true;
  const failureLog = [];

  console.log(`Starting automated verification across ${VIEWPORTS.length} viewports, ${PLAYER_COUNTS.length} player counts, and ${STAGES.length} stages...`);

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2
    });
    const page = await context.newPage();
    await page.goto(fileUrl);
    await page.waitForTimeout(50);

    for (const pCount of PLAYER_COUNTS) {
      for (const stage of STAGES) {
        const testId = `${vp.label}_${pCount}p_${stage}`;

        // Setup state directly via window.__RR
        await page.evaluate(({ pCount, stage }) => {
          const L = window.RummyLogic;
          const me = window.__RR.me;
          const myUid = me.uid || 'u_host';
          me.uid = myUid;
          me.name = 'Pratik';
          window.__RR.code = 'TEST';
          window.__RR.room = {
            code: 'TEST',
            hostId: myUid,
            status: 'playing',
            mode: 'points',
            turnSecs: 30
          };

          const players = {};
          players[myUid] = { uid: myUid, name: 'Pratik', joinedAt: Date.now() };

          const botNames = ['Aarav', 'Kavya', 'Rohan', 'Meera', 'Vikram'];
          const order = [myUid];
          for (let i = 1; i < pCount; i++) {
            const bUid = 'bot_' + i;
            const bName = botNames[i - 1] + ' (bot)';
            players[bUid] = { uid: bUid, name: bName, bot: true, joinedAt: Date.now() };
            order.push(bUid);
          }
          window.__RR.players = players;

          const baseTotals = {};
          order.forEach(u => { baseTotals[u] = 0; });
          const deal = L.newDeal({ order, round: 0, mode: 'points', baseTotals, now: Date.now() });

          if (stage === 'draw') {
            deal.phase = 'play';
            deal.stage = 'draw';
            deal.turn = myUid;
            if (deal.hands[myUid].length > 13) deal.hands[myUid] = deal.hands[myUid].slice(0, 13);
          } else if (stage === 'discard') {
            deal.phase = 'play';
            deal.stage = 'discard';
            deal.turn = myUid;
            if (deal.hands[myUid].length === 13) {
              deal.hands[myUid].push(deal.stock.pop() || 40);
            }
          } else if (stage === 'result') {
            deal.phase = 'ended';
            const pts = {}, totals = {}, groups = {};
            order.forEach(u => {
              pts[u] = u === myUid ? 0 : 42;
              totals[u] = pts[u];
              groups[u] = { groups: [[0, 1, 2]], leftover: [5, 6] };
            });
            deal.result = {
              winner: myUid,
              points: pts,
              totals: totals,
              groups: groups,
              elim: [],
              gameOver: false
            };
          }

          window.__RR.S = deal;
          window.__RR.renderRoom();
          window.__RR.fitHand();
        }, { pCount, stage });

        // Let layout settle
        await page.waitForTimeout(40);

        // Run Verification Checks
        const checkResults = await page.evaluate((isResultStage) => {
          const errors = [];
          const W = window.innerWidth;
          const H = window.innerHeight;

          // 1. Page Scroll Check
          if (window.scrollX !== 0 || window.scrollY !== 0) {
            errors.push(`Page scrolled: (${window.scrollX}, ${window.scrollY})`);
          }
          if (document.documentElement.scrollWidth > W) {
            errors.push(`Horizontal document overflow: ${document.documentElement.scrollWidth} > ${W}`);
          }
          if (document.documentElement.scrollHeight > H) {
            errors.push(`Vertical document overflow: ${document.documentElement.scrollHeight} > ${H}`);
          }

          // 2. Bounds Check for Key Elements
          const keySelectors = [
            '.bar',
            '.felt',
            '.rail',
            '.dealer-cell',
            '.status-lane',
            '.piles-lane',
            '.hand-lane'
          ];
          for (const sel of keySelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) {
                errors.push(`Element ${sel} out of viewport bounds: [${r.left}, ${r.top}, ${r.right}, ${r.bottom}] vs [${W}, ${H}]`);
              }
            }
          }

          // 3. Collision / Intersection Check (only in non-modal play stages)
          if (!isResultStage) {
            const items = [];
            // Seats
            document.querySelectorAll('.seat-chip').forEach((el, idx) => {
              items.push({ name: `seat-chip-${idx}`, rect: el.getBoundingClientRect(), el });
            });
            // Dealer
            const dealer = document.querySelector('.dealer-cell');
            if (dealer) items.push({ name: 'dealer', rect: dealer.getBoundingClientRect(), el: dealer });
            // Status lane
            const status = document.querySelector('.status-lane');
            if (status) items.push({ name: 'status-lane', rect: status.getBoundingClientRect(), el: status });
            // Piles
            document.querySelectorAll('.piles-lane .pile, .piles-lane .wildbox').forEach((el, idx) => {
              items.push({ name: `pile-${idx}`, rect: el.getBoundingClientRect(), el });
            });
            // Hand lane
            const hand = document.querySelector('.hand-lane');
            if (hand) items.push({ name: 'hand-lane', rect: hand.getBoundingClientRect(), el: hand });
            // Rail
            const rail = document.querySelector('.rail');
            if (rail) items.push({ name: 'rail', rect: rail.getBoundingClientRect(), el: rail });

            const eps = 0.5;
            for (let i = 0; i < items.length; i++) {
              for (let j = i + 1; j < items.length; j++) {
                const A = items[i];
                const B = items[j];
                // Ignore if one contains the other
                if (A.el.contains(B.el) || B.el.contains(A.el)) continue;

                const xOverlap = Math.max(0, Math.min(A.rect.right, B.rect.right) - Math.max(A.rect.left, B.rect.left));
                const yOverlap = Math.max(0, Math.min(A.rect.bottom, B.rect.bottom) - Math.max(A.rect.top, B.rect.top));

                if (xOverlap > eps && yOverlap > eps) {
                  errors.push(`Overlap detected between ${A.name} and ${B.name}: xOverlap=${xOverlap.toFixed(1)}, yOverlap=${yOverlap.toFixed(1)}`);
                }
              }
            }
          }

          // 4. Hit Area & Card Strip & Font Size
          if (!isResultStage) {
            // Hand card strips
            const cards = Array.from(document.querySelectorAll('#hand .cards .card'));
            for (let i = 0; i < cards.length; i++) {
              const c = cards[i];
              const next = cards[i + 1];
              const cr = c.getBoundingClientRect();
              let strip = cr.width;
              if (next && next.parentElement === c.parentElement) {
                const nr = next.getBoundingClientRect();
                strip = nr.left - cr.left;
              }
              if (strip < 27.5) { // 0.5px tolerance
                errors.push(`Card ${i} strip width too small: ${strip.toFixed(1)}px < 28px`);
              }
            }

            // Buttons
            const buttons = Array.from(document.querySelectorAll('.btn:not(:disabled)'));
            for (const b of buttons) {
              const r = b.getBoundingClientRect();
              const after = window.getComputedStyle(b, '::after');
              const effectiveW = Math.max(r.width, parseFloat(after.minWidth) || 0);
              const effectiveH = Math.max(r.height, parseFloat(after.minHeight) || 0);
              if (effectiveW < 43.5 || effectiveH < 43.5) {
                errors.push(`Button '${b.textContent.trim().slice(0, 10)}' hit area too small: ${effectiveW.toFixed(1)}x${effectiveH.toFixed(1)}`);
              }
            }

            // Font sizes
            const texts = document.querySelectorAll('.felt span, .felt div, .rail span, .rail b, .rail button');
            for (const t of texts) {
              if (t.children.length === 0 && t.textContent.trim().length > 0) {
                const fs = parseFloat(window.getComputedStyle(t).fontSize);
                if (fs < 9.5 && !t.classList.contains('bot-glyph')) {
                  errors.push(`Text '${t.textContent.trim().slice(0, 10)}' font size too small: ${fs}px`);
                }
              }
            }
          }

          return errors;
        }, stage === 'result');

        if (checkResults.length > 0) {
          allPassed = false;
          console.error(`FAIL: ${testId}`);
          checkResults.forEach(err => console.error(`  - ${err}`));
          failureLog.push({ testId, errors: checkResults });
        } else {
          console.log(`PASS: ${testId}`);
        }

        // Capture screenshot
        const screenshotPath = path.join(screenshotsDir, `${testId}.png`);
        await page.screenshot({ path: screenshotPath });
      }
    }
    await context.close();
  }

  await browser.close();

  console.log('\n--- VERIFICATION SUMMARY ---');
  if (allPassed) {
    console.log('ALL TESTS PASSED! Zero intersections, valid hit areas >= 44px, tap strips >= 28px, viewport bounded.');
  } else {
    console.log(`TESTS FAILED: ${failureLog.length} failures encountered.`);
  }
})();
