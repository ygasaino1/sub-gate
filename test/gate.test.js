import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const TOKEN = 'a'.repeat(8) + 'b'.repeat(8) + 'c'.repeat(8);

const CFGS = [
  'vless://11111111-2222-3333-4444-555555555555@cdn.example.com:443?type=ws&security=tls&sni=cdn.example.com&host=cdn.example.com&path=%2Fws%3Fed%3D2048&fp=chrome&alpn=h2%2Chttp%2F1.1#My%20Server%20%F0%9F%87%A9%F0%9F%87%AA',
  'trojan://p%40ss@1.2.3.4:443?security=tls&sni=a.example.com#trojan-tls',
  'vless://uuid@5.6.7.8:80?type=ws&security=none&path=%2F#plain-ws',
  'vmess://eyJhZGQiOiJ4In0=#untouched',
  'ss://YWVzOnBhc3M=@9.9.9.9:8388#ss-untouched',
];

const PLAIN = CFGS.join('\n');
const B64 = Buffer.from(PLAIN).toString('base64');

let upstreamMode = 'plain';
const realFetch = globalThis.fetch;
test.before(() => {
  globalThis.fetch = async (u) => {
    if (String(u).includes('bad')) return new Response('nope', { status: 500 });
    return new Response(upstreamMode === 'plain' ? PLAIN : B64, {
      status: 200,
      headers: { 'subscription-userinfo': 'upload=1; download=2; total=3; expire=4' },
    });
  };
});
test.after(() => {
  globalThis.fetch = realFetch;
});

const ENV = { GATE_TOKEN: TOKEN };
const SUB = encodeURIComponent('https://up.example/sub?token=abc&x=1');
const call = (path, env = ENV) =>
  worker.fetch(new Request('https://gate.example.com' + path, { headers: { 'user-agent': 'v2rayNG' } }), env);
const query = (line) => new URLSearchParams(line.split('#')[0].split('?')[1]);

async function enhancedLines(path = `/sub/${TOKEN}?plain=1&u=${SUB}`) {
  const r = await call(path);
  assert.equal(r.status, 200);
  return (await r.text()).split('\n');
}

test('wrong token, wrong path, malformed token -> 404', async () => {
  assert.equal((await call(`/sub/nope?u=${SUB}`)).status, 404);
  assert.equal((await call('/')).status, 404);
  assert.equal((await call(`/sub/%E0%A4%A?u=${SUB}`)).status, 404);
});

test('short or placeholder GATE_TOKEN is refused', async () => {
  assert.equal((await call(`/sub/short?u=${SUB}`, { GATE_TOKEN: 'short' })).status, 500);
  const ph = 'change-me-to-a-long-random-string';
  assert.equal((await call(`/sub/${ph}?u=${SUB}`, { GATE_TOKEN: ph })).status, 500);
});

test('TLS VLESS gets fp + cs + fm, other params and remark preserved', async () => {
  const [vless] = await enhancedLines();
  const q = query(vless);
  assert.equal(q.get('fp'), 'unsafe');
  assert.ok(q.get('cs').startsWith('TLS_AES_256_GCM_SHA384:'));
  assert.equal(JSON.parse(q.get('fm')).tcp.length, 2);
  assert.equal(q.get('path'), '/ws?ed=2048');
  assert.equal(q.get('alpn'), 'h2,http/1.1');
  assert.ok(vless.endsWith('#My%20Server%20%F0%9F%87%A9%F0%9F%87%AA'));
});

test('Trojan keeps authority verbatim and gets fm', async () => {
  const trojan = (await enhancedLines())[1];
  assert.ok(trojan.startsWith('trojan://p%40ss@1.2.3.4:443?'));
  assert.ok(query(trojan).get('fm'));
});

test('non-TLS VLESS gets fp only', async () => {
  const ws = (await enhancedLines())[2];
  const q = query(ws);
  assert.equal(q.get('fp'), 'unsafe');
  assert.equal(q.get('fm'), null);
  assert.equal(q.get('cs'), null);
});

test('VMess and Shadowsocks pass through untouched', async () => {
  const out = await enhancedLines();
  assert.equal(out[3], CFGS[3]);
  assert.equal(out[4], CFGS[4]);
});

test('no "+" left in any query string (clients expect %20)', async () => {
  const out = await enhancedLines();
  assert.ok(!out.some((l) => /\?[^#]*\+/.test(l)));
});

test('base64 upstream in, base64 out (default) matches plain output', async () => {
  const plain = (await enhancedLines()).join('\n');
  upstreamMode = 'b64';
  const r = await call(`/sub/${TOKEN}?u=${SUB}`);
  upstreamMode = 'plain';
  assert.equal(Buffer.from(await r.text(), 'base64').toString('utf8'), plain);
});

test('overrides: fp, fm=off, cs=off, ech', async () => {
  const echVal = encodeURIComponent('cloudflare-ech.com+udp://1.1.1.1');
  const first = (await enhancedLines(`/sub/${TOKEN}?plain=1&u=${SUB}&fp=chrome&fm=off&cs=off&ech=${echVal}`))[0];
  const q = query(first);
  assert.equal(q.get('fp'), 'chrome');
  assert.equal(q.get('fm'), null);
  assert.equal(q.get('cs'), null);
  assert.equal(q.get('ech'), 'cloudflare-ech.com+udp://1.1.1.1');
});

test('?u= accepts base64 and several upstreams (partial failure still serves)', async () => {
  const b64u = encodeURIComponent(Buffer.from('https://up.example/sub?token=abc').toString('base64'));
  assert.equal((await call(`/sub/${TOKEN}?plain=1&u=${b64u}`)).status, 200);

  const r = await call(`/sub/${TOKEN}?plain=1&u=${SUB}&u=${encodeURIComponent('https://bad.example/x')}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('x-gate-upstreams-failed'), '1');
  assert.equal(r.headers.get('subscription-userinfo'), 'upload=1; download=2; total=3; expire=4');
});

test('UPSTREAMS env is used as fallback when there is no ?u=', async () => {
  const r = await call(`/sub/${TOKEN}?plain=1`, { ...ENV, UPSTREAMS: 'https://up.example/sub' });
  assert.equal(r.status, 200);
});

test('missing / non-http / self-referencing upstream -> 400', async () => {
  assert.equal((await call(`/sub/${TOKEN}`)).status, 400);
  assert.equal((await call(`/sub/${TOKEN}?u=${encodeURIComponent('file:///etc/passwd')}`)).status, 400);
  const self = encodeURIComponent(`https://gate.example.com/sub/${TOKEN}`);
  assert.equal((await call(`/sub/${TOKEN}?u=${self}`)).status, 400);
});

test('all upstreams failing -> 502', async () => {
  const r = await call(`/sub/${TOKEN}?u=${encodeURIComponent('https://bad.example/x')}`);
  assert.equal(r.status, 502);
});
