const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030';
const CHROME_PATH = 'C:/Users/prati/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

async function generateShowcases() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  const cardsCss = fs.readFileSync(path.join(__dirname, 'cards.css'), 'utf8');
  const cardsJs = fs.readFileSync(path.join(__dirname, 'cards.js'), 'utf8');
  const logicJs = fs.readFileSync(path.join(__dirname, 'logic.js'), 'utf8');

  // Generate showcase HTML
  function buildShowcaseHTML(cardWidth, deckStyle) {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap">
<style>
${cardsCss}
body {
  margin: 0;
  padding: 24px;
  background: #182026;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
h2 {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: #e5b044;
  letter-spacing: .05em;
}
.grid {
  display: grid;
  grid-template-columns: repeat(14, auto);
  gap: 10px;
  align-items: start;
}
.grid-wrap {
  --cw: ${cardWidth}px;
  --ch: calc(var(--cw) * 1.42);
}
.label {
  grid-column: 1 / -1;
  font-weight: bold;
  font-size: 13px;
  margin-top: 14px;
  color: #a0aec0;
}
</style>
</head>
<body ${deckStyle === 'four' ? 'data-deck="four"' : ''}>
<div class="grid-wrap">
  <h2>Cards24 Vector Card Artwork Showcase — ${cardWidth}px width (${deckStyle === 'four' ? 'Four-Colour Mode' : 'Classic Mode'})</h2>
  <div class="grid" id="deck-grid"></div>
</div>
<script>
${cardsJs}
${logicJs}
const grid = document.getElementById('deck-grid');
RummyCards.setBack('coral');

// Render 4 suits (Spades=0, Hearts=1, Diamonds=2, Clubs=3) x 13 ranks
const suits = ['♠ Spades', '♥ Hearts', '♦ Diamonds', '♣ Clubs'];
for (let s = 0; s < 4; s++) {
  const lbl = document.createElement('div');
  lbl.className = 'label';
  lbl.textContent = suits[s];
  grid.appendChild(lbl);
  for (let r = 1; r <= 13; r++) {
    // ID in deck 1: s * 13 + (r - 1)
    const id = s * 13 + (r - 1);
    const wrap = document.createElement('div');
    wrap.innerHTML = RummyCards.cardHTML(id, { joker: false, suit: s, rank: r }, {});
    grid.appendChild(wrap.firstElementChild);
  }
}

// Special cards: Joker, Wild Card, 3 Backs
const specLbl = document.createElement('div');
specLbl.className = 'label';
specLbl.textContent = 'Special Cards & Backs (Joker, Wild 6♥, Backs: Coral, Navy, Teal)';
grid.appendChild(specLbl);

// Joker
const jWrap = document.createElement('div');
jWrap.innerHTML = RummyCards.cardHTML(52, { joker: true, suit: -1, rank: 0 }, {});
grid.appendChild(jWrap.firstElementChild);

// Wild 6 of Hearts
const wWrap = document.createElement('div');
wWrap.innerHTML = RummyCards.cardHTML(18, { joker: false, suit: 1, rank: 6 }, { wild: true });
grid.appendChild(wWrap.firstElementChild);

// Backs
['coral', 'navy', 'teal'].forEach(t => {
  const b = document.createElement('div');
  b.className = 'back';
  b.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(RummyCards.backSVG(t)) + '")';
  grid.appendChild(b);
});
</script>
</body>
</html>`;
  }

  // 1. Render showcases at 36px, 46px, 74px
  const sizes = [36, 46, 74];
  for (const w of sizes) {
    const page = await browser.newPage({
      viewport: { width: Math.max(1050, w * 15 + 100), height: Math.max(650, w * 8 + 200) },
      deviceScaleFactor: 2
    });
    const html = buildShowcaseHTML(w, 'classic');
    await page.setContent(html, { waitUntil: 'networkidle' });
    const outPath = path.join(ARTIFACT_DIR, `showcase_cards_${w}px.png`);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved showcase_${w}px to ${outPath}`);
    await page.close();
  }

  // 2. Render four-colour mode showcase
  {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 750 },
      deviceScaleFactor: 2
    });
    const html = buildShowcaseHTML(54, 'four');
    await page.setContent(html, { waitUntil: 'networkidle' });
    const outPath = path.join(ARTIFACT_DIR, 'showcase_four_colour.png');
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved showcase_four_colour to ${outPath}`);
    await page.close();
  }

  // 3. Render 13-card hand in game table at 640x270 phone landscape
  {
    const page = await browser.newPage({
      viewport: { width: 640, height: 270 },
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true
    });
    const gameUrl = 'file:///' + path.join(__dirname, 'Rummy.html').replace(/\\/g, '/');
    await page.goto(gameUrl);
    await page.waitForSelector('#app', { timeout: 5000 });

    // Initialize clean game state
    await page.evaluate(() => {
      const L = window.RummyLogic;
      const me = window.__RR.me;
      me.uid = 'u_p1';
      me.name = 'Pratik';
      window.__RR.code = 'DEMO';
      window.__RR.room = { code: 'DEMO', hostId: 'u_p1', status: 'playing', mode: 'points', turnSecs: 30 };
      const uids = ['u_p1', 'bot_1', 'bot_2', 'bot_3'];
      const players = {
        u_p1: { uid: 'u_p1', name: 'Pratik', joinedAt: Date.now() },
        bot_1: { uid: 'bot_1', name: 'Aarav (bot)', bot: true },
        bot_2: { uid: 'bot_2', name: 'Kavya (bot)', bot: true },
        bot_3: { uid: 'bot_3', name: 'Rohan (bot)', bot: true }
      };
      window.__RR.players = players;
      const deal = L.newDeal({ order: uids, round: 0, mode: 'points', baseTotals: {}, now: Date.now() });
      deal.phase = 'play';
      deal.stage = 'draw';
      deal.turn = 'u_p1';
      deal.startedAt = Date.now() - 5000;
      deal.turnN = 1;
      deal.discard = [18]; // 6 of Hearts
      deal.wild = 6;      // 6 is wild rank
      deal.cut = 18;      // Cut card 6 of Hearts
      window.__RR.S = deal;
      window.__RR.renderRoom();
      window.__RR.fitHand();
    });

    await page.waitForTimeout(400);

    const outPath = path.join(ARTIFACT_DIR, 'table_640x270_new_cards.png');
    await page.screenshot({ path: outPath });
    console.log(`Saved table_640x270_new_cards to ${outPath}`);

    // Tap to select a card in hand
    const cardEl = await page.$('#hand .card');
    if (cardEl) {
      const box = await cardEl.boundingBox();
      await page.touchscreen.tap(box.x + 12, box.y + box.height / 2);
      await page.waitForTimeout(200);
      const isSel = await cardEl.evaluate(el => el.classList.contains('sel'));
      console.log('Touch tap card selection verified:', isSel);
      const selPath = path.join(ARTIFACT_DIR, 'table_640x270_card_selected.png');
      await page.screenshot({ path: selPath });
      console.log(`Saved table_640x270_card_selected to ${selPath}`);
    }

    await page.close();
  }

  await browser.close();
  console.log('All card showcases and gameplay verification screenshots generated successfully!');
}

generateShowcases().catch(err => {
  console.error('Error generating showcases:', err);
  process.exit(1);
});
