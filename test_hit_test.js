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

const PLAYER_COUNTS = [2, 4, 6];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });

  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');
  let totalHitTests = 0;
  let totalFailures = 0;
  const failureDetails = [];

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, hasTouch: true });
    await page.goto(fileUrl);

    for (const pCount of PLAYER_COUNTS) {
      await page.evaluate(({ pCount }) => {
        const L = window.RummyLogic;
        const me = window.__RR.me;
        me.uid = 'u_p1';
        me.name = 'Pratik';
        window.__RR.code = 'TEST';
        window.__RR.room = { code: 'TEST', hostId: 'u_p1', status: 'playing', mode: 'points', turnSecs: 30 };
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
        deal.startedAt = Date.now() - 20000;
        deal.turnN = 1;
        window.__RR.S = deal;
        window.__RR.renderRoom();
        window.__RR.fitHand();
      }, { pCount });

      await page.waitForTimeout(60);

      const res = await page.evaluate(() => {
        const items = [];
        const actions = [
          '.pile[data-a="stock"]',
          '.pile[data-a="pickup"]',
          '.finish-pile[data-a="finish"]',
          '[data-a="declare"]',
          '[data-a="discard"]',
          '[data-a="drop"]',
          '[data-a="group"]',
          '[data-a="sort"]',
          '[data-a="auto"]',
          '[data-a="copy"]',
          '[data-a="react"]',
          '[data-a="fullscreen"]',
          '[data-a="menu"]'
        ];
        actions.forEach(sel => {
          const el = document.querySelector(sel);
          if (el) items.push({ desc: sel, el });
        });

        // Every card in hand
        const cards = document.querySelectorAll('#hand .card');
        cards.forEach((c, idx) => {
          items.push({ desc: `Hand card #${idx} (id: ${c.dataset.card})`, el: c });
        });

        const issues = [];
        items.forEach(({ desc, el }) => {
          const r = el.getBoundingClientRect();
          const cx = Math.floor(r.left + r.width / 2);
          const cy = Math.floor(r.top + r.height / 2);
          const topEl = document.elementFromPoint(cx, cy);
          if (!topEl) {
            issues.push({ desc, error: 'elementFromPoint returned null', cx, cy, r: { left: r.left, top: r.top, w: r.width, h: r.height } });
            return;
          }
          if (topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
            issues.push({
              desc,
              error: 'Obstructed by ' + topEl.tagName + (topEl.className ? '.' + topEl.className : ''),
              cx, cy,
              topElOuter: topEl.outerHTML.slice(0, 100)
            });
          }
        });
        return { issues, count: items.length };
      });

      totalHitTests += res.count;
      if (res.issues.length > 0) {
        totalFailures += res.issues.length;
        failureDetails.push({ vp: vp.label, pCount, issues: res.issues });
      }
    }
    await page.close();
  }

  console.log('\n========================================');
  console.log('       HIT-TEST VERIFICATION           ');
  console.log('========================================');
  console.log(`Total actionable elements hit-tested: ${totalHitTests}`);
  console.log(`Failed hit-tests: ${totalFailures}`);

  if (failureDetails.length > 0) {
    console.log('\nFailures breakdown:');
    failureDetails.forEach(f => {
      console.log(`Viewport: ${f.vp}, Players: ${f.pCount}`);
      f.issues.forEach(iss => console.log(`  - ${iss.desc}: ${iss.error} at (${iss.cx}, ${iss.cy})`));
    });
  } else {
    console.log('Result: 100% of actionable elements directly reachable at center via document.elementFromPoint across all viewports & player counts!');
  }

  await browser.close();
})();
