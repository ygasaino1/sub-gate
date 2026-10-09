import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../src/index.js';

// Load docs/builder.js exactly as the browser does (classic script, no module system).
const ctx = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(new URL('../docs/builder.js', import.meta.url), 'utf8'), ctx);
const B = ctx.SubGateBuilder;
// Values created inside the vm context have foreign prototypes; compare them as plain JSON.
const j = (x) => JSON.parse(JSON.stringify(x));

const TOKEN = '0123456789abcdef0123456789abcdef';
const SUB = 'https://provider.com/sub?token=abc&x=1';
const base = { base: 'abc.com', token: TOKEN, subs: SUB, fp: 'default', format: 'base64', fragment: true, cipher: true, ech: '' };

test('normalizeBase', () => {
  assert.deepEqual({ ...B.normalizeBase('abc.com') }, { ok: true, value: 'https://abc.com', insecure: false });
  assert.equal(B.normalizeBase('https://abc.com/').value, 'https://abc.com');
  assert.equal(B.normalizeBase('https://abc.com/sub/xyz?u=1').value, 'https://abc.com');
  assert.equal(B.normalizeBase('  ABC.com  ').value, 'https://abc.com');
  assert.equal(B.normalizeBase('http://abc.com').insecure, true);
  assert.equal(B.normalizeBase('localhost:8787').ok, true);
  for (const bad of ['', '   ', 'abc', 'ftp://abc.com', 'not a url']) assert.equal(B.normalizeBase(bad).ok, false, bad);
});

test('parseSubs: splits on whitespace, dedupes, rejects non-http', () => {
  const r = B.parseSubs(` ${SUB}\n\n${SUB}\r\nhttp://a.example/x vless://nope\nrandom `);
  assert.deepEqual(j(r.valid), [SUB, 'http://a.example/x']);
  assert.deepEqual(j(r.invalid), ['vless://nope', 'random']);
});

test('buildLink: minimal link with encoded subscription', () => {
  const r = B.buildLink(base);
  assert.ok(r.ready);
  assert.equal(r.link, `https://abc.com/sub/${TOKEN}?u=${encodeURIComponent(SUB)}`);
});

test('buildLink: options map to the Worker parameters', () => {
  const r = B.buildLink({ ...base, fp: 'chrome', fragment: false, cipher: false, ech: 'cloudflare-ech.com+udp://1.1.1.1', format: 'plain' });
  const q = new URL(r.link).searchParams;
  assert.equal(q.get('u'), SUB);
  assert.equal(q.get('fp'), 'chrome');
  assert.equal(q.get('fm'), 'off');
  assert.equal(q.get('cs'), 'off');
  assert.equal(q.get('ech'), 'cloudflare-ech.com+udp://1.1.1.1');
  assert.equal(q.get('plain'), '1');
});

test('buildLink: several subscriptions become repeated u=', () => {
  const r = B.buildLink({ ...base, subs: `${SUB}\nhttps://other.com/s` });
  assert.deepEqual(new URL(r.link).searchParams.getAll('u'), [SUB, 'https://other.com/s']);
  assert.equal(r.count, 2);
});

test('buildLink: problems', () => {
  assert.deepEqual(j(B.buildLink({ ...base, base: '' }).problems), ['base']);
  assert.deepEqual(j(B.buildLink({ ...base, token: '' }).problems), ['token-missing']);
  assert.deepEqual(j(B.buildLink({ ...base, token: 'short' }).problems), ['token-short']);
  assert.deepEqual(j(B.buildLink({ ...base, token: 'change-me-to-a-long-random-string' }).problems), ['token-placeholder']);
  assert.deepEqual(j(B.buildLink({ ...base, subs: 'vless://x' }).problems), ['subs']);
  const none = B.buildLink({ base: '', token: '', subs: '' });
  assert.equal(none.ready, false);
  assert.equal(none.link, '');
  assert.equal(none.problems.length, 3);
});

test('buildLink: warnings', () => {
  assert.deepEqual(j(B.buildLink({ ...base, base: 'http://abc.com' }).warnings), [{ code: 'insecure' }]);
  assert.deepEqual(j(B.buildLink({ ...base, subs: `${SUB} junk` }).warnings), [{ code: 'ignored', n: 1 }]);
});

test('previewLink forces plain output once', () => {
  const l = B.buildLink(base).link;
  assert.ok(B.previewLink(l).endsWith('&plain=1'));
  const plain = B.buildLink({ ...base, format: 'plain' }).link;
  assert.equal(B.previewLink(plain), plain);
});

test('randomToken: 48 hex chars, passes the Worker length rule', () => {
  const t = B.randomToken((a) => { for (let i = 0; i < a.length; i++) a[i] = i * 7; return a; });
  assert.match(t, /^[0-9a-f]{48}$/);
  const real = B.randomToken((a) => crypto.getRandomValues(a));
  assert.match(real, /^[0-9a-f]{48}$/);
});

test('a link built by the page is accepted by the Worker', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u) => {
    assert.equal(String(u), SUB); // the encoded subscription round-trips intact
    return new Response('vless://u@h.example:443?security=tls&type=ws#r');
  };
  try {
    const { link } = B.buildLink({ ...base, token: TOKEN, base: 'gate.example.com', format: 'plain' });
    const res = await worker.fetch(new Request(link), { GATE_TOKEN: TOKEN });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /^vless:\/\/u@h\.example:443\?/);
    assert.match(body, /fm=/);
  } finally {
    globalThis.fetch = realFetch;
  }
});
