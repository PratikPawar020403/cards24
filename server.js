const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORTS = [3000, 3001, 5000, 8080, 8081];
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

/* ================= in-memory realtime document store ================= */
const docs = new Map();
const clients = new Set();

function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function parent(p) { return p.slice(0, p.lastIndexOf('/')); }
function getColDocs(colPath) {
  const result = [];
  docs.forEach((data, p) => {
    if (parent(p) === colPath) {
      result.push({ id: p.split('/').pop(), path: p, data: clone(data) });
    }
  });
  return result;
}

function broadcast(msg, filterFn) {
  const json = JSON.stringify(msg);
  for (const client of clients) {
    if (!filterFn || filterFn(client)) {
      client.send(json);
    }
  }
}

function handleClientMessage(client, text) {
  try {
    const m = JSON.parse(text);
    if (!m || !m.t) return;

    if (m.t === 'sub') {
      const { kind, p } = m;
      if (!p) return;
      client.subs.add(JSON.stringify({ kind, p }));
      if (kind === 'doc') {
        const has = docs.has(p);
        client.send(JSON.stringify({ t: 'snap', p, exists: has, d: has ? clone(docs.get(p)) : null }));
      } else if (kind === 'col') {
        client.send(JSON.stringify({ t: 'colSnap', p, docs: getColDocs(p) }));
      }
    } else if (m.t === 'unsub') {
      const { kind, p } = m;
      client.subs.delete(JSON.stringify({ kind, p }));
    } else if (m.t === 'write') {
      const { p, d } = m;
      if (!p) return;
      if (d === null) {
        docs.delete(p);
      } else {
        docs.set(p, clone(d));
      }

      const pParent = parent(p);
      const snapMsg = JSON.stringify({ t: 'snap', p, exists: d !== null, d: clone(d) });
      const colMsg = JSON.stringify({ t: 'colSnap', p: pParent, docs: getColDocs(pParent) });

      for (const c of clients) {
        for (const subStr of c.subs) {
          const sub = JSON.parse(subStr);
          if (sub.kind === 'doc' && sub.p === p) {
            c.send(snapMsg);
          } else if (sub.kind === 'col' && sub.p === pParent) {
            c.send(colMsg);
          }
        }
      }
    } else if (m.t === 'ping') {
      client.send(JSON.stringify({ t: 'pong' }));
    }
  } catch (err) {
    console.error('Error handling client message:', err);
  }
}

/* ================= HTTP server ================= */
const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/Rummy.html';
  }

  const filePath = path.join(__dirname, reqPath);

  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

/* ================= WebSocket RFC 6455 implementation ================= */
function encodeFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const b0 = buffer[offset];
    const b1 = buffer[offset + 1];
    const opcode = b0 & 0x0f;
    const isMasked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let headerLen = 2;
    if (payloadLen === 126) {
      if (offset + 4 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (offset + 10 > buffer.length) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskLen = isMasked ? 4 : 0;
    if (offset + headerLen + maskLen + payloadLen > buffer.length) break;

    let payload;
    if (isMasked) {
      const mask = buffer.slice(offset + headerLen, offset + headerLen + 4);
      const raw = buffer.slice(offset + headerLen + 4, offset + headerLen + 4 + payloadLen);
      payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = raw[i] ^ mask[i % 4];
      }
    } else {
      payload = buffer.slice(offset + headerLen, offset + headerLen + payloadLen);
    }
    frames.push({ opcode, payload });
    offset += headerLen + maskLen + payloadLen;
  }
  return { frames, remainder: buffer.slice(offset) };
}

server.on('upgrade', (req, socket, head) => {
  const reqUrl = req.url || '';
  if (!reqUrl.startsWith('/ws')) {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const digest = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${digest}`
    ].concat('\r\n').join('\r\n')
  );

  const client = {
    socket,
    subs: new Set(),
    send: (text) => {
      try {
        if (!socket.destroyed) {
          socket.write(encodeFrame(text));
        }
      } catch (err) {
        /* socket closed */
      }
    }
  };

  clients.add(client);

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const { frames, remainder } = decodeFrames(buf);
    buf = remainder;

    for (const frame of frames) {
      if (frame.opcode === 8) {
        // Close frame
        socket.end();
      } else if (frame.opcode === 9) {
        // Ping frame -> reply with Pong
        try {
          const pong = Buffer.alloc(2);
          pong[0] = 0x8a;
          pong[1] = 0;
          socket.write(pong);
        } catch (e) {}
      } else if (frame.opcode === 1) {
        // Text frame
        handleClientMessage(client, frame.payload.toString('utf8'));
      }
    }
  });

  socket.on('close', () => {
    clients.delete(client);
  });

  socket.on('error', () => {
    clients.delete(client);
  });
});

/* ================= listen on PORT ================= */
const targetPort = process.env.PORT ? parseInt(process.env.PORT, 10) : null;
let portIdx = 0;

function tryListen() {
  const port = targetPort || PORTS[portIdx];
  server.listen(port, '0.0.0.0', () => {
    console.log(`Rummy Room Server listening on port ${port}`);
    console.log(`URL: http://localhost:${port}/`);
    console.log(`WebSocket: ws://localhost:${port}/ws`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && !targetPort) {
    portIdx++;
    if (portIdx < PORTS.length) {
      console.log(`Port in use, trying ${PORTS[portIdx]}...`);
      tryListen();
    } else {
      console.error('All ports in use');
      process.exit(1);
    }
  } else {
    console.error(err);
    process.exit(1);
  }
});

tryListen();
