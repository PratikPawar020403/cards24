const { chromium } = require('C:/Users/prati/.cache/jury/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const outDir = 'C:/Users/prati/.gemini/antigravity/brain/8ba9dd00-fec2-4016-920e-44c60bb11030/results_test';
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

  // Inject proposed resultHTML function and CSS into page
  await page.evaluate(() => {
    // 1. Add CSS
    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
      .modal.results-modal {
        position: fixed;
        inset: 0;
        z-index: 120;
        background: rgba(4, 2, 1, 0.82);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(6px, 2dvh, 16px);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        overflow: hidden;
        box-sizing: border-box;
      }
      .results-sheet {
        width: 100%;
        max-width: clamp(500px, 86vw, 760px);
        max-height: clamp(280px, 92dvh, 560px);
        background: radial-gradient(ellipse at 50% 10%, #24140a 0%, #160b06 65%, #0d0603 100%);
        border: 1.5px solid var(--gold-antique);
        border-radius: 14px;
        box-shadow:
          0 16px 40px rgba(0, 0, 0, 0.85),
          inset 0 0 0 1px rgba(200, 164, 82, 0.25),
          0 0 30px rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding: 0;
        color: #f8f4e6;
        animation: modalEnter 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
      }
      .results-header {
        flex: 0 0 auto;
        padding: clamp(8px, 2dvh, 12px) clamp(12px, 2.5dvw, 20px) clamp(6px, 1.5dvh, 8px);
        background: linear-gradient(180deg, rgba(32, 18, 10, 0.9) 0%, rgba(20, 10, 6, 0.7) 100%);
        border-bottom: 1.5px solid rgba(200, 164, 82, 0.35);
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .results-kicker {
        font-family: var(--font-royal);
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--gold-antique);
        opacity: 0.9;
        line-height: 1;
      }
      .results-winner-banner {
        display: flex;
        align-items: center;
        gap: clamp(8px, 1.6dvw, 12px);
        margin-top: 1px;
      }
      .winner-trophy-wrap {
        width: clamp(26px, 6dvh, 32px);
        height: clamp(26px, 6dvh, 32px);
        min-width: clamp(26px, 6dvh, 32px);
        border-radius: 50%;
        background: radial-gradient(circle at 40% 30%, #3a250e 0%, #1a0e04 100%);
        border: 1.5px solid var(--gold-bright);
        box-shadow: 0 0 10px rgba(245, 212, 136, 0.5), inset 0 1px 2px rgba(255,255,255,0.4);
        display: grid;
        place-items: center;
      }
      .winner-trophy-wrap svg {
        width: 16px;
        height: 16px;
        stroke: var(--gold-bright);
      }
      .winner-title-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }
      .winner-title {
        margin: 0;
        font-family: var(--font-royal);
        font-size: clamp(13px, 3.4dvh, 16px);
        font-weight: 800;
        color: #fff9ea;
        letter-spacing: 0.03em;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
        line-height: 1.2;
      }
      .results-alert {
        font-family: var(--font-royal);
        font-size: 10px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 4px;
        margin-top: 3px;
        line-height: 1.2;
      }
      .results-alert.bad {
        background: rgba(60, 18, 16, 0.85);
        border: 1px solid #9c2828;
        color: #ffb4b4;
      }
      .results-alert.elim {
        background: rgba(45, 25, 10, 0.85);
        border: 1px solid rgba(200, 164, 82, 0.4);
        color: #fce295;
      }
      .results-body {
        flex: 1 1 auto;
        overflow-y: auto;
        overflow-x: hidden;
        padding: clamp(4px, 1.4dvh, 8px) clamp(8px, 2dvw, 16px);
        scrollbar-width: thin;
        scrollbar-color: rgba(200, 164, 82, 0.35) transparent;
      }
      .results-table {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .results-thead {
        display: grid;
        grid-template-columns: minmax(115px, 140px) 1fr 48px 56px;
        align-items: center;
        gap: 8px;
        font-family: var(--font-royal);
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--gold-antique);
        padding: 5px 8px;
        background: rgba(14, 7, 4, 0.65);
        border-radius: 5px;
        border-bottom: 1px solid rgba(200, 164, 82, 0.25);
        box-sizing: border-box;
      }
      .results-thead .th.th-deal, .results-thead .th.th-total {
        justify-content: flex-end;
        text-align: right;
      }
      .results-tbody {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .results-row {
        display: grid;
        grid-template-columns: minmax(115px, 140px) 1fr 48px 56px;
        align-items: center;
        gap: 8px;
        padding: 3px 8px;
        background: rgba(20, 11, 7, 0.55);
        border-radius: 5px;
        border-left: 3px solid transparent;
        border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        box-sizing: border-box;
      }
      .results-row.winner-row {
        background: linear-gradient(90deg, rgba(200, 164, 82, 0.16) 0%, rgba(20, 11, 7, 0.65) 100%);
        border-left: 3px solid var(--gold-bright);
        box-shadow: inset 0 0 12px rgba(200, 164, 82, 0.08);
      }
      .results-row .td {
        display: flex;
        align-items: center;
        min-width: 0;
      }
      .results-row .td.td-player {
        gap: 5px;
      }
      .res-avatar.medallion {
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 50%;
        background: radial-gradient(circle at 40% 35%, #134e38 0%, #0c3826 60%, #062217 100%);
        border: 1px solid rgba(200, 164, 82, 0.55);
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .res-avatar.medallion svg {
        width: 13px;
        height: 13px;
      }
      .td-player-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .td-name-row {
        display: flex;
        align-items: center;
        gap: 3px;
        min-width: 0;
      }
      .td-name {
        font-family: var(--font-royal);
        font-size: 10.5px;
        font-weight: 700;
        color: #f8f4e6;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      }
      .results-row.winner-row .td-name {
        color: var(--gold-bright);
      }
      .chip-host-badge {
        font-family: var(--font-royal);
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        padding: 1px 3px;
        border-radius: 3px;
        background: rgba(40, 30, 15, 0.7);
        color: #dfbd73;
        border: 1px solid rgba(223, 189, 115, 0.4);
        line-height: 1;
        flex-shrink: 0;
      }
      .chip-you-badge {
        font-family: var(--font-royal);
        font-size: 7.5px;
        font-weight: 800;
        letter-spacing: 0.06em;
        padding: 1px 3px;
        border-radius: 3px;
        background: rgba(20, 60, 40, 0.7);
        color: #6ee7b7;
        border: 1px solid rgba(110, 231, 183, 0.4);
        line-height: 1;
        flex-shrink: 0;
      }
      .res-hand-lane {
        display: flex;
        align-items: center;
        gap: 5px;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        padding: 1px 0;
        width: 100%;
      }
      .res-hand-lane::-webkit-scrollbar { display: none; }
      .res-card-group {
        display: inline-flex;
        align-items: center;
        position: relative;
        background: rgba(10, 24, 16, 0.45);
        padding: 1px 3px;
        border-radius: 3px;
        border: 1px solid rgba(200, 164, 82, 0.22);
        flex-shrink: 0;
      }
      .res-card-group.leftover {
        background: rgba(45, 18, 14, 0.45);
        border-color: rgba(180, 60, 50, 0.35);
      }
      .res-card-group .card.small:not(:first-child) {
        margin-left: calc(var(--cw, 25px) * -0.52);
        box-shadow: -1px 0 3px rgba(0,0,0,0.4) !important;
      }
      .td-dropped-pill {
        font-family: var(--font-royal);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 2px 6px;
        border-radius: 99px;
        background: rgba(60, 20, 20, 0.7);
        border: 1px solid rgba(180, 60, 60, 0.4);
        color: #ff9b9b;
      }
      .results-row .td.td-deal, .results-row .td.td-total {
        justify-content: flex-end;
      }
      .deal-pts {
        font-family: var(--font-royal);
        font-size: 11px;
        font-weight: 800;
        color: #ff9b9b;
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .deal-pts.zero {
        color: var(--gold-bright);
      }
      .total-pts {
        font-family: var(--font-royal);
        font-size: 11px;
        font-weight: 800;
        color: var(--gold-antique);
        font-variant-numeric: tabular-nums;
        line-height: 1;
      }
      .results-footer {
        flex: 0 0 auto;
        padding: clamp(6px, 1.8dvh, 10px) clamp(12px, 2.5dvw, 20px);
        background: linear-gradient(180deg, rgba(20, 10, 6, 0.7) 0%, rgba(14, 7, 4, 0.95) 100%);
        border-top: 1.5px solid rgba(200, 164, 82, 0.25);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: clamp(6px, 1.4dvw, 10px);
        flex-wrap: wrap;
      }
      .results-btn {
        height: clamp(26px, 6.2dvh, 32px);
        padding: 0 clamp(10px, 1.8dvw, 16px);
        font-size: clamp(10px, 2.4dvh, 11.5px);
        font-weight: 800;
        letter-spacing: 0.06em;
      }
      .results-waiting-note {
        font-family: var(--font-royal);
        font-size: 10.5px;
        font-weight: 600;
        color: var(--gold-antique);
        font-style: italic;
      }

      /* Card Small Refinement */
      .card.small {
        --cw: clamp(24px, 3.2vw, 28px) !important;
        --ch: calc(var(--cw) * 1.42) !important;
        width: var(--cw) !important;
        height: var(--ch) !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
        border-width: 1px !important;
        border-radius: calc(var(--cw) * 0.085) !important;
      }
      .card.small .tl {
        left: calc(var(--cw) * .07);
        top: calc(var(--cw) * .04);
      }
      .card.small .tl b {
        font-size: calc(var(--cw) * .32);
      }
      .card.small .ci {
        width: calc(var(--cw) * .23);
        height: calc(var(--cw) * .23);
      }
      .card.small .br { display: none !important; }
      .card.small .art { display: block !important; }
      .card.small .rk-letter { font-size: 32px !important; }
    `;
    document.head.appendChild(styleEl);

    // 2. Set up game state
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
    const players = {
      u_p1: { uid: 'u_p1', name: 'Wow', joinedAt: Date.now() },
      u_b1: { uid: 'u_b1', name: 'Aarav (bot)', bot: true },
      u_b2: { uid: 'u_b2', name: 'Kavya (bot)', bot: true },
      u_b3: { uid: 'u_b3', name: 'Rohan (bot)', bot: true },
      u_b4: { uid: 'u_b4', name: 'Meera (bot)', bot: true },
      u_b5: { uid: 'u_b5', name: 'Vikram (bot)', bot: true }
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

  // Now replace resultHTML rendering with new function
  await page.evaluate(() => {
    const SILHOUETTE_SVG = '<svg class="sil-icon" viewBox="0 0 24 24" width="22" height="22"><path fill="rgba(248,244,230,0.85)" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
    const TROPHY_SVG = '<svg viewBox="0 0 24 24" class="hdr-ico" width="20" height="20" fill="none" stroke="#e6c678" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>';

    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function cardHTML(id, extra) {
      const L = window.RummyLogic;
      if (id == null || !L.INFO[id]) return '<div class="card" style="opacity:.2"></div>';
      const c = L.INFO[id], wild = window.__RR.S ? window.__RR.S.wild : 0;
      const isWild = !c.joker && wild > 0 && c.rank === wild;
      const cls = (extra || '');
      if (window.RummyCards) return window.RummyCards.cardHTML(id, c, { wild: isWild, cls: cls.trim() });
      return '<div class="card"><span class="tl">' + L.RANK_LBL[c.rank] + '</span></div>';
    }

    const S = window.__RR.S;
    const R = S.result;
    const players = window.__RR.players;
    const me = window.__RR.me;
    const room = window.__RR.room;
    const host = (room.host === me.uid || room.hostId === me.uid);

    const winnerUid = R.winner;
    const wPlayer = players[winnerUid] || { name: 'Player' };
    const wIsBot = !!wPlayer.bot || /\(bot\)/i.test(wPlayer.name || '');
    const wIsMe = (winnerUid === me.uid);
    const wRawName = (wPlayer.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
    const wDisplayName = wIsMe ? 'You' : wRawName;
    const wTitle = R.gameOver ? (wDisplayName + ' wins the game!') : (wDisplayName + ' won the deal');

    const wrongNotice = R.wrongDeclarer ?
      '<div class="results-alert bad">⚠️ ' + esc(players[R.wrongDeclarer]?.name || 'Player') + ' made an invalid declaration (+80 penalty points).</div>' : '';
    const elimNotice = (R.elim && R.elim.length) ?
      '<div class="results-alert elim">Eliminated: ' + R.elim.map(u => esc(players[u]?.name || 'Player')).join(', ') + '</div>' : '';

    const order = S.order.slice().sort((a, b) => {
      if (a === R.winner) return -1;
      if (b === R.winner) return 1;
      return (R.points[a] || 0) - (R.points[b] || 0);
    });

    const rows = order.map((u, ri) => {
      const p = players[u] || { name: 'Player' };
      const isBot = !!p.bot || /\(bot\)/i.test(p.name || '');
      const isMe = (u === me.uid);
      const isPlayerHost = (room && (room.host === u || room.hostId === u));
      const rawName = (p.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
      const shortName = rawName.length > 9 ? rawName.slice(0, 8) + '…' : rawName;

      const g = R.groups && R.groups[u];
      let handHTML = '';
      if (g) {
        const groupCards = (g.groups || []).map(ids => {
          return '<div class="res-card-group meld">' +
            ids.map(id => cardHTML(id, 'small')).join('') +
          '</div>';
        }).join('');

        const leftoverCards = (g.leftover && g.leftover.length) ?
          '<div class="res-card-group leftover" title="Unmatched Cards">' +
            g.leftover.map(id => cardHTML(id, 'small')).join('') +
          '</div>' : '';

        handHTML = '<div class="res-hand-lane">' + groupCards + leftoverCards + '</div>';
      } else {
        handHTML = '<div class="res-hand-lane"><span class="td-dropped-pill">Dropped</span></div>';
      }

      const pts = R.points[u] !== undefined ? R.points[u] : 0;
      const tot = (R.totals && R.totals[u] !== undefined) ? R.totals[u] : pts;
      const isWinner = (u === R.winner);

      return '<div class="results-row' + (isWinner ? ' winner-row' : '') + '">' +
        '<div class="td td-player">' +
          '<div class="res-avatar medallion">' + SILHOUETTE_SVG + '</div>' +
          '<div class="td-player-info">' +
            '<div class="td-name-row">' +
              '<span class="td-name" title="' + esc(rawName) + '">' + esc(shortName) + '</span>' +
              (isBot ? '<span class="chip-bot-badge">BOT</span>' : '') +
              (isPlayerHost ? '<span class="chip-host-badge">HOST</span>' : '') +
              (isMe ? '<span class="chip-you-badge">YOU</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="td td-hand">' + handHTML + '</div>' +
        '<div class="td td-deal"><span class="deal-pts' + (isWinner ? ' zero' : '') + '">' + (isWinner ? '0' : '+' + pts) + '</span></div>' +
        '<div class="td td-total"><span class="total-pts">' + tot + '</span></div>' +
      '</div>';
    }).join('');

    const btns = host
      ? (R.gameOver
          ? '<button class="btn gold results-btn" data-a="lobby">New game</button>'
          : '<button class="btn gold results-btn" data-a="next">Next deal</button><button class="btn results-btn" data-a="lobby">Back to lobby</button>')
      : '<span class="results-waiting-note">Waiting for host…</span>';

    const modalHTML = '<div class="modal results-modal">' +
      '<div class="sheet results-sheet">' +
        '<div class="results-header">' +
          '<div class="results-kicker">DEAL COMPLETED · ROUND RESULTS</div>' +
          '<div class="results-winner-banner">' +
            '<div class="winner-trophy-wrap">' + TROPHY_SVG + '</div>' +
            '<div class="winner-text-wrap">' +
              '<div class="winner-title-row">' +
                '<h2 class="winner-title">' + esc(wTitle) + '</h2>' +
                (wIsBot ? '<span class="chip-bot-badge">BOT</span>' : '') +
                (wIsMe ? '<span class="chip-you-badge">YOU</span>' : '') +
              '</div>' +
            '</div>' +
          '</div>' +
          wrongNotice + elimNotice +
        '</div>' +
        '<div class="results-body">' +
          '<div class="results-table">' +
            '<div class="results-thead">' +
              '<div class="th th-player">Player</div>' +
              '<div class="th th-hand">Final hand</div>' +
              '<div class="th th-deal">Deal</div>' +
              '<div class="th th-total">Total</div>' +
            '</div>' +
            '<div class="results-tbody">' + rows + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="results-footer">' +
          '<button class="btn ghost results-btn" data-a="closeres">View table</button>' +
          '<button class="btn results-btn" data-a="scores">Scoreboard</button>' +
          btns +
        '</div>' +
      '</div>' +
    '</div>';

    // Replace the existing modal in DOM
    const oldModal = document.querySelector('.modal');
    if (oldModal) oldModal.outerHTML = modalHTML;
    else document.body.insertAdjacentHTML('beforeend', modalHTML);
  });
  await page.waitForTimeout(80);

  const sc1 = path.join(outDir, '01_results_844x390_landscape.png');
  await page.screenshot({ path: sc1 });
  console.log('Saved:', sc1);

  // Test other viewports
  await page.setViewportSize({ width: 640, height: 360 });
  await page.waitForTimeout(60);
  const sc2 = path.join(outDir, '02_results_640x360_compact.png');
  await page.screenshot({ path: sc2 });
  console.log('Saved:', sc2);

  await page.setViewportSize({ width: 932, height: 430 });
  await page.waitForTimeout(60);
  const sc3 = path.join(outDir, '03_results_932x430_modern.png');
  await page.screenshot({ path: sc3 });
  console.log('Saved:', sc3);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(60);
  const sc4 = path.join(outDir, '04_results_1440x900_desktop.png');
  await page.screenshot({ path: sc4 });
  console.log('Saved:', sc4);

  await browser.close();
  console.log('All results screenshots captured successfully!');
})();
