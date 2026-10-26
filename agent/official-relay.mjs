import { WebSocket, WebSocketServer } from 'ws';
import { allowOfficialCall } from './official-policy.mjs';
const server = new WebSocketServer({noServer: true, maxPayload: 1024 * 1024});
/** Filter every logical stream opening; forwarding opaque TCP would bypass HTTP permissions. */
export function relayOfficialSocket(req, socket, head, {port, cookie, host, authorize, onClose}) {
  return new Promise((resolve, reject) => {
    const upstream = new WebSocket('ws://127.0.0.1:' + port + '/api/remote.mux', {headers: {cookie, host, origin: req.headers.origin}, maxPayload: 1024 * 1024, handshakeTimeout: 15000});
    upstream.once('error', error => { upstream.terminate(); reject(error); });
    upstream.once('open', () => {
      server.handleUpgrade(req, socket, head, browser => {
        let closed = false;
        const close = () => { if (closed) return; closed = true; clearInterval(guard); upstream.terminate(); browser.terminate(); onClose?.(); };
        let checking = false;
        const guard = setInterval(async () => {
          if (checking) return; checking = true;
          try { await authorize(); } catch { close(); } finally { checking = false; }
        }, 15000); guard.unref();
        browser.on('message', (data, binary) => {
          try {
            if (binary) throw Error('BINARY');
            const frame = JSON.parse(data.toString());
            if (!['open', 'item', 'end', 'cancel'].includes(frame.type)) throw Error('FRAME');
            if (frame.type === 'open' && !allowOfficialCall(frame.endpoint, frame.payload, true)) throw Error('DENIED');
            if (upstream.bufferedAmount > 1024 * 1024) throw Error('BACKPRESSURE');
            upstream.send(data, {binary: false});
          } catch { close(); }
        });
        upstream.on('message', (data, binary) => { if (browser.bufferedAmount > 1024 * 1024) close(); else if (browser.readyState === WebSocket.OPEN) browser.send(data, {binary}); });
        browser.once('close', close); browser.once('error', close);
        upstream.once('close', close); upstream.once('error', close);
        resolve({close});
      });
    });
    socket.once('close', () => upstream.terminate());
  });
}
