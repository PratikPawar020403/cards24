(function () {
  'use strict';
  var L = window.RummyLogic;
  var $app = document.getElementById('app');

  /* ================= helpers ================= */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage may be blocked */ } }
  function rid(n) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = ''; for (var i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function toast(msg, info) {
    var el = document.createElement('div');
    el.className = 'toast' + (info ? ' info' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ================= sound ================= */
  var audio = null, muted = lsGet('rr-muted') === '1';
  function sfx(kind) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var notes = { draw: [[520, .05]], discard: [[330, .06]], turn: [[660, .08], [880, .1]], win: [[523, .12], [659, .12], [784, .12], [1047, .25]], err: [[180, .15]] }[kind] || [];
      var t = audio.currentTime;
      notes.forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = kind === 'err' ? 'sawtooth' : 'triangle'; o.frequency.value = n[0];
        g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.12, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + n[1]);
        o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + n[1] + .02); t += n[1] * .9;
      });
    } catch (e) { /* audio is optional */ }
  }

  /* ================= in-memory db (offline / same-browser play) ================= */
  function MemDB() {
    var docs = new Map(), subs = new Set(), ch = null;
    try { ch = new BroadcastChannel('rummy-mem-v1'); } catch (e) { ch = null; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function parent(p) { return p.slice(0, p.lastIndexOf('/')); }
    function snap(p) { var d = docs.get(p); return { id: p.split('/').pop(), exists: d !== undefined, data: function () { return d === undefined ? undefined : clone(d); }, metadata: { fromCache: false, hasPendingWrites: false } }; }
    function colSnap(c) {
      var keys = []; docs.forEach(function (v, k) { if (parent(k) === c) keys.push(k); });
      keys.sort(); var ds = keys.map(snap);
      return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    function notify(p) { subs.forEach(function (s) { if (s.kind === 'doc' && s.path === p) s.fn(snap(p)); else if (s.kind === 'col' && s.path === parent(p)) s.fn(colSnap(s.path)); }); }
    function write(p, data, bc) {
      if (data === null) docs.delete(p); else docs.set(p, clone(data));
      notify(p);
      if (bc !== false && ch) ch.postMessage({ t: 'w', p: p, d: data });
    }
    if (ch) {
      ch.onmessage = function (e) {
        var m = e.data;
        if (m.t === 'w') write(m.p, m.d, false);
        else if (m.t === 'hello') ch.postMessage({ t: 'dump', docs: Array.from(docs.entries()) });
        else if (m.t === 'dump') m.docs.forEach(function (kv) { if (!docs.has(kv[0])) write(kv[0], kv[1], false); });
      };
      ch.postMessage({ t: 'hello' });
    }
    function sub(kind, path, fn) { var s = { kind: kind, path: path, fn: fn }; subs.add(s); setTimeout(function () { if (subs.has(s)) fn(kind === 'doc' ? snap(path) : colSnap(path)); }, 0); return function () { subs.delete(s); }; }
    function doc(path) {
      return {
        id: path.split('/').pop(), path: path,
        get: function () { return Promise.resolve(snap(path)); },
        set: function (d) { write(path, d); return Promise.resolve(); },
        update: function (d) { var cur = docs.get(path); if (cur === undefined) return Promise.reject({ code: 'invalid_argument' }); write(path, Object.assign({}, cur, d)); return Promise.resolve(); },
        delete: function () { write(path, null); return Promise.resolve(); },
        onSnapshot: function (fn) { return sub('doc', path, fn); }
      };
    }
    function collection(path) {
      return {
        path: path, doc: function (id) { return doc(path + '/' + (id || rid(12))); },
        get: function () { return Promise.resolve(colSnap(path)); },
        onSnapshot: function (fn) { return sub('col', path, fn); }
      };
    }
    return { doc: doc, collection: collection };
  }

  /* ================= realtime websocket db (online multiplayer) ================= */
  function SocketDB(url) {
    var docs = new Map(), subs = new Set(), ws = null, pingTimer = null, isConnected = false;
    var reqSeq = 0, pending = new Map(), writeQueue = [];

    function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
    function parent(p) { return p.slice(0, p.lastIndexOf('/')); }
    function snap(p) {
      var d = docs.get(p);
      return { id: p.split('/').pop(), exists: d !== undefined, data: function () { return d === undefined ? undefined : clone(d); }, metadata: { fromCache: false, hasPendingWrites: false } };
    }
    function colSnap(c) {
      var keys = []; docs.forEach(function (v, k) { if (parent(k) === c) keys.push(k); });
      keys.sort(); var ds = keys.map(snap);
      return { docs: ds, size: ds.length, empty: !ds.length, metadata: { fromCache: false, hasPendingWrites: false } };
    }

    function notify(p) {
      subs.forEach(function (s) {
        if (s.kind === 'doc' && s.path === p) s.fn(snap(p));
        else if (s.kind === 'col' && s.path === parent(p)) s.fn(colSnap(s.path));
      });
    }

    function send(obj) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify(obj)); } catch (e) {}
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        writeQueue.push(obj);
      }
    }

    function request(kind, p) {
      return new Promise(function (resolve) {
        function exec() {
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            resolve(kind === 'doc' ? snap(p) : colSnap(p));
            return;
          }
          var reqId = 'req_' + (++reqSeq);
          var timer = setTimeout(function () {
            pending.delete(reqId);
            resolve(kind === 'doc' ? snap(p) : colSnap(p));
          }, 3500);

          pending.set(reqId, function (m) {
            clearTimeout(timer);
            if (kind === 'doc') {
              if (m.exists && m.d !== null) docs.set(p, clone(m.d));
              else docs.delete(p);
              resolve(snap(p));
            } else {
              if (Array.isArray(m.docs)) {
                m.docs.forEach(function (item) {
                  docs.set(item.path, clone(item.data));
                });
              }
              resolve(colSnap(p));
            }
          });

          send({ t: 'get', reqId: reqId, kind: kind, p: p });
        }

        if (ws && ws.readyState === WebSocket.CONNECTING) {
          var chk = setInterval(function () {
            if (!ws || ws.readyState !== WebSocket.CONNECTING) {
              clearInterval(chk);
              exec();
            }
          }, 40);
        } else {
          exec();
        }
      });
    }

    function connect() {
      try {
        ws = new WebSocket(url);
      } catch (e) {
        return;
      }

      ws.onopen = function () {
        isConnected = true;
        subs.forEach(function (s) {
          send({ t: 'sub', kind: s.kind, p: s.path });
        });
        while (writeQueue.length > 0) {
          send(writeQueue.shift());
        }
        clearInterval(pingTimer);
        pingTimer = setInterval(function () { send({ t: 'ping' }); }, 20000);
      };

      ws.onmessage = function (ev) {
        try {
          var m = JSON.parse(ev.data);
          if (!m || !m.t) return;
          if (m.t === 'res' && m.reqId && pending.has(m.reqId)) {
            var handler = pending.get(m.reqId);
            pending.delete(m.reqId);
            handler(m);
            return;
          }
          if (m.t === 'snap') {
            if (m.exists && m.d !== null) docs.set(m.p, clone(m.d));
            else docs.delete(m.p);
            subs.forEach(function (s) {
              if (s.kind === 'doc' && s.path === m.p) s.fn(snap(m.p));
            });
          } else if (m.t === 'colSnap') {
            if (Array.isArray(m.docs)) {
              m.docs.forEach(function (item) {
                docs.set(item.path, clone(item.data));
              });
            }
            subs.forEach(function (s) {
              if (s.kind === 'col' && s.path === m.p) s.fn(colSnap(m.p));
            });
          }
        } catch (e) {}
      };

      ws.onclose = function () {
        isConnected = false;
        clearInterval(pingTimer);
        setTimeout(connect, 1500);
      };

      ws.onerror = function () {
        try { ws.close(); } catch (e) {}
      };
    }

    connect();

    function write(p, data) {
      if (data === null) docs.delete(p); else docs.set(p, clone(data));
      notify(p);
      send({ t: 'write', p: p, d: data });
    }

    function sub(kind, path, fn) {
      var s = { kind: kind, path: path, fn: fn };
      subs.add(s);
      send({ t: 'sub', kind: kind, p: path });
      setTimeout(function () {
        if (subs.has(s)) fn(kind === 'doc' ? snap(path) : colSnap(path));
      }, 0);
      return function () {
        subs.delete(s);
        var stillNeeded = false;
        subs.forEach(function (other) { if (other.kind === kind && other.path === path) stillNeeded = true; });
        if (!stillNeeded) send({ t: 'unsub', kind: kind, p: path });
      };
    }

    function doc(path) {
      return {
        id: path.split('/').pop(), path: path,
        get: function () { return request('doc', path); },
        set: function (d) { write(path, d); return Promise.resolve(); },
        update: function (d) {
          var cur = docs.get(path) || {};
          write(path, Object.assign({}, cur, d));
          return Promise.resolve();
        },
        delete: function () { write(path, null); return Promise.resolve(); },
        onSnapshot: function (fn) { return sub('doc', path, fn); }
      };
    }

    function collection(path) {
      return {
        path: path,
        doc: function (id) { return doc(path + '/' + (id || rid(12))); },
        get: function () { return request('col', path); },
        onSnapshot: function (fn) { return sub('col', path, fn); }
      };
    }

    return { doc: doc, collection: collection, connected: function () { return isConnected; } };
  }

  /* ================= session ================= */
  var db = null, offline = false, me = { uid: null, name: '' };
  var code = null, room = null, players = {}, S = null, unsubs = [];
  var sel = {}, layout = [], layoutKey = '', dismissed = '', rulesOpen = false, scoresOpen = false, confirmDrop = false, reactOpen = false, menuOpen = false;
  var felt = lsGet('rr-felt') || 'emerald', lastTurnKey = '', botTimer = null, botKey = '', seenReact = {}, wq = Promise.resolve();
  var backTheme = lsGet('rr-back') || 'emerald';
  var deckStyle = lsGet('rr-deck') || 'classic';
  if (window.RummyCards) { RummyCards.setBack(backTheme); RummyCards.setDeck(deckStyle); }
  var evCache = { key: '', ev: null }, playersSig = '', hb = null;
  var titleTimer = null, origTitle = 'Rummy Room', wasMineTurn = false;
  var leaveModalOpen = false, confirmWrongDeclareCard = null;
  var dealerAct = null, dealerBubble = null, bubbleTimer = null, lastAnimV = null, lastDealKey = '', endKey = '', animLockUntil = 0, renderPending = false;
  var dragIds = null, drag = null, didRealDrag = false, lastBuzz = -1;
  var pointerIsDown = false, deferredRender = false, activePointer = null, lastTapHandledAt = 0;
  var reduced = false; try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }
  function toggleFullscreen() {
    try {
      if (!isFullscreen()) {
        var docEl = document.documentElement;
        var req = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
        if (req) req.call(docEl);
      } else {
        var ex = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
        if (ex) ex.call(document);
      }
    } catch (e) { /* ignore */ }
  }

  function scheduleRenderRoom() {
    if (pointerIsDown) {
      deferredRender = true;
      return;
    }
    renderRoom();
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function enqueue(fn) {
    wq = wq.then(async function () {
      try { await fn(); } catch (e1) {
        await sleep(900);
        try { await fn(); } catch (e2) { toast('Move not saved, try again'); }
      }
    });
    return wq;
  }
  async function commit(next, prev, quiet) {
    var cur = await stateRef().get(), d = cur.exists ? cur.data() : null;
    if (d && prev && d.v !== prev.v) {
      if (d.v === next.v) return;
      S = d; scheduleRenderRoom();
      if (!quiet) toast('Move not saved, try again');
      return;
    }
    await stateRef().set(next);
  }
  function roomRef() { return db.doc('rooms/' + code); }
  function stateRef() { return db.doc('rooms/' + code + '/game/state'); }
  function playersCol() { return db.collection('rooms/' + code + '/players'); }
  function isHost() { return !!room && (room.hostId === me.uid || room.host === me.uid); }
  function sortedPlayers() { return Object.keys(players).map(function (k) { return players[k]; }).sort(function (a, b) { return a.joinedAt - b.joinedAt || (a.uid < b.uid ? -1 : 1); }); }
  function pname(u) { return (players[u] && players[u].name) || 'Player'; }
  function seatIdx(u) { var i = sortedPlayers().findIndex(function (p) { return p.uid === u; }); return i < 0 ? 0 : i % 6; }
  function avatar(u, big) { return '<span class="avatar av' + seatIdx(u) + '">' + esc(pname(u).charAt(0).toUpperCase()) + '</span>'; }

  async function boot() {
    var cl = window.claude, realDb = null, user = null;
    try { if (cl && cl.use) { realDb = await cl.use('db'); user = await cl.use('user'); } } catch (e) { realDb = null; }
    var saved = lsGet('rr-name') || '';
    if (realDb && user) {
      var v = await user.me();
      if (v && v.id) { db = realDb; me.uid = v.id; me.name = saved || v.name || ''; }
    }
    if (!db && (location.protocol === 'http:' || location.protocol === 'https:')) {
      try {
        var wsProto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        var wsUrl = wsProto + location.host + '/ws';
        db = SocketDB(wsUrl);
        offline = false;
      } catch (err) {
        db = null;
      }
    }
    if (!db) {
      offline = true; db = MemDB();
    }
    var sid = null; try { sid = sessionStorage.getItem('rr-uid'); if (!sid) { sid = 'u_' + rid(8); sessionStorage.setItem('rr-uid', sid); } } catch (e) { sid = 'u_' + rid(8); }
    me.uid = me.uid || sid; me.name = saved;
    var h = (location.hash || '').match(/^#r-([A-Z0-9]{4,6})$/);
    if (!h && me.name && lsGet('rr-auto') === '1') {
      var last = lsGet('rr-room');
      if (last) {
        try {
          var mine = await db.doc('rooms/' + last + '/players/' + me.uid).get(), rs = await db.doc('rooms/' + last).get();
          if (mine.exists && rs.exists) { await enterRoom(last); return; }
        } catch (e) { /* fall through to home */ }
      }
    }
    renderHome(h ? h[1] : '');
  }

  /* ================= home ================= */
  function renderHome(prefill) {
    unsubAll(); code = null; room = null; players = {}; S = null;
    document.body.dataset.view = 'home';
    var resume = lsGet('rr-room');
    var cardAce = cardHTML(0);
    var cardKing = cardHTML(25);
    $app.innerHTML =
      '<div class="home">' +
        '<div class="home-backdrop"></div>' +
        '<div class="home-container">' +
          '<!-- Left: Brand / Salon Hero Area -->' +
          '<div class="home-hero">' +
            '<div class="hero-brand-header">' +
              '<div class="brand-cartouche">' +
                '<span class="brand-suit">♠</span>' +
                '<span class="brand-title">CARDS24</span>' +
                '<span class="brand-suit">♦</span>' +
              '</div>' +
            '</div>' +

            '<div class="hero-content">' +
              '<h1 class="hero-title">Your Table Awaits</h1>' +
              '<p class="hero-desc">Thirteen-card Indian Rummy in an exclusive private club. Create a room, share the code with friends, and take your seat at the table.</p>' +
            '</div>' +

            '<!-- Authentic Cards24 Mini Card Fan -->' +
            '<div class="hero-card-fan" aria-hidden="true">' +
              '<div class="hero-fan-card fan-back"><div class="card back"></div></div>' +
              '<div class="hero-fan-card fan-ace">' + cardAce + '</div>' +
              '<div class="hero-fan-card fan-king">' + cardKing + '</div>' +
            '</div>' +

            '<div class="hero-footer">' +
              '<button class="btn-rules-pill" data-a="rules">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>' +
                'How to Play' +
              '</button>' +
              '<div class="hero-mode-pill ' + (offline ? 'offline' : 'online') + '">' +
                '<span class="mode-dot"></span>' +
                '<span class="mode-lbl">' + (offline ? 'Local Browser Mode' : 'Live Multiplayer') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<!-- Right: Unified Game Access Panel -->' +
          '<div class="home-access-panel">' +
            '<div class="panel-inner">' +
              '<div class="panel-header">' +
                '<h2 class="panel-title">ENTER THE TABLE</h2>' +
                '<div class="panel-line"></div>' +
              '</div>' +

              '<!-- Player Name Input -->' +
              '<div class="field-block">' +
                '<label class="field-label" for="nm">YOUR NAME</label>' +
                '<div class="input-wrap">' +
                  '<input id="nm" type="text" maxlength="14" autocomplete="off" spellcheck="false" value="' + esc(me.name) + '" placeholder="e.g. Aarav">' +
                '</div>' +
              '</div>' +

              '<!-- Create Room Action -->' +
              '<div class="action-block">' +
                '<button class="btn-home-create" data-a="create">' +
                  '<span class="btn-primary-title">CREATE ROOM</span>' +
                  '<span class="btn-primary-sub">Start a new private 2–6 player table</span>' +
                '</button>' +
              '</div>' +

              '<!-- Divider -->' +
              '<div class="home-divider">' +
                '<span class="div-line"></span>' +
                '<span class="div-text">OR JOIN FRIENDS</span>' +
                '<span class="div-line"></span>' +
              '</div>' +

              '<!-- Join Room Action -->' +
              '<div class="field-block">' +
                '<label class="field-label" for="jc">ENTER ROOM CODE</label>' +
                '<div class="join-input-group">' +
                  '<input id="jc" class="input-code" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Room code" value="' + esc(prefill || '') + '">' +
                  '<button class="btn-home-join" data-a="join">JOIN</button>' +
                '</div>' +
              '</div>' +

              '<!-- Rejoin Previous Table (Conditional) -->' +
              (resume ? (
                '<div class="rejoin-card">' +
                  '<div class="rejoin-details">' +
                    '<span class="rejoin-label">PREVIOUS TABLE</span>' +
                    '<span class="rejoin-code">' + esc(resume) + '</span>' +
                  '</div>' +
                  '<button class="btn-home-rejoin" data-a="resume" data-code="' + esc(resume) + '">REJOIN</button>' +
                '</div>'
              ) : '') +

              '<!-- Offline Notice (Conditional) -->' +
              (offline ? (
                '<div class="offline-note">' +
                  'Tabs in this browser can join each other, and you can add AI bots.' +
                '</div>'
              ) : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function readName() {
    var el = document.getElementById('nm');
    var n = (el ? el.value : me.name).trim().slice(0, 14);
    if (!n) { toast('Enter a name first.'); if (el) el.focus(); return null; }
    me.name = n; lsSet('rr-name', n);
    return n;
  }

  async function createRoom() {
    var n = readName(); if (!n) return;
    var c = null;
    for (var i = 0; i < 6; i++) {
      var t = rid(4), snap = await db.doc('rooms/' + t).get();
      if (!snap.exists) { c = t; break; }
    }
    if (!c) { toast('Could not find a free room code. Try again.'); return; }
    await db.doc('rooms/' + c).set({ code: c, hostId: me.uid, mode: 'points', turnSecs: 45, status: 'lobby', createdAt: Date.now() });
    await enterRoom(c);
  }

  async function joinRoom(c) {
    var n = readName(); if (!n) return;
    c = (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 4) { toast('Enter the 4-letter room code.'); return; }
    var snap = await db.doc('rooms/' + c).get();
    if (!snap.exists) { toast('No room with that code.'); return; }
    var ps = await db.collection('rooms/' + c + '/players').get();
    var already = ps.docs.some(function (d) { return d.id === me.uid; });
    if (!already && ps.size >= 6) { toast('That table is full (6 players).'); return; }
    await enterRoom(c);
  }

  async function enterRoom(c) {
    code = c; lsSet('rr-room', c);
    try { history.replaceState(null, '', '#r-' + c); } catch (e) { /* hash is optional */ }
    var mine = await db.doc('rooms/' + c + '/players/' + me.uid).get();
    var base = mine.exists ? mine.data() : { joinedAt: Date.now() };
    await db.doc('rooms/' + c + '/players/' + me.uid).set({ uid: me.uid, name: me.name, joinedAt: base.joinedAt, bot: false, seen: Date.now() });
    lsSet('rr-auto', '1');
    unsubAll();
    var timer = null;
    unsubs.push(roomRef().onSnapshot(function (s) { room = s.exists ? s.data() : null; if (!room && code) { toast('This room no longer exists.'); lsSet('rr-room', ''); renderHome(); return; } scheduleRenderRoom(); }));
    unsubs.push(playersCol().onSnapshot(function (s) {
      var m = {}, sigObj = {}; s.docs.forEach(function (d) { var v = d.data(); m[d.id] = v; var c = Object.assign({}, v); delete c.seen; sigObj[d.id] = c; });
      players = m;
      Object.keys(m).forEach(function (u) { var r = m[u].react; if (r && r.t !== seenReact[u]) { if (seenReact[u] !== undefined) floatEmoji(r.e, u); seenReact[u] = r.t; } });
      var sig = JSON.stringify(sigObj);
      if (sig !== playersSig) { playersSig = sig; scheduleRenderRoom(); }
    }));
    unsubs.push(stateRef().onSnapshot(function (s) {
      var d = s.exists ? s.data() : null;
      if (S && d && d.round === S.round && d.v < S.v) return;
      S = d; scheduleRenderRoom();
    }));
    clearInterval(tick); tick = setInterval(onTick, 500);
    clearInterval(hb); hb = setInterval(beat, 10000);
  }
  var tick = null;
  function beat() { if (code && me.uid) { try { db.doc('rooms/' + code + '/players/' + me.uid).update({ seen: Date.now() }).catch(function () { /* left the room */ }); } catch (e) { /* ignore */ } } }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { stopTitleFlash(); beat(); if (code && room) renderRoom(); } });
  function netBanner(off) {
    var el = document.getElementById('net');
    if (off && !el) { el = document.createElement('div'); el.id = 'net'; el.className = 'toast'; el.textContent = 'You are offline. Your seat is kept, and the game resumes when you reconnect.'; document.body.appendChild(el); }
    else if (!off && el) el.remove();
  }
  window.addEventListener('offline', function () { netBanner(true); });
  window.addEventListener('online', function () { netBanner(false); beat(); toast('Back online', true); });
  function unsubAll() { clearInterval(hb); unsubs.forEach(function (u) { try { u(); } catch (e) { /* already closed */ } }); unsubs = []; clearInterval(tick); clearTimeout(botTimer); botKey = ''; }

  /* ================= actions ================= */
  function leaveRoom() {
    if (!room) return renderHome();
    var isMidDeal = S && S.phase === 'play' && S.status[me.uid] === 'active';
    if (isMidDeal) {
      leaveModalOpen = true;
      renderRoom();
      return;
    }
    doLeaveRoom();
  }

  async function doLeaveRoom() {
    leaveModalOpen = false;
    stopTitleFlash();
    if (code && room && S && S.phase === 'play' && S.status[me.uid] === 'active') {
      try { await act({ type: 'leave' }); } catch (e) { /* ignore */ }
    }
    try { await db.doc('rooms/' + code + '/players/' + me.uid).delete(); } catch (e) { /* ignore */ }
    lsSet('rr-room', '');
    lsSet('rr-auto', '0');
    unsubAll();
    room = null; S = null; code = null;
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    renderHome();
    toast('You left the table.', true);
  }

  function addBot() {
    var names = ['Aarav', 'Kavya', 'Rohan', 'Meera', 'Vikram', 'Isha', 'Kabir', 'Anaya'];
    var taken = {}; sortedPlayers().forEach(function (p) { taken[p.name] = 1; });
    var nm = names.filter(function (n) { return !taken[n + ' (bot)']; })[0] || 'Bot';
    var u = 'bot-' + rid(5);
    enqueue(function () { return db.doc('rooms/' + code + '/players/' + u).set({ uid: u, name: nm + ' (bot)', joinedAt: Date.now(), bot: true }); });
  }
  function removePlayer(u) { enqueue(function () { return db.doc('rooms/' + code + '/players/' + u).delete(); }); }
  function setRoom(patch) { enqueue(function () { return roomRef().update(patch); }); }

  function eligibleOrder() {
    var base = (S && S.result && S.result.totals) || {}, limit = (S && S.limit) || L.MODES[room.mode].limit || 0;
    return sortedPlayers().filter(function (p) { return !(limit && (base[p.uid] || 0) >= limit); }).slice(0, 6).map(function (p) { return p.uid; });
  }
  function startDeal(fresh) {
    var order = eligibleOrder();
    if (order.length < 2) { toast('Need at least 2 players. Add a bot or wait for friends.'); return; }
    var base = fresh ? {} : Object.assign({}, (S && S.result && S.result.totals) || {});
    var limit = L.MODES[room.mode].limit, alive = 0;
    Object.keys(base).forEach(function (u) { if (!limit || base[u] < limit) alive = Math.max(alive, base[u]); });
    order.forEach(function (u) { if (base[u] === undefined) base[u] = limit ? alive : 0; });
    var round = fresh ? 0 : ((S && S.round) || 0) + 1;
    var deal = L.newDeal({ order: order, round: round, mode: room.mode, baseTotals: base, now: Date.now() });
    dismissed = ''; sel = {}; layout = []; layoutKey = '';
    if (offline) { S = deal; renderRoom(); }
    enqueue(async function () { await stateRef().set(deal); await roomRef().update({ status: 'playing' }); });
  }
  function backToLobby() {
    if (offline) { if (room) room.status = 'lobby'; S = null; renderRoom(); }
    enqueue(async function () { await stateRef().delete(); await roomRef().update({ status: 'lobby' }); });
    dismissed = '';
  }

  function act(a) {
    if (!S || Date.now() < dealUntil) {
      if (Date.now() < dealUntil) toast('Cards are being dealt');
      return;
    }
    try {
      var pre = captureFor(a), prev = S, next = L.apply(S, Object.assign({ uid: me.uid }, a), Date.now());
      S = next; confirmDrop = false;
      sfx(a.type === 'discard' ? 'discard' : 'draw');
      renderRoom();
      flyAfter(a, pre, next);
      enqueue(function () { return commit(next, prev, false); });
    } catch (e) {
      sfx('err');
      var msg = e.message || 'That move is not allowed.';
      if (msg.indexOf('picked up') >= 0) msg = 'You just picked this card up, choose another';
      else if (msg.indexOf('Joker') >= 0) msg = "Jokers can't be taken from the open pile";
      toast(msg);
    }
  }
  function actAs(uid, a) {
    try {
      var prev = S, next = L.apply(S, Object.assign({ uid: uid }, a), Date.now());
      S = next; renderRoom();
      enqueue(function () { return commit(next, prev, true); });
    } catch (e) { /* stale bot/timeout move, ignore */ }
  }
  function react(e) {
    enqueue(function () { return db.doc('rooms/' + code + '/players/' + me.uid).update({ react: { e: e, t: Date.now() } }); });
    reactOpen = false; renderRoom();
  }
  function floatEmoji(e, u) {
    var el = document.createElement('div'); el.className = 'float'; el.textContent = e;
    var seat = u && (u === me.uid ? document.querySelector('.me') : chipFor(u));
    if (seat) { var sr = seat.getBoundingClientRect(); el.style.left = (sr.left + sr.width / 2 - 17) + 'px'; el.style.top = sr.top + 'px'; }
    else { el.style.left = (20 + Math.random() * 60) + 'vw'; el.style.top = '55vh'; }
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2100);
  }

  /* ================= host driver: bots + turn timer ================= */
  var AWAY_MS = 30000, autoKey = '', autoAt = 0, awayKey = '', hkN = 0;
  function online(p) { return !!p && (p.bot || Date.now() - (p.seen || p.joinedAt || 0) < AWAY_MS); }
  function housekeeping() {
    if (!room) return;
    var ak = sortedPlayers().filter(function (p) { return !online(p); }).map(function (p) { return p.uid; }).join(',');
    if (ak !== awayKey) { awayKey = ak; renderRoom(); }
    if (Object.keys(players).length && !online(players[room.hostId])) {
      var cand = sortedPlayers().filter(function (p) { return !p.bot && online(p); })[0];
      if (cand && cand.uid === me.uid && room.hostId !== me.uid) { setRoom({ hostId: me.uid }); toast('The host is away. You are the host now.', true); }
    }
  }
  function onTick() {
    if (room && ++hkN % 10 === 0) housekeeping();
    var tEl = document.getElementById('timer');
    if (!S || S.phase !== 'play' || !room) { if (tEl) tEl.textContent = '--:--'; return; }
    var secs = room.turnSecs || 0, due = Math.max(S.turnAt, dealUntil) + secs * 1000;
    var left = secs ? Math.max(0, Math.ceil((due - Date.now()) / 1000)) : null;
    if (tEl) {
      if (left === null) {
        tEl.textContent = '--:--';
        tEl.classList.remove('urgent');
      } else {
        var mm = '00';
        var ss = (left < 10 ? '0' : '') + left;
        tEl.textContent = mm + ':' + ss;
        tEl.classList.toggle('urgent', left <= 5);
      }
    }
    if (S.turn === me.uid && left !== null && left > 0 && left <= 3 && left !== lastBuzz) {
      lastBuzz = left; sfx('draw');
      try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) { /* no haptics */ }
    }
    var p = players[S.turn];
    if (secs && p && !p.bot && S.status[S.turn] === 'active') {
      /* Any connected player can enforce the timer, so a missing host cannot freeze the table. */
      var wait = isHost() ? 0 : 3000 + 2000 * seatIdx(me.uid), key = S.round + ':' + S.turnN + ':' + S.turn;
      if (Date.now() - due >= wait && (autoKey !== key || Date.now() - autoAt > 8000)) { autoKey = key; autoAt = Date.now(); actAs(S.turn, { type: 'auto' }); }
    }
  }
  function driveBots() {
    if (!S || S.phase !== 'play') return;
    var p = players[S.turn];
    if (!p || !p.bot || S.status[S.turn] !== 'active') return;
    var key = S.round + ':' + S.turnN + ':' + S.stage + ':' + S.turn;
    if (botKey === key) return;
    botKey = key; clearTimeout(botTimer);
    botTimer = setTimeout(function () {
      if (!S || S.phase !== 'play') return;
      var cur = S.round + ':' + S.turnN + ':' + S.stage + ':' + S.turn;
      if (cur !== key) return;
      var mv; try { mv = L.botMove(S, S.turn); } catch (e) { mv = { type: 'drawStock' }; }
      actAs(S.turn, mv);
    }, isHost() ? 900 + Math.random() * 700 : 7000 + seatIdx(me.uid) * 1500);
  }

  /* ================= hand layout ================= */
  function sortCards(ids) {
    return ids.slice().sort(function (a, b) {
      var A = L.INFO[a], B = L.INFO[b];
      if (A.joker !== B.joker) return A.joker ? 1 : -1;
      return A.suit - B.suit || A.rank - B.rank || a - b;
    });
  }
  function suitLayout(hand) {
    var by = {}, out = [];
    sortCards(hand).forEach(function (id) { var c = L.INFO[id], k = c.joker ? 'j' : c.suit; (by[k] = by[k] || []).push(id); });
    ['0', '1', '2', '3', 'j'].forEach(function (k) { if (by[k]) out.push(by[k]); });
    return out;
  }
  function reconcile(hand) {
    var key = code + ':' + S.round + ':' + me.uid;
    if (layoutKey !== key) {
      layoutKey = key; layout = [];
      var stored = lsGet('rr-lay-' + key);
      if (stored) { try { layout = JSON.parse(stored); } catch (e) { layout = []; } }
    }
    var have = {}; hand.forEach(function (id) { have[id] = 1; });
    var seen = {};
    layout = layout.map(function (g) { return g.filter(function (id) { if (have[id] && !seen[id]) { seen[id] = 1; return true; } return false; }); }).filter(function (g) { return g.length; });
    var extra = hand.filter(function (id) { return !seen[id]; });
    if (!layout.length || extra.length > 2) layout = suitLayout(hand);
    else extra.forEach(function (id) { layout.push([id]); });
    Object.keys(sel).forEach(function (id) { if (!have[id]) delete sel[id]; });
  }
  function saveLayout() { lsSet('rr-lay-' + layoutKey, JSON.stringify(layout)); }
  function selIds() { return Object.keys(sel).map(Number); }

  function groupSelected() {
    var ids = selIds(); if (!ids.length) return;
    layout = layout.map(function (g) { return g.filter(function (id) { return !sel[id]; }); }).filter(function (g) { return g.length; });
    layout.push(sortCards(ids)); sel = {}; saveLayout(); renderRoom();
  }
  function moveSelectedTo(gi) {
    var ids = selIds(); if (!ids.length) return;
    var target = layout[gi];
    layout = layout.map(function (g) { return g.filter(function (id) { return !sel[id]; }); });
    target = target.filter(function (id) { return !sel[id]; });
    var merged = sortCards(target.concat(ids));
    var idx = layout.findIndex(function (g) { return g === layout[gi]; });
    layout[gi] = merged; layout = layout.filter(function (g) { return g.length; }); sel = {}; saveLayout(); renderRoom();
  }
  function autoArrange() {
    var hand = S.hands[me.uid];
    if (hand.length === 13) {
      var r = L.solve(hand, S.wild);
      var gs = r.groups.map(function (g) { return g.ids; }), used = {};
      r.groups.forEach(function (g) { g.ids.forEach(function (id) { used[id] = 1; }); });
      var rest = hand.filter(function (id) { return !used[id]; });
      layout = gs.concat(rest.length ? suitLayout(rest) : []);
    } else layout = suitLayout(hand);
    sel = {}; saveLayout(); renderRoom();
  }
  function sortBySuit() { layout = suitLayout(S.hands[me.uid]); sel = {}; saveLayout(); renderRoom(); }

  /* ================= card + hand rendering ================= */
  function cardHTML(id, extra) {
    if (id == null || !L.INFO[id]) return '<div class="card" style="opacity:.2"></div>';
    var c = L.INFO[id], wild = S ? S.wild : 0;
    var isWild = !c.joker && wild > 0 && c.rank === wild;
    var cls = (extra || '') + (dragIds && dragIds[id] ? ' ghosted' : '');
    if (window.RummyCards) return RummyCards.cardHTML(id, c, { wild: isWild, cls: cls.trim() });
    var sym = L.SUIT_SYM[c.suit] + '︎';
    return '<div class="card" data-card="' + id + '"><span class="tl">' + L.RANK_LBL[c.rank] + '<b>' + sym + '</b></span></div>';
  }
  var TAGS = ['Loose', 'Set', 'Sequence', 'Pure'];
  function tagFor(g) {
    if (g.length <= 1) return null;
    if (g.length === 2) return [0, 'Loose'];
    var t = L.classify(g, S.wild);
    return [t, t ? TAGS[t] : 'Invalid'];
  }

  function handStats(hand) {
    var pure = 0, seqs = 0, groups = layout.map(function (g) { return { g: g, t: g.length >= 3 ? L.classify(g, S.wild) : 0 }; });
    groups.forEach(function (x) { if (x.t === 3) pure++; if (x.t >= 2) seqs++; });
    var ok = pure >= 1 && seqs >= 2, dead = 0;
    groups.forEach(function (x) { var counts = x.t === 3 || x.t === 2 || (x.t === 1 && ok); if (!counts) x.g.forEach(function (id) { dead += L.pts(id, S.wild); }); });
    return { pure: pure, seqs: seqs, dead: Math.min(80, dead), ok: ok };
  }

  
  function chooseDeclareDiscard(hand) {
    var di = declareInfo(hand);
    var validDiscard = di ? di.find(function (e) { return e.valid; }) : null;
    if (validDiscard) return validDiscard.id;
    var evs = L.evalDiscards(hand, S.wild);
    evs.sort(function (a, b) { return a.cost - b.cost; });
    return evs[0] ? evs[0].id : hand[hand.length - 1];
  }

  function handleFinishWithCard(cardId) {
    if (cardId == null) return;
    var hand = S.hands[me.uid] || [];
    var rest = hand.filter(function (id) { return id !== cardId; });
    var solved = L.solve(rest, S.wild);
    if (solved.valid) {
      act({ type: 'declare', card: cardId });
    } else {
      confirmWrongDeclareCard = cardId;
      renderRoom();
    }
  }

  function declareInfo(hand) {
    if (hand.length !== 14) return null;
    var key = hand.slice().sort().join(',') + ':' + S.wild;
    if (evCache.key !== key) evCache = { key: key, ev: L.evalDiscards(hand, S.wild) };
    return evCache.ev;
  }

  /* ================= room render ================= */
  var lastHTMLKey = '';
  function renderRoom() {
    if (!code || !room) return;
    if (pointerIsDown) {
      deferredRender = true;
      return;
    }
    if (Date.now() < animLockUntil) {
      if (!renderPending) { renderPending = true; setTimeout(function () { renderPending = false; renderRoom(); }, animLockUntil - Date.now() + 20); }
      return;
    }
    if (!S || room.status === 'lobby') { renderLobby(); return; }
    renderTable();
    driveBots();
  }

  function renderLobby() {
    document.body.dataset.view = 'lobby';
    var ps = sortedPlayers(), host = isHost(), mode = room.mode || 'points';
    var seats = '';
    for (var i = 0; i < 6; i++) {
      var p = ps[i];
      if (p) {
        var isMe = p.uid === me.uid;
        var isRoomHost = p.uid === room.hostId;
        var isOnline = online(p);
        var initial = (p.name || 'P').trim().charAt(0).toUpperCase();
        var sIdx = seatIdx(p.uid);
        seats +=
          '<div class="lobby-seat taken' + (isMe ? ' seat-me' : '') + '">' +
            '<div class="lobby-avatar av' + sIdx + '">' +
              '<span class="avatar-initial">' + esc(initial) + '</span>' +
            '</div>' +
            '<div class="lobby-player-info">' +
              '<div class="lobby-player-name" title="' + esc(p.name) + '">' + esc(p.name) + '</div>' +
              '<div class="lobby-player-pills">' +
                (isRoomHost ? '<span class="pill gold">Host</span>' : '') +
                (isMe ? '<span class="pill ok">You</span>' : '') +
                (p.bot ? '<span class="pill bot">Bot</span>' : '') +
                (!isOnline ? '<span class="pill bad">Away</span>' : '') +
              '</div>' +
            '</div>' +
            (host && !isMe ? '<button class="btn-remove-player" data-a="remove" data-u="' + esc(p.uid) + '" aria-label="Remove ' + esc(p.name) + '" title="Remove player">✕</button>' : '') +
          '</div>';
      } else {
        seats +=
          '<div class="lobby-seat empty">' +
            '<div class="lobby-avatar empty-avatar">' +
              '<svg viewBox="0 0 24 24" class="empty-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M12 5v14M5 12h14"/>' +
              '</svg>' +
            '</div>' +
            '<div class="lobby-player-info">' +
              '<div class="empty-seat-title">Open Seat</div>' +
              '<div class="empty-seat-desc">Waiting for player</div>' +
            '</div>' +
          '</div>';
      }
    }

    var modes = Object.keys(L.MODES).map(function (k) {
      var isSelected = mode === k;
      var tag = k === 'points' ? 'CLASSIC' : (k === 'pool101' ? 'POOL 101' : 'POOL 201');
      return (
        '<button class="mode-card' + (isSelected ? ' selected' : '') + '" data-a="mode" data-m="' + k + '" role="radio" aria-checked="' + isSelected + '" aria-pressed="' + isSelected + '" ' + (host ? '' : 'disabled') + '>' +
          '<div class="mode-radio-box">' +
            '<div class="mode-radio-circle">' +
              '<div class="mode-radio-dot"></div>' +
            '</div>' +
          '</div>' +
          '<div class="mode-content">' +
            '<div class="mode-title-row">' +
              '<span class="mode-title">' + esc(L.MODES[k].label) + '</span>' +
              '<span class="mode-tag">' + tag + '</span>' +
            '</div>' +
            '<div class="mode-blurb">' + esc(L.MODES[k].blurb) + '</div>' +
          '</div>' +
        '</button>'
      );
    }).join('');

    var ctaHTML = '';
    if (host) {
      if (ps.length < 2) {
        ctaHTML =
          '<div class="lobby-status-banner waiting">' +
            '<span class="status-pulse-dot"></span>' +
            '<div class="status-banner-text">' +
              '<div class="status-banner-title">WAITING FOR A SECOND PLAYER</div>' +
              '<div class="status-banner-sub">At least 2 players are required to deal cards</div>' +
            '</div>' +
          '</div>';
      } else {
        ctaHTML =
          '<button class="btn-deal-action" data-a="start">' +
            '<span class="deal-btn-shine"></span>' +
            '<svg class="deal-btn-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"/>' +
            '</svg>' +
            '<div class="deal-btn-text">' +
              '<span class="deal-btn-title">DEAL THE CARDS</span>' +
              '<span class="deal-btn-sub">Start round with ' + ps.length + ' players</span>' +
            '</div>' +
          '</button>';
      }
    } else {
      ctaHTML =
        '<div class="lobby-status-banner waiting non-host">' +
          '<span class="status-pulse-dot"></span>' +
          '<div class="status-banner-text">' +
            '<div class="status-banner-title">WAITING FOR HOST TO DEAL</div>' +
            '<div class="status-banner-sub">The host will begin once all players are ready</div>' +
          '</div>' +
        '</div>';
    }

    var timerOptions = [20, 30, 45, 60, 0].map(function (n) {
      return '<option value="' + n + '"' + ((room.turnSecs || 0) === n ? ' selected' : '') + '>' + (n ? n + ' seconds' : 'No timer') + '</option>';
    }).join('');

    $app.innerHTML =
      '<div class="lobby">' +
        '<div class="lobby-inner">' +
          '<header class="lobby-header-bar">' +
            '<div class="lobby-brand-group">' +
              '<span class="lobby-brand-title">CARDS24</span>' +
              '<span class="lobby-brand-sep">|</span>' +
              '<span class="lobby-brand-sub">TABLE LOBBY</span>' +
            '</div>' +
            '<div class="lobby-nav-actions">' +
              '<button class="btn lobby-nav-btn" data-a="rules" title="How to play Indian Rummy">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
                '<span>Rules</span>' +
              '</button>' +
              '<button class="btn lobby-nav-btn btn-leave" data-a="leave" title="Leave table">' +
                '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
                '<span>Leave</span>' +
              '</button>' +
            '</div>' +
          '</header>' +

          '<div class="lobby-dashboard">' +
            '<div class="lobby-col lobby-col-left">' +
              '<div class="panel lobby-panel room-code-panel">' +
                '<div class="panel-eyebrow">ROOM CODE · SHARE WITH FRIENDS</div>' +
                '<div class="room-code-row">' +
                  '<div class="room-code-badge">' +
                    '<span class="room-code-val">' + esc(code) + '</span>' +
                  '</div>' +
                  '<button class="btn gold lobby-copy-btn" data-a="copy" title="Copy room link">' +
                    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
                    '<span>Copy Code</span>' +
                  '</button>' +
                '</div>' +
                '<div class="room-code-hint">Share this 4-letter code or invite link with friends to join your table.</div>' +
              '</div>' +

              '<div class="panel lobby-panel players-panel">' +
                '<div class="panel-header-row">' +
                  '<div class="players-count-box">' +
                    '<span class="panel-eyebrow">SEATED PLAYERS</span>' +
                    '<span class="players-count-chip">' + ps.length + ' / 6</span>' +
                  '</div>' +
                  (host ? '<button class="btn lobby-addbot-btn" data-a="addbot" ' + (ps.length >= 6 ? 'disabled' : '') + ' title="Add computer player">' +
                    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>' +
                    '<span>Add Bot</span>' +
                  '</button>' : '') +
                '</div>' +
                '<div class="lobby-seats-grid">' + seats + '</div>' +
              '</div>' +
            '</div>' +

            '<div class="lobby-col lobby-col-right">' +
              '<div class="lobby-action-slot">' + ctaHTML + '</div>' +

              '<div class="panel lobby-panel gametype-panel">' +
                '<div class="panel-eyebrow">GAME TYPE ' + (host ? '' : '<span class="host-badge">(HOST CHOOSES)</span>') + '</div>' +
                '<div class="modes-list" role="radiogroup" aria-label="Game Type">' + modes + '</div>' +

                '<div class="lobby-settings-bar">' +
                  '<div class="lobby-field timer-field">' +
                    '<label for="ts" class="setting-lbl">TURN TIMER</label>' +
                    '<div class="select-wrap">' +
                      '<select id="ts" data-a="timer" ' + (host ? '' : 'disabled') + '>' + timerOptions + '</select>' +
                      '<svg class="select-arrow" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' +
                    '</div>' +
                  '</div>' +
                  '<div class="lobby-field theme-field">' +
                    '<span class="setting-lbl">TABLE THEME</span>' +
                    '<button class="btn lobby-theme-btn" data-a="felt" title="Toggle table felt color">' +
                      '<span class="theme-swatch swatch-' + felt + '"></span>' +
                      '<span class="theme-name">FELT: <b>' + felt.toUpperCase() + '</b></span>' +
                    '</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +

          '</div>' +
        '</div>' +
      '</div>' + (rulesOpen ? rulesHTML() : '');
  }

  function msgFor() {
    if (S.phase === 'ended') return ['Deal finished', ''];
    var turn = S.turn, mine = turn === me.uid, inGame = S.order.indexOf(me.uid) >= 0;
    if (!inGame) return ['Watching this deal', 'You will be dealt in next round.'];
    if (S.status[me.uid] !== 'active') return ['You dropped this deal', 'Waiting for the others to finish.'];
    if (mine) return S.stage === 'draw' ? ['Your turn: draw', 'Tap the stock or the open card.'] : ['Your turn: discard', 'Select one card, then Discard or Declare.'];
    return [pname(turn) + (S.stage === 'draw' ? ' is drawing' : ' is choosing a discard'), ''];
  }

  function logText(e) {
    var n = esc(pname(e.u)), c = e.c != null ? cardName(e.c) : '';
    return { stock: n + ' drew from the stock', pickup: n + ' took ' + c, discard: n + ' discarded ' + c, drop: n + ' dropped', leave: n + ' left the table', wrong_declare: '⚠️ ' + n + ' made a wrong declaration (+80 pts)', kick: n + ' timed out and dropped', declare: n + ' declared with ' + c }[e.a] || '';
  }
  function cardName(id) { var c = L.INFO[id]; return c.joker ? 'a Joker' : L.RANK_LBL[c.rank] + L.SUIT_SYM[c.suit] + '︎'; }

  /* ================= SVGs for Royal Haveli Theme ================= */
  var SILHOUETTE_SVG = '<svg class="sil-icon" viewBox="0 0 24 24" width="22" height="22"><path fill="rgba(248,244,230,0.85)" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';

  var TROPHY_SVG = '<svg viewBox="0 0 24 24" class="hdr-ico" width="20" height="20" fill="none" stroke="#e6c678" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8v4h8v-4h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>';
  var GEAR_SVG = '<svg viewBox="0 0 24 24" class="hdr-ico" width="20" height="20" fill="none" stroke="#e6c678" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var FULLSCREEN_SVG = '<svg viewBox="0 0 24 24" class="hdr-ico" width="20" height="20" fill="none" stroke="#e6c678" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  var EXIT_FULLSCREEN_SVG = '<svg viewBox="0 0 24 24" class="hdr-ico" width="20" height="20" fill="none" stroke="#e6c678" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-10h-6V4m0 6 7-7M3 21l7-7"/></svg>';

  function updateFullscreenBtn() {
    var btn = document.querySelector('[data-a="fullscreen"]');
    if (btn) {
      btn.innerHTML = isFullscreen() ? EXIT_FULLSCREEN_SVG : FULLSCREEN_SVG;
    }
  }
  document.addEventListener('fullscreenchange', updateFullscreenBtn);
  document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

  function seatChipHTML(u, slot) {
    if (!u) return '';
    var p = players[u] || { uid: u, name: pname(u) };
    var st = S.status[u], n = (S.hands[u] || []).length;
    var totals = (S.result ? S.result.totals : S.baseTotals) || {};
    var tot = totals[u] || 0;
    var isTurn = S.phase === 'play' && S.turn === u && st === 'active';
    var isBot = !!(p && p.bot);
    var rawName = (p.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
    var shortName = rawName.length > 8 ? rawName.slice(0, 8) + '…' : rawName;
    var isAway = p && !online(p);

    var cls = 'seat-chip opp slot-' + (slot || 'rim');
    if (isTurn) cls += ' turn';
    if (st !== 'active') cls += ' out';
    if (isAway) cls += ' away';

    var skipBtn = isHost() && isTurn && !isBot
      ? '<button class="btn small danger kick" data-a="kick" data-u="' + esc(u) + '" title="Skip">✕</button>'
      : '';

    var cardCntDisplay = st === 'active'
      ? '<div class="seat-card-cnt"><span class="cnt-num chip-cards-cnt">' + n + '</span><span class="cnt-lbl">CARDS</span></div>'
      : '<div class="seat-card-cnt out"><span class="cnt-lbl">OUT</span></div>';

    return '<div class="' + cls + '" data-u="' + esc(u) + '" data-slot="' + (slot || 'rim') + '">' +
      (isTurn ? '<div class="turn-pointer"></div>' : '') +
      '<div class="chip-avatar-wrap">' +
        '<div class="avatar medallion">' +
          SILHOUETTE_SVG +
        '</div>' +
      '</div>' +
      '<div class="chip-name-pill">' +
        '<span class="chip-name">' + esc(shortName) + '</span>' +
        (isBot ? '<span class="chip-bot-badge">BOT</span>' : '') +
        skipBtn +
      '</div>' +
      cardCntDisplay +
    '</div>';
  }

  function fitHand() {
    var handEl = document.getElementById('hand');
    if (!handEl) return;
    var cards = handEl.querySelectorAll('.card');
    if (!cards.length) return;
    var cw = cards[0].getBoundingClientRect().width || 48;
    var groups = handEl.querySelectorAll('.group');
    var G = groups.length || 1;
    var N = cards.length;
    var totalOverlaps = N - G;
    var availW = handEl.clientWidth - 16;
    if (totalOverlaps <= 0) {
      handEl.style.setProperty('--card-overlap', '0px');
      var totalW0 = N * cw + (G - 1) * 6;
      handEl.style.justifyContent = (totalW0 > availW) ? 'flex-start' : 'safe center';
      handEl.scrollLeft = 0;
      return;
    }
    var totalNoOverlap = N * cw + (G - 1) * 6;
    if (totalNoOverlap <= availW) {
      var comfortable = -Math.min(18, Math.max(8, Math.round(cw * 0.35)));
      handEl.style.setProperty('--card-overlap', comfortable + 'px');
      handEl.style.justifyContent = 'safe center';
      handEl.scrollLeft = 0;
      return;
    }
    var neededNegative = totalNoOverlap - availW;
    var overlap = - (neededNegative / totalOverlaps);
    /* Enforce tap strip >= 22px: strip = cw + overlap >= 22 => overlap >= -(cw - 22) */
    var maxNegativeOverlap = -(cw - 22);
    var chosenOverlap = Math.max(maxNegativeOverlap, overlap);
    handEl.style.setProperty('--card-overlap', chosenOverlap.toFixed(1) + 'px');

    var finalHandW = N * cw + totalOverlaps * chosenOverlap + (G - 1) * 6;
    if (finalHandW > availW) {
      handEl.style.justifyContent = 'flex-start';
    } else {
      handEl.style.justifyContent = 'safe center';
    }
    handEl.scrollLeft = 0;
  }

  function renderTable() {
    document.body.dataset.view = 'table';
    var inGame = S.order.indexOf(me.uid) >= 0, active = inGame && S.status[me.uid] === 'active';
    var mineTurn = S.phase === 'play' && S.turn === me.uid && active;
    var hand = inGame ? (S.hands[me.uid] || []) : [];
    if (inGame) reconcile(hand);
    var stats = handStats(hand), dInfo = mineTurn && S.stage === 'discard' ? declareInfo(hand) : null;
    var sugg = dInfo ? dInfo.filter(function (e) { return e.valid; }) : [];
    var selList = selIds(), pickSel = selList.length === 1 ? selList[0] : null;
    var declCard = null;
    if (sugg.length) { declCard = pickSel != null && sugg.some(function (e) { return e.id === pickSel; }) ? pickSel : sugg[0].id; }

    /* Opponents seating around grand mahogany oval table:
       West (left flank), North-West (arc), North (top center), North-East (arc), East (right flank).
    */
    var mIdx = S.order.indexOf(me.uid);
    var seatSeq = mIdx < 0 ? S.order.slice() : S.order.slice(mIdx + 1).concat(S.order.slice(0, mIdx));
    var seatSlots = { west: null, northWest: null, north: null, northEast: null, east: null };
    if (seatSeq.length === 1) {
      seatSlots.north = seatSeq[0];
    } else if (seatSeq.length === 2) {
      seatSlots.northWest = seatSeq[0];
      seatSlots.northEast = seatSeq[1];
    } else if (seatSeq.length === 3) {
      seatSlots.west = seatSeq[0];
      seatSlots.north = seatSeq[1];
      seatSlots.east = seatSeq[2];
    } else if (seatSeq.length === 4) {
      seatSlots.west = seatSeq[0];
      seatSlots.northWest = seatSeq[1];
      seatSlots.northEast = seatSeq[2];
      seatSlots.east = seatSeq[3];
    } else if (seatSeq.length >= 5) {
      seatSlots.west = seatSeq[0];
      seatSlots.northWest = seatSeq[1];
      seatSlots.north = seatSeq[2];
      seatSlots.northEast = seatSeq[3];
      seatSlots.east = seatSeq[4];
    }

    var westHTML = seatSlots.west ? seatChipHTML(seatSlots.west, 'west') : '';
    var northWestHTML = seatSlots.northWest ? seatChipHTML(seatSlots.northWest, 'northWest') : '';
    var northHTML = seatSlots.north ? seatChipHTML(seatSlots.north, 'north') : '';
    var northEastHTML = seatSlots.northEast ? seatChipHTML(seatSlots.northEast, 'northEast') : '';
    var eastHTML = seatSlots.east ? seatChipHTML(seatSlots.east, 'east') : '';

    var totals = (S.result ? S.result.totals : S.baseTotals) || {};
    var myTot = totals[me.uid] || 0;
    var myRawName = (me.name || 'You').replace(/\s*\(bot\)/i, '').trim();
    var myShortName = myRawName.length > 8 ? myRawName.slice(0, 8) + '…' : myRawName;

    /* piles */
    var top = S.discard[S.discard.length - 1];
    var canStock = mineTurn && S.stage === 'draw';
    var topWild = top !== undefined && (L.INFO[top].joker || L.INFO[top].rank === S.wild);
    var canPick = canStock && top !== undefined && !topWild;
    var msg = msgFor();

    /* hand */
    var handHTML = '';
    if (inGame && active) {
      var moveMode = selList.length > 0;
      handHTML = layout.map(function (g, gi) {
        var t = tagFor(g), anySel = g.some(function (id) { return sel[id]; });
        var tagHTML = t ? '<span class="group-meld-tag t' + t[0] + '">' + t[1] + '</span>' : '';
        return '<div class="group' + (moveMode && !anySel ? ' target' : '') + '" data-g="' + gi + '">' +
          '<div class="cards">' +
            g.map(function (id) { return cardHTML(id, sel[id] ? 'sel' : ''); }).join('') +
          '</div>' +
          '<div class="group-tag-row">' + tagHTML + '</div>' +
        '</div>';
      }).join('');
    } else {
      handHTML = '<div class="hand-empty">' + (inGame ? 'You dropped this deal.' : 'You are watching this deal.') + '</div>';
    }

    var canFinish = mineTurn && S.stage === 'discard';
    var finishHTML = (canFinish || S.finish != null) ?
      '<div class="pile finish-pile' + (canFinish ? ' actionable' : '') + '" data-a="finish" title="Finish Slot: Drop card or tap to declare">' +
        '<div class="finish-slot-card' + (S.finish != null ? ' has-card' : '') + '">' +
          (S.finish != null ? cardHTML(S.finish) : '<div class="finish-drop-zone"><span class="finish-drop-lbl">FINISH</span></div>') +
        '</div>' +
      '</div>' : '';

    /* Bottom Action Bar */
    var actionGrid = '';
    if (inGame && active && S.phase === 'play') {
      actionGrid = '<footer class="action-bar royal-action-bar">' +
        '<button class="game-btn btn-sort" data-a="sort">SORT</button>' +
        '<button class="game-btn btn-group" data-a="group" ' + (selList.length ? '' : 'disabled') + '>GROUP</button>' +
        '<button class="game-btn btn-auto" data-a="auto" title="Auto arrange hand">AUTO</button>' +
        '<button class="game-btn btn-drop" data-a="drop" ' + (mineTurn && S.stage === 'draw' ? '' : 'disabled') + '>' + (confirmDrop ? 'CONFIRM' : 'DROP') + '</button>' +
        '<button class="game-btn btn-discard" data-a="discard" ' + (mineTurn && S.stage === 'discard' && pickSel != null ? '' : 'disabled') + '>DISCARD</button>' +
        '<button class="game-btn btn-declare' + (declCard != null ? ' suggest' : '') + '" data-a="declare" ' + (mineTurn && S.stage === 'discard' ? '' : 'disabled') + '>' +
          '<span class="declare-bracket-l"></span>' +
          '<span class="declare-label">' + (declCard != null ? 'DECLARE (' + cardName(declCard) + ')' : 'DECLARE') + '</span>' +
          '<span class="declare-bracket-r"></span>' +
        '</button>' +
      '</footer>';
    } else if (inGame && !active) {
      actionGrid = '<footer class="action-bar royal-action-bar">' +
        '<button class="game-btn btn-sort" data-a="sort">SORT</button>' +
        '<button class="game-btn btn-group" data-a="group" disabled>GROUP</button>' +
        '<button class="game-btn btn-auto" data-a="auto">AUTO</button>' +
        '<button class="game-btn btn-drop" disabled>DROPPED</button>' +
        '<button class="game-btn btn-discard" disabled>DISCARD</button>' +
        '<button class="game-btn btn-declare" disabled><span class="declare-label">DECLARE</span></button>' +
      '</footer>';
    } else {
      actionGrid = '<footer class="action-bar royal-action-bar">' +
        '<button class="game-btn btn-sort" data-a="sort">SORT</button>' +
        '<button class="game-btn btn-group" data-a="group" disabled>GROUP</button>' +
        '<button class="game-btn btn-auto" data-a="auto">AUTO</button>' +
        '<button class="game-btn btn-drop" disabled>DROP</button>' +
        '<button class="game-btn btn-discard" disabled>DISCARD</button>' +
        '<button class="game-btn btn-declare" disabled><span class="declare-label">DECLARE</span></button>' +
      '</footer>';
    }

    var leaveModalHTML = leaveModalOpen ?
      '<div class="modal" data-a="cancelleave"><div class="sheet" style="max-width:380px;text-align:center;">' +
      '<h3 style="color:var(--bad);margin-top:0;">Leave Table?</h3>' +
      '<p style="font-size:13.5px;color:var(--ink);">You are currently in an active deal.</p>' +
      '<p style="font-size:12px;color:var(--muted);">Leaving mid-deal forfeits your hand and adds drop points (+' + (S.draws[me.uid] === 0 ? 20 : 40) + ' pts). Are you sure you want to leave?</p>' +
      '<div class="row" style="justify-content:center;gap:12px;margin-top:16px;">' +
      '<button class="btn" data-a="cancelleave" style="min-width:90px;">Stay</button>' +
      '<button class="btn danger" data-a="confirmleave" style="min-width:120px;">Leave Table</button>' +
      '</div></div></div>' : '';

    var wrongModalHTML = confirmWrongDeclareCard != null ?
      '<div class="modal" data-a="cancelwrong"><div class="sheet" style="max-width:390px;text-align:center;">' +
      '<h3 style="color:var(--bad);margin-top:0;">Invalid Hand — Wrong Declaration?</h3>' +
      '<p style="font-size:13px;color:var(--ink);">Your 13 cards do not form a valid declaration (needs 1 pure sequence + 1 second sequence with 0 deadwood).</p>' +
      '<p style="font-size:12px;color:var(--muted);">In RajRummy rules, declaring an invalid hand carries an <b>80-point penalty</b>!</p>' +
      '<div class="row" style="justify-content:center;gap:12px;margin-top:16px;">' +
      '<button class="btn" data-a="cancelwrong" style="min-width:90px;">Keep Playing</button>' +
      '<button class="btn danger" data-a="confirmwrong" style="min-width:140px;">Declare (-80 Pts)</button>' +
      '</div></div></div>' : '';

    var menuModalHTML = menuOpen ?
      '<div class="modal" data-a="closemenu"><div class="sheet menu-sheet">' +
      '<div class="menu-head"><h3>Table Menu</h3><button class="btn icon-btn small ghost" data-a="closemenu">✕</button></div>' +
      '<div class="menu-buttons">' +
      '<button class="btn" data-a="scores">Scoreboard</button>' +
      '<button class="btn" data-a="rules">How to Play</button>' +
      '<button class="btn" data-a="cardback">Card Back (' + backTheme.toUpperCase() + ')</button>' +
      '<button class="btn" data-a="felt">Table Felt (' + felt.toUpperCase() + ')</button>' +
      '<button class="btn" data-a="mute">' + (muted ? 'Unmute Sound' : 'Mute Sound') + '</button>' +
      '<button class="btn danger" data-a="leave">Leave Table</button>' +
      '</div></div></div>' : '';

    var topBarHTML =
      '<header class="bar royal-header">' +
        '<div class="bar-left">' +
          '<div class="brand-cartouche">' +
            '<span class="brand-title">CARDS24</span>' +
          '</div>' +
          '<div class="room-deal-badge">' +
            '<button class="room-copy-btn" data-a="copy" title="Tap to copy invite link">' + (String(code).toUpperCase().startsWith('ROOM') ? '' : 'ROOM ') + esc(code) + '</button>' +
            '<span class="deal-sep">|</span>' +
            '<span class="deal-label">DEAL ' + (S.round + 1) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="bar-center">' +
          '<div class="pocket-watch-timer" title="Turn Timer">' +
            '<div class="watch-rim">' +
              '<span class="watch-time" id="timer">--:--</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="bar-right">' +
          '<button class="btn icon-btn hdr-btn" data-a="scores" aria-label="Scores" title="Scoreboard">' + TROPHY_SVG + '</button>' +
          '<button class="btn icon-btn hdr-btn" data-a="menu" aria-label="Menu" title="Settings">' + GEAR_SVG + '</button>' +
          '<button class="btn icon-btn hdr-btn" data-a="fullscreen" aria-label="Toggle Fullscreen" title="Full Screen">' +
            (isFullscreen() ? EXIT_FULLSCREEN_SVG : FULLSCREEN_SVG) +
          '</button>' +
        '</div>' +
      '</header>';

    var feltHTML =
      '<main class="felt royal-table" data-felt="' + felt + '">' +
        '<div class="table-filigree corner-tl"></div>' +
        '<div class="table-filigree corner-tr"></div>' +
        '<div class="table-filigree corner-bl"></div>' +
        '<div class="table-filigree corner-br"></div>' +
        '<div class="felt-creeper-border"></div>' +
        '<div class="table-crest dealer-cell" data-a="dealer" style="display:none"></div>' +

        '<!-- Symmetrical Opponents Around Table -->' +
        '<div class="seats-layer">' +
          '<div class="seat-slot pos-west">' + westHTML + '</div>' +
          '<div class="seat-slot pos-northWest">' + northWestHTML + '</div>' +
          '<div class="seat-slot pos-north">' + northHTML + '</div>' +
          '<div class="seat-slot pos-northEast">' + northEastHTML + '</div>' +
          '<div class="seat-slot pos-east">' + eastHTML + '</div>' +
        '</div>' +

        '<!-- Central Gameplay Area -->' +
        '<div class="center-core">' +
          '<div class="piles-lane">' +
            '<div class="pile pile-stock ' + (canStock ? 'actionable' : '') + '" data-a="stock">' +
              '<div class="stack deck-3d">' +
                '<div class="card back deck-top"></div>' +
              '</div>' +
              '<span class="pile-lbl">STOCK</span>' +
            '</div>' +
            '<div class="pile pile-discard ' + (canPick ? 'actionable' : '') + '" data-a="pickup">' +
              '<div class="discard-card-wrap">' +
                (top !== undefined ? cardHTML(top) : '<div class="card empty-card" style="opacity:.25"></div>') +
              '</div>' +
              '<span class="pile-lbl">DISCARD</span>' +
            '</div>' +
            '<div class="pile wildbox">' +
              '<div class="wild-card-wrap">' +
                cardHTML(S.cut) +
              '</div>' +
              '<span class="pile-lbl">WILD JOKER</span>' +
            '</div>' +
            finishHTML +
          '</div>' +
        '</div>' +

        '<!-- Main Player Hand (Bottom) -->' +
        '<div class="hand-lane">' +
          '<div class="hand-header-bar">' +
            '<div class="hand-header-left">' +
              '<div class="player-identity-tag me ' + (mineTurn ? 'turn' : '') + '">' +
                '<span class="player-tag-name">' + esc(myShortName) + '</span>' +
                '<span class="player-tag-score">' + myTot + ' pts</span>' +
              '</div>' +
              '<div class="hand-stats-pills">' +
                '<span class="mpill ' + (stats.pure ? 'ok' : 'no') + '">Pure ' + Math.min(stats.pure, 1) + '/1</span>' +
                '<span class="mpill ' + (stats.seqs >= 2 ? 'ok' : 'no') + '">Seq ' + Math.min(stats.seqs, 2) + '/2</span>' +
                '<span class="mpill score-pill">Dead ' + stats.dead + '</span>' +
              '</div>' +
            '</div>' +
            (msg[0] ? '<div class="hand-header-sep"></div><div class="hand-header-right"><div class="status-turn-hint ' + (mineTurn ? 'mine' : '') + '">' + esc(msg[0]) + (msg[1] ? ' · ' + esc(msg[1]) : '') + '</div></div>' : '') +
          '</div>' +
          '<div class="hand-cards" id="hand">' + handHTML + '</div>' +
        '</div>' +
      '</main>';

    var html =
      '<div class="shell">' +
        topBarHTML +
        '<div class="table-area">' +
          feltHTML +
        '</div>' +
        actionGrid +
        '</div>' +
      '</div>' +
      menuModalHTML +
      (S.phase === 'ended' && dismissed !== S.round + ':' + (S.result.winner) ? resultHTML() : '') +
      (scoresOpen ? scoresHTML() : '') + (rulesOpen ? rulesHTML() : '') + leaveModalHTML + wrongModalHTML;

    var handEl = document.getElementById('hand'), keepScroll = handEl ? handEl.scrollLeft : 0;
    $app.innerHTML = html;
    var h2 = document.getElementById('hand'); if (h2) h2.scrollLeft = keepScroll;

    var tk = S.round + ':' + S.turnN + ':' + S.turn;
    if (S.phase === 'play' && mineTurn && S.stage === 'draw' && tk !== lastTurnKey) sfx('turn');
    if (S.phase === 'ended' && lastTurnKey !== 'end' + S.round) { lastTurnKey = 'end' + S.round; sfx('win'); }
    else if (S.phase === 'play') lastTurnKey = tk;
    checkTurnAlert(mineTurn);
    postRender();
    onTick();
  }

  function scoresHTML() {
    var tot = (S.result ? S.result.totals : S.baseTotals) || {};
    var rows = Object.keys(tot).sort(function (a, b) { return tot[a] - tot[b]; }).map(function (u) {
      return '<div class="res-row" style="grid-template-columns:1fr 80px"><div class="nm">' + avatar(u) + '<span>' + esc(pname(u)) + '</span></div><div class="num">' + tot[u] + '</div></div>';
    }).join('');
    return '<div class="modal" data-a="closescores"><div class="sheet" style="width:min(420px,100%)"><h2>Scores</h2><p>' + (S.limit ? 'Out at ' + S.limit + ' points.' : 'Lowest total leads.') + '</p>' + rows + '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-a="closescores">Close</button></div></div></div>';
  }

  function resultHTML() {
    var R = S.result, host = isHost();
    if (!R) return '';

    var winnerUid = R.winner;
    var wPlayer = players[winnerUid] || { name: 'Player' };
    var wIsBot = !!wPlayer.bot || /\(bot\)/i.test(wPlayer.name || '');
    var wIsMe = (winnerUid === me.uid);
    var wRawName = (wPlayer.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
    var wDisplayName = wIsMe ? 'You' : wRawName;
    var wTitle = R.gameOver ? (wDisplayName + ' wins the game!') : (wDisplayName + ' won the deal');

    var wrongNotice = R.wrongDeclarer ?
      '<div class="results-alert bad">⚠️ ' + esc(pname(R.wrongDeclarer)) + ' made an invalid declaration (+80 penalty points).</div>' : '';
    var elimNotice = (R.elim && R.elim.length) ?
      '<div class="results-alert elim">Eliminated: ' + R.elim.map(function (u) { return esc(pname(u)); }).join(', ') + '</div>' : '';

    var order = S.order.slice().sort(function (a, b) {
      if (a === R.winner) return -1;
      if (b === R.winner) return 1;
      return (R.points[a] || 0) - (R.points[b] || 0);
    });

    var rows = order.map(function (u, ri) {
      var p = players[u] || { name: 'Player' };
      var isBot = !!p.bot || /\(bot\)/i.test(p.name || '');
      var isMe = (u === me.uid);
      var isPlayerHost = (room && (room.host === u || room.hostId === u));
      var rawName = (p.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
      var shortName = rawName.length > 9 ? rawName.slice(0, 8) + '…' : rawName;

      var g = R.groups && R.groups[u];
      var handHTML = '';
      if (g) {
        var groupCards = (g.groups || []).map(function (ids) {
          return '<div class="res-card-group meld">' +
            ids.map(function (id) { return cardHTML(id, 'small'); }).join('') +
          '</div>';
        }).join('');

        var leftoverCards = (g.leftover && g.leftover.length) ?
          '<div class="res-card-group leftover" title="Unmatched Cards">' +
            g.leftover.map(function (id) { return cardHTML(id, 'small'); }).join('') +
          '</div>' : '';

        handHTML = '<div class="res-hand-lane">' + groupCards + leftoverCards + '</div>';
      } else {
        handHTML = '<div class="res-hand-lane"><span class="td-dropped-pill">Dropped</span></div>';
      }

      var pts = R.points[u] !== undefined ? R.points[u] : 0;
      var tot = (R.totals && R.totals[u] !== undefined) ? R.totals[u] : pts;
      var isWinner = (u === R.winner);

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

    var btns = host
      ? (R.gameOver
          ? '<button class="btn gold results-btn" data-a="lobby">New game</button>'
          : '<button class="btn gold results-btn" data-a="next">Next deal</button><button class="btn results-btn" data-a="lobby">Back to lobby</button>')
      : '<span class="results-waiting-note">Waiting for host…</span>';

    return '<div class="modal results-modal">' +
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
  }

  function rulesHTML() {
    return '<div class="modal" data-a="closerules"><div class="sheet"><h2>How to play</h2><div class="cols2"><div>' +
      '<h3>Goal</h3><p>Arrange your 13 cards into melds and declare first. Everyone else scores penalty points for cards left outside melds. Lowest total is best.</p>' +
      '<h3>Cards</h3><p>Two decks plus four printed jokers. Each player gets 13. One card is cut to pick the wild joker rank for the deal (if a printed joker is cut, Aces are wild). One card starts the open pile.</p>' +
      '<h3>Your turn</h3><ul><li>Draw one card from the stock or the open pile.</li><li>Then discard one card, or declare.</li><li>Jokers cannot be taken from the open pile, and you cannot throw back the card you just took from it.</li></ul>' +
      '<h3>Melds</h3><ul><li><b>Pure sequence:</b> 3 or more cards in a row, same suit, no joker standing in. A wild-rank card in its natural place still counts as pure.</li><li><b>Sequence:</b> same, but jokers may fill gaps.</li><li><b>Set:</b> 3 or 4 cards of one rank in different suits. Jokers may fill in.</li><li>Aces run low (A-2-3) or high (Q-K-A), never around the corner.</li></ul></div><div>' +
      '<h3>Declaring</h3><p>You need at least two sequences and one of them must be pure. Every other card must sit in a valid sequence or set. Draw your 14th card, then drop your discard into the Finish Slot or tap Declare. If your 13 cards qualify (at least 2 sequences including 1 pure sequence), any valid grouping is accepted! If you declare with an invalid hand, an 80-point penalty is applied as per RajRummy rules.</p>' +
      '<h3>Scoring</h3><ul><li>A, K, Q, J and 10 are worth 10. Number cards are face value. Jokers are 0.</li><li>Winner scores 0.</li><li>Others score their unmatched cards, up to 80. With no pure sequence, every card counts.</li><li>Drop before your first draw: 20. Drop after drawing: 40.</li><li>Run out of turn time twice in a row and you drop.</li></ul>' +
      '<h3>Game types</h3><ul><li><b>Points:</b> keep playing deals and keep a running total.</li><li><b>Pool 101 / 201:</b> reach the limit and you are out. Last one in wins.</li></ul>' +
      '<h3>Controls</h3><p>Tap cards to select them. Group puts them in a new meld. Tap a dashed meld to move selected cards into it. Smart arrange finds the best melds for you.</p></div></div>' +
      '<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn gold" data-a="closerules">Got it</button></div></div></div>';
  }


  /* ================= dealer ================= */
  var QUIPS = [
    'Cards do not shuffle themselves, you know.',
    'I have seen that bluff before.',
    'Pure sequence first. Always.',
    'Keep your jokers close.',
    'Good luck. You will need a little of it.',
    'Take your time. The timer will not.',
    'Eyes on the open discard pile!',
    'Remember: an invalid declare costs 80 points.'
  ];
  var DEALER_HTML = '<div class="dealer-avatar">' +
    '<div class="dealer-frame">' +
      '<img src="dealer.png" alt="Dealer" class="dealer-img" draggable="false" onerror="this.src=\'dealer.jpg\'" />' +
      '<div class="dealer-nametag">DEALER</div>' +
    '</div>' +
  '</div>';

  function dealerHTML(o) {
    o = o || {};
    var now = Date.now(), cls = 'dealer', style = '--t0:-' + ((now % 6000) / 1000).toFixed(2) + 's;';
    if (o.home) cls += ' dealer-home';
    if (dealerAct && now - dealerAct.t < dealerAct.dur) { cls += ' ' + dealerAct.name; style += '--ad:-' + ((now - dealerAct.t) / 1000).toFixed(2) + 's;'; }
    var b = dealerBubble && now - dealerBubble.t < 4200 ? dealerBubble : null;
    if (b && now - b.t < 1800) cls += ' talk';
    var txt = o.staticText || (b && b.text), bub = '';
    if (txt) bub = '<div class="bubble" id="bubble" style="animation-delay:-' + (b && !o.staticText ? ((now - b.t) / 1000).toFixed(2) : '1') + 's">' + esc(txt) + '</div>';
    return '<div class="' + cls + '" style="' + style + '" data-a="dealer" title="Tap the dealer" role="img" aria-label="Dealer">' + DEALER_HTML + bub + '</div>';
  }
  function dealerPlay(name, dur) {
    dealerAct = { name: name, t: Date.now(), dur: dur };
    var d = document.querySelector('.dealer');
    if (d) { d.classList.remove(name); void d.getBoundingClientRect(); d.style.setProperty('--ad', '0s'); d.classList.add(name); setTimeout(function () { d.classList.remove(name); }, dur); }
  }
  function dealerSay(text) {
    dealerBubble = { text: text, t: Date.now() };
    var d = document.querySelector('.dealer-cell, .dealer'); if (!d) return;
    var b = d.querySelector('.dealer-bubble, .bubble');
    if (!b) { b = document.createElement('div'); b.className = d.classList.contains('dealer-home') ? 'bubble' : 'dealer-bubble'; b.id = 'bubble'; d.appendChild(b); }
    b.textContent = text;
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () {
      var x = document.getElementById('bubble');
      if (x) {
        if (d && d.classList.contains('dealer-home')) {
          x.textContent = 'Welcome to the table! Make a room and share the code.';
        } else {
          x.remove();
        }
      }
      dealerBubble = null;
    }, 2500);
  }
  function wildLabel() { return S.wild === 1 && L.INFO[S.cut].joker ? 'Ace' : L.RANK_LBL[S.wild]; }

    /* ================= background tab alert ================= */
  function startTitleFlash() {
    if (titleTimer) return;
    var flag = false;
    titleTimer = setInterval(function () {
      document.title = flag ? 'YOUR TURN! - Cards24' : 'Cards24 - Indian Rummy';
      flag = !flag;
    }, 750);
  }

  function stopTitleFlash() {
    if (titleTimer) {
      clearInterval(titleTimer);
      titleTimer = null;
      document.title = origTitle;
    }
  }

  function checkTurnAlert(mineTurn) {
    if (mineTurn) {
      if (!wasMineTurn) {
        wasMineTurn = true;
        sfx('turn');
        try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]); } catch (e) {}
        if (document.hidden) startTitleFlash();
      }
    } else {
      wasMineTurn = false;
      stopTitleFlash();
    }
  }

  /* ================= animation helpers ================= */
  function rectOf(x) { var el = typeof x === 'string' ? document.querySelector(x) : x; return el ? el.getBoundingClientRect() : null; }
  function captureFor(a) {
    try {
      var r = null;
      if (a.type === 'drawStock') r = rectOf('.pile[data-a=stock] .stack');
      else if (a.type === 'drawDiscard') r = rectOf('.pile[data-a=pickup] .card');
      else if (a.type === 'discard') r = rectOf('#hand [data-card="' + a.card + '"]');
      return r;
    } catch (e) { return null; }
  }
  function fly(from, to, html, o) {
    o = o || {};
    var f = from && from.getBoundingClientRect ? from.getBoundingClientRect() : from, t = to && to.getBoundingClientRect ? to.getBoundingClientRect() : to;
    if (!f || !t || reduced) { if (o.hide) o.hide.style.visibility = ''; if (o.done) o.done(); return; }
    var base = rectOf('.pile[data-a=stock] .stack') || { width: 50, height: 70 }, w = base.width, h = base.height;
    var isBack = html.indexOf('class="back"') >= 0;
    var front = o.flip || (isBack ? '' : html), back = isBack ? html : '<div class="back"></div>';
    var startUp = !o.flip && !isBack, endUp = !!o.flip || startUp;
    var el = document.createElement('div'); el.className = 'flyer'; el.style.width = w + 'px'; el.style.height = h + 'px';
    el.innerHTML = '<div class="fi"><div class="ff">' + front + '</div><div class="fb">' + back + '</div></div>';
    document.body.appendChild(el);
    var x0 = f.left + f.width / 2 - w / 2, y0 = f.top + f.height / 2 - h / 2, x1 = t.left + t.width / 2 - w / 2, y1 = t.top + t.height / 2 - h / 2;
    var s0 = o.s0 == null ? 1 : o.s0, s1 = o.s1 == null ? 1 : o.s1, dur = o.dur || 420, rot = o.rot == null ? (x1 > x0 ? 8 : -8) : o.rot;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.min(40, Math.abs(y1 - y0) * .25 + 16);
    function T(x, y, sc, r) { return 'translate(' + x + 'px,' + y + 'px) scale(' + sc + ') rotate(' + r + 'deg)'; }
    var fi = el.firstChild; fi.style.transform = 'rotateY(' + (startUp ? 180 : 0) + 'deg)';
    if (o.hide) o.hide.style.visibility = 'hidden';
    animLockUntil = Math.max(animLockUntil, Date.now() + dur + 40);
    var an = el.animate([{ transform: T(x0, y0, s0, 0) }, { transform: T(mx, my, Math.max(s0, s1) * 1.08, rot), offset: .5 }, { transform: T(x1, y1, s1, 0) }], { duration: dur, easing: 'cubic-bezier(.22,.8,.25,1)', fill: 'forwards' });
    if (startUp !== endUp) fi.animate([{ transform: 'rotateY(' + (startUp ? 180 : 0) + 'deg)' }, { transform: 'rotateY(' + (endUp ? 180 : 0) + 'deg)' }], { duration: dur * .85, easing: 'ease-in-out', fill: 'forwards' });
    var fin = false;
    function end() { if (fin) return; fin = true; el.remove(); if (o.hide) o.hide.style.visibility = ''; if (o.done) o.done(); }
    an.onfinish = end; setTimeout(end, dur + 600);
  }
  function flyAfter(a, pre, next) {
    try {
      if (!pre) return;
      var hand = next.hands[me.uid] || [];
      if (a.type === 'drawStock' || a.type === 'drawDiscard') {
        var id = hand[hand.length - 1], tgt = document.querySelector('#hand [data-card="' + id + '"]');
        if (!tgt) return;
        if (a.type === 'drawStock') fly(pre, tgt, '<div class="back"></div>', { hide: tgt, flip: cardHTML(id), dur: 480 });
        else fly(pre, tgt, cardHTML(id), { hide: tgt, dur: 380 });
      } else if (a.type === 'discard') {
        var top = document.querySelector('.pile[data-a=pickup] .card');
        if (top) fly(pre, top, cardHTML(a.card), { hide: top, dur: 360 });
      }
    } catch (e) { /* animation is cosmetic */ }
  }
  function chipFor(u) { var all = document.querySelectorAll('.seat-chip, .opp'); for (var i = 0; i < all.length; i++) if (all[i].dataset.u === u) return all[i]; return null; }
  function fanHTML(n) { var h = ''; for (var i = 0; i < Math.min(n, 6); i++) h += '<i></i>'; return h; }
  function setSeatCount(u, n) { var chip = chipFor(u); if (!chip) return; var c = chip.querySelector('.chip-cards-cnt, .cnt'), fan = chip.querySelector('.mini-fan'); if (c) c.textContent = n; if (fan) fan.innerHTML = fanHTML(n); }
  function seatTarget(u) { var chip = chipFor(u); if (!chip) return null; var fan = chip.querySelector('.chip-avatar-wrap, .mini-fan, .avatar'); return (fan || chip).getBoundingClientRect(); }
  function remoteFlights() {
    var e = S.last; if (!e || e.u === me.uid) return;
    var to = seatTarget(e.u); if (!to) return;
    var stockR = rectOf('.pile[data-a=stock] .stack'), openEl = document.querySelector('.pile[data-a=pickup] .card');
    if (e.a === 'stock') fly(stockR, to, '<div class="back"></div>', { s1: .42 });
    else if (e.a === 'pickup' && e.c != null && openEl) fly(openEl, to, cardHTML(e.c), { s1: .42 });
    else if (e.a === 'discard' && e.c != null && openEl) fly(to, openEl, '<div class="back"></div>', { flip: cardHTML(e.c), s0: .42, hide: openEl, dur: 460 });
  }
  var dealUntil = 0;
  function animateDeal() {
    var isReduced = false;
    try { isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { isReduced = false; }
    if (reduced || isReduced) return;
    var dealerEl = document.querySelector('.dealer-cell, .felt > .dealer'), sr = rectOf('.pile[data-a=stock] .stack');
    if (!dealerEl || !sr) return;
    var dr = dealerEl.getBoundingClientRect(), origin = { left: dr.left + dr.width * .66, top: dr.top + dr.height * .74, width: 0, height: 0 };
    var si = S.order.indexOf(S.turn), seq = si < 0 ? S.order.slice() : S.order.slice(si).concat(S.order.slice(0, si)), n = seq.length;
    var mine = (S.hands[me.uid] || []).slice();
    var dealerNode = dealerEl; dealerNode.classList.add('dealing');
    var hidden = [];
    mine.forEach(function (id) { var el = document.querySelector('#hand [data-card="' + id + '"]'); if (el) { el.style.visibility = 'hidden'; hidden.push(el); } });
    var openId = S.discard[S.discard.length - 1], openEl = document.querySelector('.pile[data-a=pickup] .card'), cutEl = document.querySelector('.wildbox .card');
    if (openEl) { openEl.style.visibility = 'hidden'; hidden.push(openEl); }
    if (cutEl) { cutEl.style.visibility = 'hidden'; hidden.push(cutEl); }
    var shown = {}; seq.forEach(function (u) { shown[u] = 0; if (u !== me.uid) setSeatCount(u, 0); });
    var back = '<div class="back"></div>';

    // Cap flyers: animate round-by-round so no more than n <= 6 <= 13 flyers are in flight simultaneously
    var roundStep = Math.max(90, Math.min(130, 1800 / 13));
    var flyDur = 250;
    var total = Math.round(13 * roundStep + flyDur + 500);
    dealUntil = Date.now() + total; animLockUntil = Math.max(animLockUntil, dealUntil);

    for (var r = 0; r < 13; r++) {
      (function (roundIdx) {
        setTimeout(function () {
          seq.forEach(function (u) {
            var isMe = u === me.uid, cid = isMe ? mine[roundIdx] : null;
            var to = isMe ? rectOf('#hand [data-card="' + cid + '"]') : seatTarget(u);
            if (!to) return;
            if (isMe) {
              fly(origin, to, back, {
                flip: cardHTML(cid),
                s0: .7,
                dur: flyDur,
                done: function () {
                  var el = document.querySelector('#hand [data-card="' + cid + '"]');
                  if (el) { el.style.visibility = ''; el.classList.add('fresh'); }
                  sfx('deal');
                }
              });
            } else {
              fly(origin, to, back, {
                s0: .7,
                s1: .42,
                dur: flyDur,
                done: function () {
                  shown[u]++;
                  setSeatCount(u, shown[u]);
                  sfx('deal');
                }
              });
            }
          });
        }, roundIdx * roundStep);
      })(r);
    }
    var afterRounds = 13 * roundStep + flyDur;
    setTimeout(function () { if (openEl) fly(origin, openEl, back, { flip: cardHTML(openId), dur: 320, hide: openEl }); }, afterRounds);
    setTimeout(function () { if (cutEl) fly(origin, cutEl, back, { flip: cardHTML(S.cut), dur: 340, hide: cutEl }); }, afterRounds + 140);
    setTimeout(function () {
      dealerNode.classList.remove('dealing');
      hidden.forEach(function (el) { el.style.visibility = ''; });
      seq.forEach(function (u) { if (u !== me.uid) setSeatCount(u, (S.hands[u] || []).length); });
    }, total);
  }
  function confetti(big) {
    if (reduced) return;
    var cv = document.createElement('canvas'); cv.width = window.innerWidth; cv.height = window.innerHeight;
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90';
    document.body.appendChild(cv);
    var g = cv.getContext('2d'), cols = ['#f0b13f', '#ffd98a', '#c8232c', '#fbf9f3', '#4fd08c', '#8fb7ff'], ps = [], n = big ? 160 : 70, i;
    for (i = 0; i < n; i++) ps.push({ x: cv.width * (.2 + Math.random() * .6), y: cv.height * .35, vx: (Math.random() - .5) * 10, vy: -Math.random() * 11 - 3, s: 5 + Math.random() * 6, c: cols[i % cols.length], r: Math.random() * 6, vr: (Math.random() - .5) * .4 });
    var t0 = performance.now();
    (function frame(t) {
      g.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function (p) { p.vy += .28; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * .6); g.restore(); });
      if (t - t0 < 2800) requestAnimationFrame(frame); else cv.remove();
    })(t0);
  }
  function dealerReact() {
    var e = S.last; if (!e) return;
    var n = pname(e.u);
    if (e.a === 'leave') { dealerSay(n + ' left the table.'); dealerPlay('talk', 1200); }
    else if (e.a === 'wrong_declare') { dealerSay('⚠️ Wrong declaration by ' + n + '! 80 penalty points.'); dealerPlay('clap', 1800); }
    else if (e.a === 'drop') dealerSay(n + ' steps out of this deal.');
    else if (e.a === 'kick') dealerSay('Time is up for ' + n + '.');
    else if (e.a === 'declare') { dealerSay(n + ' declares! Let us see the hands.'); dealerPlay('clap', 1800); }
    else if (e.a === 'pickup' && e.u !== me.uid && Math.random() < .3) dealerSay(n + ' likes that card.');
    else if (S.phase === 'play' && S.turn === me.uid && S.stage === 'draw' && e.u !== me.uid && e.a === 'discard') dealerSay('Your move, ' + (me.name || 'player') + '.');
    else if (S.stock.length === 8 && e.a === 'stock') dealerSay('Only a few cards left in the stock.');
  }
  function postRender() {
    fitHand();
    var dk = S.round + ':' + S.startedAt, fresh = lastAnimV === null, changed = S.v !== lastAnimV;
    var newDeal = S.phase === 'play' && S.turnN === 0 && !S.last && dk !== lastDealKey && Math.abs(Date.now() - S.startedAt) < 10000;
    if (newDeal) {
      lastDealKey = dk; endKey = ''; animateDeal(); dealerSay('Shuffled and dealt. The wild joker is ' + wildLabel() + '.');
    } else if (fresh) { lastDealKey = dk; endKey = S.phase === 'ended' ? dk : ''; }
    else if (changed) { remoteFlights(); dealerReact(); }
    if (S.phase === 'ended' && endKey !== dk && !fresh) {
      endKey = dk; var R = S.result, w = R.gameOver ? R.champion : R.winner;
      confetti(w === me.uid); dealerPlay('clap', 2200);
      dealerSay(pname(w) + (R.gameOver ? ' wins the game. Well played!' : ' takes the deal. Lovely hand!'));
    }
    lastAnimV = S.v;
  }

  /* ================= drag and drop ================= */
  function ghostPos(ev) { if (drag && drag.ghost) drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.ox) + 'px,' + (ev.clientY - drag.oy) + 'px) rotate(-3deg)'; }
  function startDrag(ev) {
    var ids = sel[drag.id] ? selIds() : [drag.id];
    ids = sortCards(ids);
    drag.ids = ids; drag.on = true; dragIds = {}; ids.forEach(function (i) { dragIds[i] = 1; });
    var g = document.createElement('div'); g.className = 'dragghost'; g.innerHTML = ids.map(function (i) { return cardHTML(i); }).join('');
    document.body.appendChild(g); drag.ghost = g;
    var r = drag.el.getBoundingClientRect(); drag.ox = r.width / 2; drag.oy = r.height * .7;
    ids.forEach(function (i) { var c = document.querySelector('#hand [data-card="' + i + '"]'); if (c) c.classList.add('ghosted'); });
    try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { /* no haptics */ }
  }
  function dropTarget(x, y) {
    if (drag && drag.ghost) drag.ghost.style.display = 'none';
    var el = document.elementFromPoint(x, y);
    if (drag && drag.ghost) drag.ghost.style.display = '';
    return el;
  }
  function endDrag(ev, cancel) {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.on) return;
    var over = document.querySelector('.group.over'); if (over) over.classList.remove('over');
    var overFin = document.querySelector('.finish-pile.over'); if (overFin) overFin.classList.remove('over');
    if (d.ghost) d.ghost.remove();
    dragIds = null;
    var el = cancel ? null : dropTarget(ev.clientX, ev.clientY), set = {};
    d.ids.forEach(function (i) { set[i] = 1; });

    var inGame = S && S.order.indexOf(me.uid) >= 0 && S.status[me.uid] === 'active';
    var mineTurn = inGame && S.phase === 'play' && S.turn === me.uid;
    var finishTarget = el && el.closest('.finish-pile, [data-a=finish]');
    if (finishTarget && mineTurn && S.stage === 'discard') {
      handleFinishWithCard(d.ids[0]);
      return;
    }
    var openTarget = el && el.closest('.pile[data-a=pickup]');
    if (openTarget && mineTurn && S.stage === 'discard') {
      act({ type: 'discard', card: d.ids[0] });
      return;
    }

    var grp = el && el.closest('.group'), inHand = el && el.closest('#hand');
    if (!grp && !inHand) { renderRoom(); return; }
    var target = null, idx = 0;
    if (grp) {
      target = layout[+grp.dataset.g];
      Array.prototype.forEach.call(grp.querySelectorAll('[data-card]'), function (c) {
        if (set[+c.dataset.card]) return;
        var r = c.getBoundingClientRect(); if (r.left + r.width * .3 < ev.clientX) idx++;
      });
    }
    var gi = layout.length;
    if (!grp) {
      var gs = document.querySelectorAll('#hand .group'); gi = 0;
      Array.prototype.forEach.call(gs, function (g) { var r = g.getBoundingClientRect(); if (r.left + r.width / 2 < ev.clientX) gi++; });
    }
    layout.forEach(function (g) { for (var i = g.length - 1; i >= 0; i--) if (set[g[i]]) g.splice(i, 1); });
    if (target) Array.prototype.splice.apply(target, [idx, 0].concat(d.ids));
    else { var left = layout.filter(function (g) { return g.length; }); left.splice(Math.min(gi, left.length), 0, d.ids.slice()); layout = left; }
    layout = layout.filter(function (g) { return g.length; });
    sel = {}; saveLayout(); renderRoom();
  }

  document.addEventListener('pointerdown', function (ev) {
    if (ev.button > 0) return;
    pointerIsDown = true;
    activePointer = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, moved: false };
    if (!S || S.phase !== 'play') return;
    var c = ev.target.closest('#hand [data-card]');
    if (c) drag = { id: +c.dataset.card, x: ev.clientX, y: ev.clientY, on: false, el: c };
  });

  document.addEventListener('pointermove', function (ev) {
    if (activePointer && ev.pointerId === activePointer.id) {
      if (Math.hypot(ev.clientX - activePointer.x, ev.clientY - activePointer.y) >= 10) {
        activePointer.moved = true;
      }
    }
    if (!drag) return;
    if (!drag.on) {
      if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 10) return;
      startDrag(ev);
    }
    ghostPos(ev);
    var el = dropTarget(ev.clientX, ev.clientY), grp = el && el.closest('.group');
    var finishEl = el && el.closest('.finish-pile, [data-a=finish]');
    var prev = document.querySelector('.group.over'); if (prev && prev !== grp) prev.classList.remove('over');
    var prevFinish = document.querySelector('.finish-pile.over'); if (prevFinish && prevFinish !== finishEl) prevFinish.classList.remove('over');
    if (grp) grp.classList.add('over');
    if (finishEl) finishEl.classList.add('over');
  });

  document.addEventListener('pointerup', function (ev) {
    var wasDragging = drag && drag.on;
    if (wasDragging) {
      didRealDrag = true;
      endDrag(ev, false);
    } else {
      drag = null;
    }

    if (!wasDragging && activePointer && ev.pointerId === activePointer.id) {
      var dist = Math.hypot(ev.clientX - activePointer.x, ev.clientY - activePointer.y);
      if (dist < 10) {
        handleTapOrAction(ev.target, ev);
      }
    }
    activePointer = null;
    pointerIsDown = false;
    if (deferredRender) {
      deferredRender = false;
      requestAnimationFrame(function () {
        renderRoom();
      });
    }
  });

  document.addEventListener('pointercancel', function (ev) {
    if (drag && drag.on) {
      endDrag(ev, true);
    } else {
      drag = null;
    }
    activePointer = null;
    pointerIsDown = false;
    if (deferredRender) {
      deferredRender = false;
      requestAnimationFrame(function () {
        renderRoom();
      });
    }
  });

  /* ================= targeted updates & event routing ================= */
  function updateHandSelection() {
    var handEl = document.getElementById('hand');
    if (!handEl) { renderRoom(); return; }
    var cards = handEl.querySelectorAll('.card');
    cards.forEach(function (c) {
      var cid = +c.dataset.card;
      c.classList.toggle('sel', !!sel[cid]);
    });
    var selList = selIds(), pickSel = selList.length === 1 ? selList[0] : null;
    var discardBtn = document.querySelector('[data-a="discard"]');
    var groupBtn = document.querySelector('[data-a="group"]');
    var inGame = S && S.order.indexOf(me.uid) >= 0 && S.status[me.uid] === 'active';
    var mineTurn = inGame && S.phase === 'play' && S.turn === me.uid;
    if (discardBtn) {
      if (mineTurn && S.stage === 'discard' && pickSel != null) discardBtn.removeAttribute('disabled');
      else discardBtn.setAttribute('disabled', 'disabled');
    }
    if (groupBtn) {
      if (selList.length > 0) groupBtn.removeAttribute('disabled');
      else groupBtn.setAttribute('disabled', 'disabled');
    }
  }

  function handleTapOrAction(rawTarget, ev) {
    if (!rawTarget) return;
    lastTapHandledAt = Date.now();

    // Priority 1: Check for an action element with [data-a]
    var actionEl = rawTarget.closest('[data-a]');
    if (actionEl) {
      var a = actionEl.dataset.a;
      if (actionEl.classList.contains('modal') && rawTarget !== actionEl) return;
      executeAction(a, actionEl, ev);
      return;
    }

    // Priority 2: Check for hand card selection strictly inside #hand
    var handCard = rawTarget.closest('#hand [data-card]');
    if (handCard) {
      if (!S || S.phase !== 'play') return;
      var id = +handCard.dataset.card;
      try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* no haptics */ }
      if (sel[id]) delete sel[id]; else sel[id] = 1;
      updateHandSelection();
      return;
    }

    // Priority 3: Moving selected cards to a target group
    var g = rawTarget.closest('.group.target');
    if (g && !rawTarget.closest('[data-card]') && selIds().length) {
      moveSelectedTo(+g.dataset.g);
      return;
    }
  }

  function executeAction(a, el, ev) {
    switch (a) {
      case 'create': createRoom(); break;
      case 'join': joinRoom(document.getElementById('jc').value); break;
      case 'resume': document.getElementById('jc').value = el.dataset.code; joinRoom(el.dataset.code); break;
      case 'menu': menuOpen = true; renderRoom(); break;
      case 'closemenu': menuOpen = false; renderRoom(); break;
      case 'rules': menuOpen = false; rulesOpen = true; rerender(); break;
      case 'closerules': rulesOpen = false; rerender(); break;
      case 'scores': menuOpen = false; scoresOpen = true; renderRoom(); break;
      case 'closescores': scoresOpen = false; renderRoom(); break;
      case 'fullscreen': toggleFullscreen(); break;
      case 'dismisspwa':
        lsSet('rr-pwa-dismiss', '1');
        var ph = document.getElementById('pwa-hint');
        if (ph) ph.remove();
        break;
      case 'copy':
        var shareUrl = location.origin + location.pathname + '#r-' + code;
        try {
          navigator.clipboard.writeText(shareUrl).then(
            function () { toast('Invite link copied! Send to your friend.', true); },
            function () { toast('Room: ' + code, true); }
          );
        } catch (e) {
          toast('Room: ' + code, true);
        }
        break;
      case 'leave': menuOpen = false; leaveRoom(); break;
      case 'addbot': addBot(); break;
      case 'remove': removePlayer(el.dataset.u); break;
      case 'mode':
        if (room && el.dataset.m) {
          room.mode = el.dataset.m;
          renderLobby();
        }
        setRoom({ mode: el.dataset.m });
        break;
      case 'start': startDeal(true); break;
      case 'next': startDeal(false); break;
      case 'lobby': backToLobby(); break;
      case 'closeres': dismissed = S.round + ':' + S.result.winner; renderRoom(); break;
      case 'stock':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage === 'discard') { toast('You already drew a card. Choose a card to discard'); return; }
        act({ type: 'drawStock' });
        break;
      case 'pickup':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage === 'discard') { toast('You already drew a card. Choose a card to discard'); return; }
        var top = S.discard[S.discard.length - 1];
        if (top !== undefined && (L.INFO[top].joker || L.INFO[top].rank === S.wild)) {
          toast("Jokers can't be taken from the open pile");
          return;
        }
        act({ type: 'drawDiscard' });
        break;
      case 'discard':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage === 'draw') { toast('Tap the stock or the open card first'); return; }
        var s1 = selIds();
        if (s1.length !== 1) {
          toast('Select one card from your hand to discard');
          return;
        }
        if (S.pickup === s1[0]) {
          toast('You just picked this card up, choose another');
          return;
        }
        act({ type: 'discard', card: s1[0] });
        break;
      case 'finish':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage !== 'discard') { toast('Draw a card before finishing'); return; }
        var fSel = selIds();
        var fHand = S.hands[me.uid] || [];
        var fCard = fSel.length === 1 ? fSel[0] : chooseDeclareDiscard(fHand);
        handleFinishWithCard(fCard);
        break;
      case 'declare':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage !== 'discard') { toast('Draw a card before declaring'); return; }
        var di = declareInfo(S.hands[me.uid]), ok = di ? di.filter(function (e) { return e.valid; }) : [], pick = selIds()[0];
        var declCard = ok.some(function (e) { return e.id === pick; }) ? pick : (ok[0] && ok[0].id);
        var targetCard = pick != null ? pick : (declCard != null ? declCard : chooseDeclareDiscard(S.hands[me.uid]));
        handleFinishWithCard(targetCard);
        break;
      case 'confirmwrong':
        if (confirmWrongDeclareCard != null) {
          var wc = confirmWrongDeclareCard;
          confirmWrongDeclareCard = null;
          act({ type: 'declare', card: wc });
        }
        break;
      case 'cancelwrong':
        confirmWrongDeclareCard = null;
        renderRoom();
        break;
      case 'confirmleave':
        doLeaveRoom();
        break;
      case 'cancelleave':
        leaveModalOpen = false;
        renderRoom();
        break;
      case 'group': groupSelected(); break;
      case 'sort': sortBySuit(); break;
      case 'auto':
        autoArrange();
        toast('Hand auto-arranged', true);
        break;
      case 'drop':
        if (Date.now() < dealUntil) { toast('Cards are being dealt'); return; }
        if (!S || S.turn !== me.uid) { toast('Wait for your turn'); return; }
        if (S.stage !== 'draw') { toast('You can only drop before drawing'); return; }
        if (!confirmDrop) { confirmDrop = true; renderRoom(); setTimeout(function () { if (confirmDrop) { confirmDrop = false; renderRoom(); } }, 3000); }
        else act({ type: 'drop' });
        break;
      case 'kick': if (S) actAs(el.dataset.u, { type: 'kick' }); break;
      case 'react': reactOpen = true; renderRoom(); break;
      case 'closereact': reactOpen = false; renderRoom(); break;
      case 'emoji': react(el.dataset.e); break;
      case 'deck':
        deckStyle = deckStyle === 'classic' ? 'four' : 'classic';
        lsSet('rr-deck', deckStyle);
        if (window.RummyCards) RummyCards.setDeck(deckStyle);
        toast(deckStyle === 'four' ? 'Four-colour deck active' : 'Classic deck active');
        renderRoom();
        break;
      case 'cardback':
        var themes = ['emerald', 'burgundy', 'navy'];
        var bIdx = themes.indexOf(backTheme);
        backTheme = themes[(bIdx + 1) % themes.length];
        lsSet('rr-back', backTheme);
        if (window.RummyCards) RummyCards.setBack(backTheme);
        toast('Card back: ' + backTheme);
        renderRoom();
        break;
      case 'felt': felt = { emerald: 'crimson', crimson: 'midnight', midnight: 'emerald' }[felt]; lsSet('rr-felt', felt); renderRoom(); break;
      case 'dealer': dealerSay(QUIPS[Math.floor(Math.random() * QUIPS.length)]); dealerPlay('clap', 900); break;
      case 'mute': muted = !muted; lsSet('rr-muted', muted ? '1' : '0'); renderRoom(); break;
    }
  }

  document.addEventListener('click', function (ev) {
    if (didRealDrag) {
      didRealDrag = false;
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (Date.now() - lastTapHandledAt < 400) {
      return;
    }
    handleTapOrAction(ev.target, ev);
  });
  document.addEventListener('change', function (ev) { if (ev.target.dataset && ev.target.dataset.a === 'timer') setRoom({ turnSecs: +ev.target.value }); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.id === 'jc') joinRoom(ev.target.value);
    if (ev.key === 'Escape') { menuOpen = false; rulesOpen = false; scoresOpen = false; reactOpen = false; if (code) renderRoom(); else rerender(); }
  });
  window.addEventListener('resize', fitHand);
  function rerender() { if (code && room) renderRoom(); else { var jc = document.getElementById('jc'), nm = document.getElementById('nm'); var v = [jc ? jc.value : '', nm ? nm.value : '']; if (nm) me.name = v[1]; renderHome(v[0]); if (rulesOpen) { $app.insertAdjacentHTML('beforeend', rulesHTML()); } } }

  window.__RR = {
    get S() { return S; },
    set S(v) { S = v; },
    get db() { return db; },
    get room() { return room; },
    set room(v) { room = v; },
    get players() { return players; },
    set players(v) { players = v; },
    get me() { return me; },
    set me(v) { me = v; },
    get code() { return code; },
    set code(v) { code = v; },
    get menuOpen() { return menuOpen; },
    set menuOpen(v) { menuOpen = v; },
    get dismissed() { return dismissed; },
    set dismissed(v) { dismissed = v; },
    get sel() { return sel; },
    set sel(v) { sel = v; },
    get dealUntil() { return dealUntil; },
    set dealUntil(v) { dealUntil = v; },
    get confirmWrongDeclareCard() { return confirmWrongDeclareCard; },
    set confirmWrongDeclareCard(v) { confirmWrongDeclareCard = v; },
    act: act,
    toast: toast,
    renderRoom: renderRoom,
    renderTable: renderTable,
    fitHand: fitHand,
    startDeal: startDeal
  };

  boot();
})();