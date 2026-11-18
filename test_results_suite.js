const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const outDir = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/results_redesign';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

let passedTests = 0;
let failedTests = 0;

function assert(condition, desc) {
  if (condition) {
    console.log(`[PASS] ${desc}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${desc}`);
    failedTests++;
  }
}

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe',
    headless: true
  });
  const fileUrl = 'file:///' + path.resolve('Rummy.html').replace(/\\/g, '/');

  console.log('--- STARTING CARDS24 RESULTS SCREEN TEST SUITE ---');

  // Test Case 1: 6-Player Game with Bot Winner (Aarav) at 844x390
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await page.goto(fileUrl);

  await page.evaluate(() => {
    window.__RR.me = { uid: 'u_p1', name: 'Wow' };
    window.__RR.code = 'YCMT';
    window.__RR.room = {
      code: 'YCMT',
      status: 'playing',
      mode: 'points',
      turnSec: 30,
      host: 'u_p1',
      hostId: 'u_p1',
      back: 'emerald',
      felt: 'emerald',
      deck: 'classic'
    };
    const now = Date.now();
    const players = {
      u_p1: { uid: 'u_p1', name: 'Wow', joinedAt: now },
      u_b1: { uid: 'u_b1', name: 'Aarav (bot)', bot: true, joinedAt: now + 1 },
      u_b2: { uid: 'u_b2', name: 'Kavya (bot)', bot: true, joinedAt: now + 2 },
      u_b3: { uid: 'u_b3', name: 'Rohan (bot)', bot: true, joinedAt: now + 3 },
      u_b4: { uid: 'u_b4', name: 'Meera (bot)', bot: true, joinedAt: now + 4 },
      u_b5: { uid: 'u_b5', name: 'Vikram (bot)', bot: true, joinedAt: now + 5 }
    };
    window.__RR.players = players;

    const L = window.RummyLogic;
    const uids = Object.keys(players);
    const deal = L.newDeal({ order: uids, round: 1, mode: 'points', baseTotals: {}, now: Date.now() });

    deal.phase = 'ended';
    deal.round = 1;
    deal.result = {
      winner: 'u_b1',
      points: { u_b1: 0, u_p1: 24, u_b2: 45, u_b3: 16, u_b4: 80, u_b5: 32 },
      totals: { u_b1: 0, u_p1: 24, u_b2: 45, u_b3: 16, u_b4: 80, u_b5: 32 },
      groups: {
        u_b1: {
          groups: [
            [0, 1, 2],       // A-2-3 of spades
            [13, 14, 15, 16],// 4-5-6-7 of spades
            [26, 39, 52]     // Kings
          ],
          leftover: []
        },
        u_p1: {
          groups: [
            [3, 4, 5],
            [17, 18, 19]
          ],
          leftover: [10, 11, 24, 25]
        },
        u_b2: {
          groups: [[28, 29, 30]],
          leftover: [35, 36, 48, 49, 50]
        },
        u_b3: {
          groups: [[7, 8, 9], [20, 21, 22]],
          leftover: [31]
        },
        u_b4: null, // dropped
        u_b5: {
          groups: [[40, 41, 42]],
          leftover: [44, 45, 51]
        }
      },
      elim: [],
      gameOver: false
    };

    window.__RR.S = deal;
    window.__RR.renderRoom();
  });
  await page.waitForTimeout(100);

  // Assertions for Test Case 1
  const audit1 = await page.evaluate(() => {
    const modal = document.querySelector('.modal.results-modal');
    const thead = document.querySelector('.results-thead');
    const winnerTitle = document.querySelector('.winner-title')?.textContent;
    const winnerBotBadge = document.querySelector('.results-winner-banner .chip-bot-badge')?.textContent;
    const rows = document.querySelectorAll('.results-row');
    const winnerRow = document.querySelector('.results-row.winner-row');
    const cardGroups = document.querySelectorAll('.res-card-group');
    const cards = document.querySelectorAll('.res-card-group .card.small');
    const droppedPill = document.querySelector('.td-dropped-pill')?.textContent;
    const btns = Array.from(document.querySelectorAll('.results-footer .btn')).map(b => b.textContent.trim());

    // Check no vertical card stacking: cards in each group should have same offsetTop
    const firstGroupCards = document.querySelectorAll('.results-row:first-child .res-card-group:first-child .card.small');
    const firstGroupTops = Array.from(firstGroupCards).map(c => c.offsetTop);
    const allSameTop = firstGroupTops.every(t => t === firstGroupTops[0]);

    return {
      hasModal: !!modal,
      theadText: thead ? thead.innerText.replace(/\s+/g, ' ').trim() : '',
      winnerTitle,
      winnerBotBadge,
      rowsCount: rows.length,
      hasWinnerRow: !!winnerRow,
      cardGroupsCount: cardGroups.length,
      cardsCount: cards.length,
      droppedPill,
      btns,
      allSameTop,
      hasRawBotString: document.body.innerText.indexOf('(bot)') !== -1,
      hasMergedHeading: document.body.innerText.indexOf('PlayerFinal handDealTotal') !== -1
    };
  });

  assert(audit1.hasModal, 'Results modal is mounted');
  assert(audit1.theadText.includes('PLAYER') && audit1.theadText.includes('FINAL HAND') && audit1.theadText.includes('DEAL') && audit1.theadText.includes('TOTAL'), 'Results table has separated column headings: ' + audit1.theadText);
  assert(!audit1.hasMergedHeading, 'No merged PlayerFinal handDealTotal string present');
  assert(audit1.winnerTitle === 'Aarav won the deal', 'Winner title is formatted correctly: ' + audit1.winnerTitle);
  assert(audit1.winnerBotBadge === 'BOT', 'Winner has BOT text badge');
  assert(!audit1.hasRawBotString, 'No raw "(bot)" string in rendered text');
  assert(audit1.rowsCount === 6, '6 player rows rendered');
  assert(audit1.hasWinnerRow, 'Winner row is highlighted');
  assert(audit1.allSameTop, 'Cards in group are laid out horizontally on same top line (not vertically stacked)');
  assert(audit1.droppedPill === 'Dropped', 'Dropped player displays Dropped pill');
  assert(audit1.btns.includes('View table') && audit1.btns.includes('Scoreboard') && audit1.btns.includes('Next deal'), 'All expected buttons rendered: ' + audit1.btns.join(', '));

  const sc1 = path.join(outDir, '01_results_844x390_bot_win_6p.png');
  await page.screenshot({ path: sc1 });
  console.log('Saved screenshot 1:', sc1);

  // Test Case 2: Human Player (Wow) Winning 4-Player Game at 844x390
  await page.evaluate(() => {
    window.__RR.S.result = {
      winner: 'u_p1',
      points: { u_p1: 0, u_b1: 35, u_b2: 48, u_b3: 20 },
      totals: { u_p1: 12, u_b1: 55, u_b2: 93, u_b3: 36 },
      groups: {
        u_p1: {
          groups: [
            [0, 1, 2, 3],
            [14, 15, 16],
            [27, 40, 53]
          ],
          leftover: []
        },
        u_b1: {
          groups: [[4, 5, 6]],
          leftover: [18, 19, 32]
        },
        u_b2: {
          groups: [[30, 31, 32]],
          leftover: [44, 45, 46, 47]
        },
        u_b3: {
          groups: [[8, 9, 10]],
          leftover: [21, 22]
        }
      },
      elim: [],
      gameOver: false
    };
    window.__RR.S.order = ['u_p1', 'u_b1', 'u_b2', 'u_b3'];
    window.__RR.renderRoom();
  });
  await page.waitForTimeout(80);

  const audit2 = await page.evaluate(() => {
    const winnerTitle = document.querySelector('.winner-title')?.textContent;
    const winnerYouBadge = document.querySelector('.results-winner-banner .chip-you-badge')?.textContent;
    const rows = document.querySelectorAll('.results-row');
    return { winnerTitle, winnerYouBadge, rowsCount: rows.length };
  });

  assert(audit2.winnerTitle === 'You won the deal', 'Human winner title displays "You won the deal": ' + audit2.winnerTitle);
  assert(audit2.winnerYouBadge === 'YOU', 'Winner banner displays YOU badge');
  assert(audit2.rowsCount === 4, '4 player rows rendered');

  const sc2 = path.join(outDir, '02_results_844x390_human_win_4p.png');
  await page.screenshot({ path: sc2 });
  console.log('Saved screenshot 2:', sc2);

  // Test Case 3: Wrong Declaration Penalty Notice
  await page.evaluate(() => {
    window.__RR.S.result.wrongDeclarer = 'u_b2';
    window.__RR.renderRoom();
  });
  await page.waitForTimeout(80);

  const auditWrong = await page.evaluate(() => {
    const alert = document.querySelector('.results-alert.bad')?.textContent;
    return alert;
  });
  assert(auditWrong && auditWrong.includes('invalid declaration (+80 penalty points)'), 'Wrong declaration penalty notice rendered: ' + auditWrong);

  const scWrong = path.join(outDir, '07_results_wrong_declaration_notice.png');
  await page.screenshot({ path: scWrong });
  console.log('Saved screenshot 7 (wrong declaration):', scWrong);

  // Reset to 6p for multi-viewport audits
  await page.evaluate(() => {
    window.__RR.S.result.wrongDeclarer = null;
    window.__RR.S.order = ['u_p1', 'u_b1', 'u_b2', 'u_b3', 'u_b4', 'u_b5'];
    window.__RR.renderRoom();
  });

  // Viewport Audits: 640x360, 932x430, 1024x768, 1440x900
  const viewports = [
    { w: 640, h: 360, name: '03_results_640x360_compact.png', label: '640x360 Compact Mobile' },
    { w: 932, h: 430, name: '04_results_932x430_modern.png', label: '932x430 Modern Mobile' },
    { w: 1024, h: 768, name: '05_results_1024x768_tablet.png', label: '1024x768 Tablet' },
    { w: 1440, h: 900, name: '06_results_1440x900_desktop.png', label: '1440x900 Desktop' }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(80);

    const vpAudit = await page.evaluate(() => {
      const sheet = document.querySelector('.results-sheet');
      const r = sheet.getBoundingClientRect();
      const el = document.scrollingElement;
      return {
        fitsWidth: r.width <= window.innerWidth,
        fitsHeight: r.height <= window.innerHeight,
        hScroll: el.scrollWidth > el.clientWidth,
        vScroll: el.scrollHeight > el.clientHeight
      };
    });

    assert(vpAudit.fitsWidth && vpAudit.fitsHeight, `${vp.label}: results sheet fits within viewport (${vp.w}x${vp.h})`);
    assert(!vpAudit.hScroll && !vpAudit.vScroll, `${vp.label}: no document scrollbars created`);

    const scPath = path.join(outDir, vp.name);
    await page.screenshot({ path: scPath });
    console.log(`Saved screenshot ${vp.label}:`, scPath);
  }

  // Interactive Button Tests
  console.log('\n--- INTERACTIVE ACTIONS AUDIT ---');
  // 1. Click Scoreboard
  await page.click('.results-footer [data-a="scores"]');
  await page.waitForTimeout(80);
  const scoresModalVisible = await page.evaluate(() => !!document.querySelector('[data-a="closescores"]'));
  assert(scoresModalVisible, 'Clicking Scoreboard button opened Scores dialog');
  await page.click('.sheet button[data-a="closescores"]');
  await page.waitForTimeout(80);

  // 2. Click View Table
  await page.click('.results-footer [data-a="closeres"]');
  await page.waitForTimeout(80);
  const resultsDismissed = await page.evaluate(() => !document.querySelector('.results-modal'));
  assert(resultsDismissed, 'Clicking "View table" dismissed the results modal to inspect the table');

  // 3. Click Next Deal (reopen modal by clearing dismissed, then click Next deal)
  await page.evaluate(async () => {
    window.__RR.dismissed = '';
    window.__RR.S.phase = 'ended';
    if (window.__RR.db) {
      await window.__RR.db.doc('rooms/' + window.__RR.code).set(window.__RR.room);
      await window.__RR.db.doc('rooms/' + window.__RR.code + '/game/state').set(window.__RR.S);
      for (const uid of Object.keys(window.__RR.players)) {
        await window.__RR.db.doc('rooms/' + window.__RR.code + '/players/' + uid).set(window.__RR.players[uid]);
      }
    }
    window.__RR.renderRoom();
  });
  await page.waitForTimeout(80);
  const resultsReopened = await page.evaluate(() => !!document.querySelector('.results-modal'));
  assert(resultsReopened, 'Results modal visible again');

  await page.click('.results-footer [data-a="next"]');
  await page.waitForTimeout(200);
  const nextDealStarted = await page.evaluate(() => window.__RR.S && window.__RR.S.phase === 'play');
  assert(nextDealStarted, 'Clicking "Next deal" advanced game into new deal (phase === "play")');

  await browser.close();

  console.log(`\n========================================`);
  console.log(`RESULTS SUITE SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log(`========================================`);
})();
