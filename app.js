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
      }
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
        clearInterval(pingTimer);
        pingTimer = setInterval(function () { send({ t: 'ping' }); }, 20000);
      };

      ws.onmessage = function (ev) {
        try {
          var m = JSON.parse(ev.data);
          if (!m || !m.t) return;
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
        get: function () { return Promise.resolve(snap(path)); },
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
        get: function () { return Promise.resolve(colSnap(path)); },
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
  var evCache = { key: '', ev: null }, playersSig = '', hb = null;
  var titleTimer = null, origTitle = 'Rummy Room', wasMineTurn = false;
  var leaveModalOpen = false, confirmWrongDeclareCard = null;
  var dealerAct = null, dealerBubble = null, bubbleTimer = null, lastAnimV = null, lastDealKey = '', endKey = '', animLockUntil = 0, renderPending = false;
  var dragIds = null, drag = null, suppressClick = false, lastBuzz = -1;
  var reduced = false; try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduced = false; }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function enqueue(fn) {
    wq = wq.then(async function () {
      try { await fn(); } catch (e1) {
        await sleep(900);
        try { await fn(); } catch (e2) { toast('Could not save: ' + ((e2 && e2.message) || (e2 && e2.code) || 'connection problem') + '. Check your connection.'); }
      }
    });
    return wq;
  }
  async function commit(next, prev, quiet) {
    var cur = await stateRef().get(), d = cur.exists ? cur.data() : null;
    if (d && prev && d.v !== prev.v) {
      if (d.v === next.v) return;
      S = d; renderRoom();
      if (!quiet) toast('The table moved on before your move was saved.');
      return;
    }
    await stateRef().set(next);
  }
  function roomRef() { return db.doc('rooms/' + code); }
  function stateRef() { return db.doc('rooms/' + code + '/game/state'); }
  function playersCol() { return db.collection('rooms/' + code + '/players'); }
  function isHost() { return !!room && room.hostId === me.uid; }
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
    var resume = lsGet('rr-room');
    $app.innerHTML =
      '<div class="home">' +
      '<div class="brand"><div class="suits"><span>♠</span><span>♥</span><span>♣</span><span>♦</span></div>' +
      '<h1>Rummy Room</h1><p>Thirteen-card Indian rummy for two to six players. Make a room, send the code, and play on one table.</p>' +
      dealerHTML({ staticText: 'Welcome to the table! Make a room and share the code.', home: true }) +
      '<div class="row" style="margin-top:14px"><button class="btn small ghost" data-a="rules">How to play</button>' +
      (offline ? '<span class="pill bad">Offline mode: this browser only</span>' : '<span class="pill ok">Live multiplayer</span>') + '</div></div>' +
      '<div class="panel">' +
      '<div class="field"><label for="nm">Your name</label><input id="nm" maxlength="14" autocomplete="off" value="' + esc(me.name) + '" placeholder="e.g. Aarav"></div>' +
      '<div class="row"><button class="btn gold grow" data-a="create">Create room</button></div>' +
      '<div class="divider">or join friends</div>' +
      '<div class="row"><div class="field grow" style="margin:0"><input id="jc" class="code" maxlength="6" placeholder="CODE" autocomplete="off" aria-label="Room code" value="' + esc(prefill || '') + '"></div>' +
      '<button class="btn" data-a="join">Join</button></div>' +
      (resume ? '<div class="note">Last room: <b>' + esc(resume) + '</b> <button class="btn small ghost" data-a="resume" data-code="' + esc(resume) + '">Rejoin</button></div>' : '') +
      (offline ? '<div class="note">Open this page from your claude.ai link with edit access to play across devices. Here, tabs of the same browser can join each other, and you can add bots.</div>' : '') +
      '</div></div>';
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
    unsubs.push(roomRef().onSnapshot(function (s) { room = s.exists ? s.data() : null; if (!room && code) { toast('This room no longer exists.'); lsSet('rr-room', ''); renderHome(); return; } renderRoom(); }));
    unsubs.push(playersCol().onSnapshot(function (s) {
      var m = {}, sigObj = {}; s.docs.forEach(function (d) { var v = d.data(); m[d.id] = v; var c = Object.assign({}, v); delete c.seen; sigObj[d.id] = c; });
      players = m;
      Object.keys(m).forEach(function (u) { var r = m[u].react; if (r && r.t !== seenReact[u]) { if (seenReact[u] !== undefined) floatEmoji(r.e, u); seenReact[u] = r.t; } });
      var sig = JSON.stringify(sigObj);
      if (sig !== playersSig) { playersSig = sig; renderRoom(); }
    }));
    unsubs.push(stateRef().onSnapshot(function (s) {
      var d = s.exists ? s.data() : null;
      if (S && d && d.round === S.round && d.v < S.v) return;
      S = d; renderRoom();
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
    enqueue(async function () { await stateRef().set(deal); await roomRef().update({ status: 'playing' }); });
  }
  function backToLobby() { enqueue(async function () { await stateRef().delete(); await roomRef().update({ status: 'lobby' }); }); dismissed = ''; }

  function act(a) {
    if (!S || Date.now() < dealUntil) return;
    try {
      var pre = captureFor(a), prev = S, next = L.apply(S, Object.assign({ uid: me.uid }, a), Date.now());
      S = next; confirmDrop = false;
      sfx(a.type === 'discard' ? 'discard' : 'draw');
      renderRoom();
      flyAfter(a, pre, next);
      enqueue(function () { return commit(next, prev, false); });
    } catch (e) { sfx('err'); toast(e.message || 'That move is not allowed.'); }
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
    if (!S || S.phase !== 'play' || !room) { var t0 = document.getElementById('timer'); if (t0) t0.textContent = ''; return; }
    var secs = room.turnSecs || 0, due = Math.max(S.turnAt, dealUntil) + secs * 1000;
    var left = secs ? Math.max(0, Math.ceil((due - Date.now()) / 1000)) : null;
    var tEl = document.getElementById('timer');
    if (tEl) {
      tEl.textContent = left === null ? '' : left + 's';
      tEl.classList.toggle('urgent', left !== null && left <= 5);
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
    if (!layout.length) layout = suitLayout(hand);
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
    var c = L.INFO[id], wild = S ? S.wild : 0, cls = 'card';
    if (c.joker) cls += ' joker'; else if (c.suit === 1 || c.suit === 2) cls += ' red';
    if (!c.joker && c.rank === wild) cls += ' wild';
    if (extra) cls += ' ' + extra;
    if (dragIds && dragIds[id]) cls += ' ghosted';
    if (c.joker) return '<div class="' + cls + '" data-card="' + id + '"><span class="tl">★</span><span class="mid">JOKER</span></div>';
    var sym = L.SUIT_SYM[c.suit] + '︎';
    return '<div class="' + cls + '" data-card="' + id + '"><span class="tl">' + L.RANK_LBL[c.rank] + '<b>' + sym + '</b></span><span class="mid">' + sym + '</span></div>';
  }
  var TAGS = ['Loose', 'Set', 'Sequence', 'Pure sequence'];
  function tagFor(g) { if (g.length < 3) return [0, 'Loose']; var t = L.classify(g, S.wild); return [t, t ? TAGS[t] : 'Not a meld']; }

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
    if (Date.now() < animLockUntil) {
      if (!renderPending) { renderPending = true; setTimeout(function () { renderPending = false; renderRoom(); }, animLockUntil - Date.now() + 20); }
      return;
    }
    if (!S || room.status === 'lobby') { renderLobby(); return; }
    renderTable();
    driveBots();
  }

  function renderLobby() {
    var ps = sortedPlayers(), host = isHost(), mode = room.mode || 'points';
    var seats = '';
    for (var i = 0; i < 6; i++) {
      var p = ps[i];
      seats += p
        ? '<div class="seat taken">' + avatar(p.uid) + '<div class="nm">' + esc(p.name) + '</div><div class="row" style="gap:4px;justify-content:center">' +
          (p.uid === room.hostId ? '<span class="pill gold">Host</span>' : '') + (p.bot ? '<span class="pill">Bot</span>' : '') + (!online(p) ? '<span class="pill bad">Away</span>' : '') + (p.uid === me.uid ? '<span class="pill ok">You</span>' : '') + '</div>' +
          (host && p.uid !== me.uid ? '<button class="btn small ghost x icon-btn" data-a="remove" data-u="' + esc(p.uid) + '" aria-label="Remove ' + esc(p.name) + '">✕</button>' : '') + '</div>'
        : '<div class="seat"><span style="color:var(--muted)">Open seat</span></div>';
    }
    var modes = Object.keys(L.MODES).map(function (k) {
      return '<button class="mode" data-a="mode" data-m="' + k + '" aria-pressed="' + (mode === k) + '" ' + (host ? '' : 'disabled') + '><b>' + L.MODES[k].label + '</b><span>' + L.MODES[k].blurb + '</span></button>';
    }).join('');
    $app.innerHTML =
      '<div class="lobby"><div class="col">' +
      '<div class="panel codebox"><div class="note" style="margin:0 0 4px">Room code. Share it with friends.</div><div class="code">' + esc(code) + '</div>' +
      '<div class="row" style="justify-content:center;margin-top:8px"><button class="btn small" data-a="copy">Copy code</button><button class="btn small ghost" data-a="rules">How to play</button><button class="btn small ghost" data-a="leave">Leave</button></div></div>' +
      '<div class="panel"><div class="row" style="justify-content:space-between;margin-bottom:8px"><b>Players ' + ps.length + '/6</b>' +
      (host ? '<button class="btn small" data-a="addbot" ' + (ps.length >= 6 ? 'disabled' : '') + '>Add bot</button>' : '') + '</div><div class="seats">' + seats + '</div></div></div>' +
      '<div class="col">' + (host ? '<button class="btn gold" data-a="start" ' + (ps.length < 2 ? 'disabled' : '') + '>' + (ps.length < 2 ? 'Waiting for a second player' : 'Deal the cards') + '</button>'
        : '<div class="panel" style="text-align:center;color:var(--muted)">Waiting for the host to deal.</div>') + '<div class="panel"><div class="note" style="margin:0 0 8px">Game type' + (host ? '' : ' (host chooses)') + '</div><div class="modes">' + modes + '</div>' +
      '<div class="field" style="margin-top:10px"><label for="ts">Turn timer</label><select id="ts" data-a="timer" ' + (host ? '' : 'disabled') + '>' +
      [20, 30, 45, 60, 0].map(function (n) { return '<option value="' + n + '"' + ((room.turnSecs || 0) === n ? ' selected' : '') + '>' + (n ? n + ' seconds' : 'No timer') + '</option>'; }).join('') + '</select></div></div>' +
      '</div></div>' + (rulesOpen ? rulesHTML() : '');
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

  function seatChipHTML(u) {
    var p = players[u] || { uid: u, name: pname(u) };
    var st = S.status[u], n = (S.hands[u] || []).length;
    var totals = (S.result ? S.result.totals : S.baseTotals) || {};
    var tot = totals[u] || 0;
    var isTurn = S.phase === 'play' && S.turn === u && st === 'active';
    var isBot = !!(p && p.bot);
    var rawName = (p.name || 'Player').replace(/\s*\(bot\)/i, '').trim();
    var shortName = rawName.length > 7 ? rawName.slice(0, 7) + '…' : rawName;
    var isAway = p && !online(p);

    var cls = 'seat-chip';
    if (isTurn) cls += ' turn';
    if (st !== 'active') cls += ' out';
    if (isAway) cls += ' away';

    var skipBtn = isHost() && isTurn && !isBot
      ? '<button class="btn small danger kick" data-a="kick" data-u="' + esc(u) + '" title="Skip">✕</button>'
      : '';

    return '<div class="' + cls + '" data-u="' + esc(u) + '">' +
      '<div class="chip-avatar-wrap">' + avatar(u) + '</div>' +
      '<div class="chip-body">' +
        '<div class="chip-row1">' +
          '<span class="chip-name">' + esc(shortName) + '</span>' +
          (isBot ? '<span class="bot-glyph" title="Bot">🤖</span>' : '') +
          skipBtn +
        '</div>' +
        '<div class="chip-row2">' +
          (st === 'active' ? '<span class="chip-cards">🂠<span class="chip-cards-cnt">' + n + '</span></span>' : '<span class="pill bad" style="font-size:9px;padding:0 3px">Out</span>') +
          '<span class="chip-pts">· ' + tot + 'p</span>' +
          (isTurn ? '<span class="chip-timer" id="timer"></span>' : '') +
        '</div>' +
      '</div>' +
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
    if (totalOverlaps <= 0) {
      handEl.style.setProperty('--card-overlap', '0px');
      return;
    }
    var availW = handEl.clientWidth - 16;
    var totalNoOverlap = N * cw + (G - 1) * 6;
    if (totalNoOverlap <= availW) {
      var comfortable = -Math.min(18, Math.max(8, Math.round(cw * 0.35)));
      handEl.style.setProperty('--card-overlap', comfortable + 'px');
      return;
    }
    var neededNegative = totalNoOverlap - availW;
    var overlap = - (neededNegative / totalOverlaps);
    /* Enforce tap strip >= 28px: strip = cw + overlap >= 28 => overlap >= -(cw - 28) */
    var maxNegativeOverlap = -(cw - 28);
    var chosenOverlap = Math.max(maxNegativeOverlap, overlap);
    handEl.style.setProperty('--card-overlap', chosenOverlap.toFixed(1) + 'px');
  }

  function renderTable() {
    var inGame = S.order.indexOf(me.uid) >= 0, active = inGame && S.status[me.uid] === 'active';
    var mineTurn = S.phase === 'play' && S.turn === me.uid && active;
    var hand = inGame ? (S.hands[me.uid] || []) : [];
    if (inGame) reconcile(hand);
    var stats = handStats(hand), dInfo = mineTurn && S.stage === 'discard' ? declareInfo(hand) : null;
    var sugg = dInfo ? dInfo.filter(function (e) { return e.valid; }) : [];
    var selList = selIds(), pickSel = selList.length === 1 ? selList[0] : null;
    var declCard = null;
    if (sugg.length) { declCard = pickSel != null && sugg.some(function (e) { return e.id === pickSel; }) ? pickSel : sugg[0].id; }

    /* Opponents seating around CSS grid table:
       Up to 3 along top rim (rimLeft, rimRight).
       4th and 5th in flankLeft and flankRight only.
    */
    var mIdx = S.order.indexOf(me.uid);
    var seatSeq = mIdx < 0 ? S.order.slice() : S.order.slice(mIdx + 1).concat(S.order.slice(0, mIdx));
    var rimLeftOpps = [], rimRightOpps = [], flankLeftOpp = null, flankRightOpp = null;
    if (seatSeq.length === 1) {
      rimLeftOpps = [seatSeq[0]];
    } else if (seatSeq.length === 2) {
      rimLeftOpps = [seatSeq[0]];
      rimRightOpps = [seatSeq[1]];
    } else if (seatSeq.length === 3) {
      rimLeftOpps = [seatSeq[0]];
      rimRightOpps = [seatSeq[1], seatSeq[2]];
    } else if (seatSeq.length === 4) {
      flankLeftOpp = seatSeq[0];
      rimLeftOpps = [seatSeq[1]];
      rimRightOpps = [seatSeq[2], seatSeq[3]];
    } else if (seatSeq.length >= 5) {
      flankLeftOpp = seatSeq[0];
      rimLeftOpps = [seatSeq[1]];
      rimRightOpps = [seatSeq[2], seatSeq[3]];
      flankRightOpp = seatSeq[4];
    }

    var rimLeftHTML = rimLeftOpps.map(seatChipHTML).join('');
    var rimRightHTML = rimRightOpps.map(seatChipHTML).join('');
    var flankLeftHTML = flankLeftOpp ? seatChipHTML(flankLeftOpp) : '';
    var flankRightHTML = flankRightOpp ? seatChipHTML(flankRightOpp) : '';

    var totals = (S.result ? S.result.totals : S.baseTotals) || {};
    var myTot = totals[me.uid] || 0;
    var myRawName = (me.name || 'You').replace(/\s*\(bot\)/i, '').trim();
    var myShortName = myRawName.length > 7 ? myRawName.slice(0, 7) + '…' : myRawName;

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
        return '<div class="group' + (moveMode && !anySel ? ' target' : '') + '" data-g="' + gi + '">' +
          '<span class="group-meld-tag t' + t[0] + '">' + t[1] + '</span>' +
          '<div class="cards">' +
            g.map(function (id) { return cardHTML(id, sel[id] ? 'sel' : ''); }).join('') +
          '</div>' +
        '</div>';
      }).join('');
    } else {
      handHTML = '<div class="hand-empty">' + (inGame ? 'You dropped this deal.' : 'You are watching this deal.') + '</div>';
    }

    /* compact action rail */
    var meChip = inGame ? '<div class="me' + (mineTurn ? ' turn' : '') + '" data-seat="' + esc(me.uid) + '">' +
      avatar(me.uid) +
      '<div class="me-info"><div class="me-nm">' + esc(myShortName) + '</div><div class="me-pts">' + myTot + ' pts</div></div>' +
      '</div>' : '';

    var actionGrid = '';
    if (inGame && active && S.phase === 'play') {
      actionGrid = '<div class="action-grid">' +
        '<button class="btn gold btn-declare' + (declCard != null ? ' suggest' : '') + '" data-a="declare" ' + (mineTurn && S.stage === 'discard' ? '' : 'disabled') + '>' +
          (declCard != null ? 'Declare (' + cardName(declCard) + ')' : 'Declare') +
        '</button>' +
        '<button class="btn" data-a="discard" ' + (mineTurn && S.stage === 'discard' && pickSel != null ? '' : 'disabled') + '>Discard</button>' +
        '<button class="btn danger" data-a="drop" ' + (mineTurn && S.stage === 'draw' ? '' : 'disabled') + '>' + (confirmDrop ? 'Confirm' : 'Drop') + '</button>' +
        '<button class="btn" data-a="group" ' + (selList.length ? '' : 'disabled') + '>Group</button>' +
        '<button class="btn" data-a="sort">Sort</button>' +
      '</div>';
    } else if (inGame && !active) {
      actionGrid = '<div class="action-grid"><button class="btn" data-a="sort">Sort</button><button class="btn" disabled>Dropped</button></div>';
    } else {
      actionGrid = '<div class="action-grid"><button class="btn" data-a="sort">Sort</button></div>';
    }

    var rail = '<aside class="rail">' + meChip + actionGrid + '</aside>';

    var canFinish = mineTurn && S.stage === 'discard';
    var finishHTML = '<div class="pile finish-pile' + (canFinish ? ' actionable' : '') + '" data-a="finish" title="Finish Slot: Drop 14th card here to declare">' +
      '<div class="finish-slot-card' + (S.finish != null ? ' has-card' : '') + '">' +
      (S.finish != null ? cardHTML(S.finish) : '<div class="finish-inner"><span class="finish-ico">🏁</span><span class="finish-label">FINISH</span></div>') +
      '</div><span class="lbl">Declare Slot</span></div>';

    var leaveModalHTML = leaveModalOpen ?
      '<div class="modal" data-a="cancelleave"><div class="sheet" style="max-width:380px;text-align:center;">' +
      '<h3 style="color:var(--bad);margin-top:0;">⚠️ Leave Table?</h3>' +
      '<p style="font-size:13.5px;color:var(--ink);">You are currently in an active deal.</p>' +
      '<p style="font-size:12px;color:var(--muted);">Leaving mid-deal forfeits your hand and adds drop points (+' + (S.draws[me.uid] === 0 ? 20 : 40) + ' pts). Are you sure you want to leave?</p>' +
      '<div class="row" style="justify-content:center;gap:12px;margin-top:16px;">' +
      '<button class="btn" data-a="cancelleave" style="min-width:90px;">Stay</button>' +
      '<button class="btn danger" data-a="confirmleave" style="min-width:120px;">Leave Table</button>' +
      '</div></div></div>' : '';

    var wrongModalHTML = confirmWrongDeclareCard != null ?
      '<div class="modal" data-a="cancelwrong"><div class="sheet" style="max-width:390px;text-align:center;">' +
      '<h3 style="color:var(--bad);margin-top:0;">⚠️ Invalid Hand — Wrong Declaration?</h3>' +
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
      '<button class="btn" data-a="scores">📊 Scores</button>' +
      '<button class="btn" data-a="rules">📖 How to Play</button>' +
      '<button class="btn" data-a="felt">◐ Felt Color (' + felt + ')</button>' +
      '<button class="btn" data-a="mute">' + (muted ? '🔇 Unmute Sound' : '🔊 Mute Sound') + '</button>' +
      '<button class="btn danger" data-a="leave">🚪 Leave Table</button>' +
      '</div></div></div>' : '';

    var topBarHTML =
      '<div class="bar">' +
        '<div class="bar-left">' +
          '<button class="pill gold pill-btn" data-a="copy" title="Tap to copy invite link">Room ' + esc(code) + '</button>' +
          '<span class="pill">Deal ' + (S.round + 1) + '</span>' +
          '<span class="pill gold">' + L.MODES[S.mode].label + '</span>' +
        '</div>' +
        '<div class="bar-right">' +
          '<button class="btn icon-btn" data-a="react" aria-label="Reactions" title="Reactions">😀</button>' +
          '<button class="btn icon-btn" data-a="menu" aria-label="Menu" title="Menu">☰</button>' +
        '</div>' +
      '</div>';

    var feltHTML =
      '<main class="felt" data-felt="' + felt + '">' +
        '<div class="top-rim">' +
          '<div class="rim-seat-left">' + rimLeftHTML + '</div>' +
          '<div class="dealer-cell" data-a="dealer" title="Tap the dealer" role="img" aria-label="Dealer">' +
            '<picture><source srcset="dealer.webp" type="image/webp"><img src="dealer.png" alt="Dealer" class="dealer-img" draggable="false" onerror="this.src=\'dealer.jpg\'" /></picture>' +
            '<div class="dealer-nametag">DEALER</div>' +
            (dealerBubble && (Date.now() - dealerBubble.t < 2500) ? '<div class="dealer-bubble" id="bubble">' + esc(dealerBubble.text) + '</div>' : '') +
          '</div>' +
          '<div class="rim-seat-right">' + rimRightHTML + '</div>' +
        '</div>' +
        '<div class="flank-left">' + flankLeftHTML + '</div>' +
        '<div class="center-core">' +
          '<div class="status-lane"><span class="status-msg ' + (mineTurn ? 'mine' : '') + '">' + esc(msg[0]) + (msg[1] ? ' · ' + esc(msg[1]) : '') + '</span>' + (mineTurn ? '<span id="timer" class="status-timer"></span>' : '') + '</div>' +
          '<div class="piles-lane">' +
            '<div class="pile' + (canStock ? ' actionable' : '') + '" data-a="stock"><div class="stack"><div class="back"></div><div class="back"></div><div class="back"></div></div><span class="lbl">Stock ' + S.stock.length + '</span></div>' +
            '<div class="pile' + (canPick ? ' actionable' : '') + '" data-a="pickup">' + (top !== undefined ? cardHTML(top) : '<div class="card" style="opacity:.2"></div>') + '<span class="lbl">Open' + (canStock && topWild ? ' (joker)' : '') + '</span></div>' +
            '<div class="wildbox"><div class="cardwrap">' + cardHTML(S.cut) + '</div><span class="lbl">Wild ' + (S.wild === 1 && L.INFO[S.cut].joker ? 'A' : L.RANK_LBL[S.wild]) + '</span></div>' +
            finishHTML +
          '</div>' +
        '</div>' +
        '<div class="flank-right">' + flankRightHTML + '</div>' +
        '<div class="hand-lane">' +
          '<div class="meld-pills">' +
            '<span class="mpill ' + (stats.pure ? 'ok' : 'no') + '">Pure ' + Math.min(stats.pure, 1) + '/1</span>' +
            '<span class="mpill ' + (stats.seqs >= 2 ? 'ok' : 'no') + '">Seq ' + Math.min(stats.seqs, 2) + '/2</span>' +
            '<span class="mpill">Dead ' + stats.dead + '</span>' +
          '</div>' +
          '<div class="hand-cards" id="hand">' + handHTML + '</div>' +
        '</div>' +
      '</main>';

    var html =
      '<div class="shell">' +
        topBarHTML +
        '<div class="table-area">' +
          feltHTML +
          rail +
        '</div>' +
      '</div>' +
      menuModalHTML +
      (reactOpen ? '<div class="modal" data-a="closereact"><div class="sheet" style="width:auto"><div class="emoji-row">' + ['👏', '🔥', '😅', '👑', '♠️', '🎉'].map(function (e) { return '<button data-a="emoji" data-e="' + e + '">' + e + '</button>'; }).join('') + '</div></div></div>' : '') +
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
    var order = S.order.slice().sort(function (a, b) { return R.points[a] - R.points[b]; });
    var rows = order.map(function (u, ri) {
      var g = R.groups[u], gs = '';
      if (g) {
        gs = g.groups.map(function (ids) { return '<div class="g">' + ids.map(function (id) { return cardHTML(id, 'small'); }).join('') + '</div>'; }).join('');
        if (g.leftover.length) gs += '<div class="g">' + g.leftover.map(function (id) { return cardHTML(id, 'small'); }).join('') + '</div>';
      } else gs = '<span class="pill bad">Dropped</span>';
      return '<div class="res-row' + (u === R.winner ? ' win' : '') + '" style="animation-delay:' + (0.15 + ri * 0.2).toFixed(2) + 's"><div class="nm">' + avatar(u) + '<span>' + esc(pname(u)) + '</span></div><div class="gs">' + gs + '</div><div class="num">+' + R.points[u] + '</div><div class="num">' + R.totals[u] + '</div></div>';
    }).join('');
    var title = R.gameOver ? esc(pname(R.champion)) + ' wins the game' : (R.winner === me.uid ? 'You won the deal' : esc(pname(R.winner)) + ' won the deal');
    var wrongNotice = R.wrongDeclarer ? '<p style="color:var(--bad);font-weight:600">⚠️ ' + esc(pname(R.wrongDeclarer)) + ' made an invalid declaration (+80 penalty points).</p>' : '';
    var out = R.elim.length ? '<p>Out: ' + R.elim.map(function (u) { return esc(pname(u)); }).join(', ') + '</p>' : '';
    var btns = host
      ? (R.gameOver ? '<button class="btn gold" data-a="lobby">New game</button>' : '<button class="btn gold" data-a="next">Next deal</button><button class="btn" data-a="lobby">Back to lobby</button>')
      : '<span class="note">Waiting for the host.</span>';
    return '<div class="modal"><div class="sheet"><h2>' + title + '</h2>' + wrongNotice + out +
      '<div class="res-head"><span>Player</span><span>Final hand</span><span>Deal</span><span>Total</span></div>' + rows +
      '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" data-a="closeres">View table</button>' + btns + '</div></div></div>';
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
      document.title = flag ? '🔴 YOUR TURN! - Rummy Room' : '🃏 Draw / Discard - Rummy Room';
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
    if (reduced) return;
    var dealerEl = document.querySelector('.dealer-cell, .felt > .dealer'), sr = rectOf('.pile[data-a=stock] .stack');
    if (!dealerEl || !sr) return;
    var dr = dealerEl.getBoundingClientRect(), origin = { left: dr.left + dr.width * .66, top: dr.top + dr.height * .74, width: 0, height: 0 };
    var si = S.order.indexOf(S.turn), seq = si < 0 ? S.order.slice() : S.order.slice(si).concat(S.order.slice(0, si)), n = seq.length;
    var step = Math.max(34, Math.min(70, 2600 / (13 * n))), t = 0, mine = (S.hands[me.uid] || []).slice(), mi = 0, total = Math.round(13 * n * step + 1500);
    dealUntil = Date.now() + total; animLockUntil = Math.max(animLockUntil, dealUntil);
    var dealerNode = dealerEl; dealerNode.classList.add('dealing');
    var hidden = [];
    mine.forEach(function (id) { var el = document.querySelector('#hand [data-card="' + id + '"]'); if (el) { el.style.visibility = 'hidden'; hidden.push(el); } });
    var openId = S.discard[S.discard.length - 1], openEl = document.querySelector('.pile[data-a=pickup] .card'), cutEl = document.querySelector('.wildbox .card');
    if (openEl) { openEl.style.visibility = 'hidden'; hidden.push(openEl); }
    if (cutEl) { cutEl.style.visibility = 'hidden'; hidden.push(cutEl); }
    var shown = {}; seq.forEach(function (u) { shown[u] = 0; if (u !== me.uid) setSeatCount(u, 0); });
    var back = '<div class="back"></div>';
    for (var r = 0; r < 13; r++) {
      seq.forEach(function (u) {
        var isMe = u === me.uid, cid = isMe ? mine[mi++] : null, delay = t; t += step;
        setTimeout(function () {
          var to = isMe ? rectOf('#hand [data-card="' + cid + '"]') : seatTarget(u);
          if (!to) return;
          if (isMe) fly(origin, to, back, { flip: cardHTML(cid), s0: .7, dur: 380, done: function () { var el = document.querySelector('#hand [data-card="' + cid + '"]'); if (el) { el.style.visibility = ''; el.classList.add('fresh'); } sfx('deal'); } });
          else fly(origin, to, back, { s0: .7, s1: .42, dur: 380, done: function () { shown[u]++; setSeatCount(u, shown[u]); sfx('deal'); } });
        }, delay);
      });
    }
    setTimeout(function () { if (openEl) fly(origin, openEl, back, { flip: cardHTML(openId), dur: 460, hide: openEl }); }, t + 120);
    setTimeout(function () { if (cutEl) fly(origin, cutEl, back, { flip: cardHTML(S.cut), dur: 500, hide: cutEl }); }, t + 300);
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
    suppressClick = true; setTimeout(function () { suppressClick = false; }, 80);
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
    if (ev.button > 0 || !S || S.phase !== 'play') return;
    var c = ev.target.closest('#hand [data-card]');
    if (c) drag = { id: +c.dataset.card, x: ev.clientX, y: ev.clientY, on: false, el: c };
  });
  document.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    if (!drag.on) { if (Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8) return; startDrag(ev); }
    ghostPos(ev);
    var el = dropTarget(ev.clientX, ev.clientY), grp = el && el.closest('.group');
    var finishEl = el && el.closest('.finish-pile, [data-a=finish]');
    var prev = document.querySelector('.group.over'); if (prev && prev !== grp) prev.classList.remove('over');
    var prevFinish = document.querySelector('.finish-pile.over'); if (prevFinish && prevFinish !== finishEl) prevFinish.classList.remove('over');
    if (grp) grp.classList.add('over');
    if (finishEl) finishEl.classList.add('over');
  });
  document.addEventListener('pointerup', function (ev) { endDrag(ev, false); });
  document.addEventListener('pointercancel', function (ev) { endDrag(ev, true); });

  /* ================= events ================= */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-a],[data-card]');
    if (!t) return;
    if (t.dataset.card != null && !t.dataset.a) {
      if (!S || S.phase !== 'play' || t.closest('.pile') || t.closest('.wildbox') || t.closest('.sheet')) return;
      if (suppressClick) return;
      var id = +t.dataset.card;
      if (!t.closest('.hand')) return;
      try { if (navigator.vibrate) navigator.vibrate(6); } catch (e) { /* no haptics */ }
      if (sel[id]) delete sel[id]; else sel[id] = 1;
      renderRoom(); return;
    }
    var a = t.dataset.a;
    if (t.classList.contains('modal') && ev.target !== t) return;
    switch (a) {
      case 'create': createRoom(); break;
      case 'join': joinRoom(document.getElementById('jc').value); break;
      case 'resume': document.getElementById('jc').value = t.dataset.code; joinRoom(t.dataset.code); break;
      case 'menu': menuOpen = true; renderRoom(); break;
      case 'closemenu': menuOpen = false; renderRoom(); break;
      case 'rules': menuOpen = false; rulesOpen = true; rerender(); break;
      case 'closerules': rulesOpen = false; rerender(); break;
      case 'scores': menuOpen = false; scoresOpen = true; renderRoom(); break;
      case 'closescores': scoresOpen = false; renderRoom(); break;
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
      case 'remove': removePlayer(t.dataset.u); break;
      case 'mode': setRoom({ mode: t.dataset.m }); break;
      case 'start': startDeal(true); break;
      case 'next': startDeal(false); break;
      case 'lobby': backToLobby(); break;
      case 'closeres': dismissed = S.round + ':' + S.result.winner; renderRoom(); break;
      case 'stock': if (S && S.turn === me.uid) act({ type: 'drawStock' }); break;
      case 'pickup': if (S && S.turn === me.uid) act({ type: 'drawDiscard' }); break;
      case 'discard': var s1 = selIds(); if (s1.length === 1) act({ type: 'discard', card: s1[0] }); break;
      case 'finish':
        if (!S || S.turn !== me.uid || S.stage !== 'discard') return;
        var fSel = selIds();
        var fCard = fSel.length === 1 ? fSel[0] : chooseDeclareDiscard(S.hands[me.uid]);
        handleFinishWithCard(fCard);
        break;
      case 'declare':
        if (!S || S.turn !== me.uid || S.stage !== 'discard') return;
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
      case 'auto': autoArrange(); break;
      case 'drop':
        if (!confirmDrop) { confirmDrop = true; renderRoom(); setTimeout(function () { if (confirmDrop) { confirmDrop = false; renderRoom(); } }, 3000); }
        else act({ type: 'drop' });
        break;
      case 'kick': if (S) actAs(t.dataset.u, { type: 'kick' }); break;
      case 'react': reactOpen = true; renderRoom(); break;
      case 'closereact': reactOpen = false; renderRoom(); break;
      case 'emoji': react(t.dataset.e); break;
      case 'felt': felt = { emerald: 'crimson', crimson: 'midnight', midnight: 'emerald' }[felt]; lsSet('rr-felt', felt); renderRoom(); break;
      case 'dealer': dealerSay(QUIPS[Math.floor(Math.random() * QUIPS.length)]); dealerPlay('clap', 900); break;
      case 'mute': muted = !muted; lsSet('rr-muted', muted ? '1' : '0'); renderRoom(); break;
    }
  });
  document.addEventListener('click', function (ev) {
    if (suppressClick) return;
    var g = ev.target.closest('.group.target');
    if (g && !ev.target.closest('[data-card]') && selIds().length) moveSelectedTo(+g.dataset.g);
    else if (g && ev.target.closest('[data-card]') && g.classList.contains('target')) {
      /* clicking a card inside a target group while others are selected toggles that card instead */
    }
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
    renderRoom: renderRoom,
    renderTable: renderTable,
    fitHand: fitHand,
    startDeal: startDeal
  };

  boot();
})();