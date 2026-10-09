// Subscription Gate — Cloudflare Worker
//
// GET /sub/<GATE_TOKEN>  ->  fetches your real subscription(s), applies the same
// "Fragment + Fingerprint" enhancement as Hidden-Node/proxy-builder (fp / cs / fm,
// optionally ech) to every VLESS/Trojan config, and returns the new subscription.
//
// Environment (set as secrets/variables):
//   GATE_TOKEN  required  secret path segment that protects the gate (min 16 chars)
//   UPSTREAMS   optional  fallback subscription URL(s) used when the link has no ?u=
//                         (newline or comma separated)
//   FM          optional  default Final Mask JSON (paste the v1 or v2 JSON from the tool)
//   CS          optional  default cipher suites string
//   FP          optional  default fingerprint (default: unsafe, same as the tool)
//   ECH         optional  default ECH value, e.g. cloudflare-ech.com+udp://1.1.1.1
//
// Per-request parameters (query string):
//   ?u=<url>         the real subscription link, URL-encoded (repeat for several, or base64)
//
//   ?fp=chrome|firefox|safari|random|unsafe|none
//   ?fm=off          disable fragment mask       (or pass raw JSON)
//   ?cs=off          disable cipher suites       (or pass a custom list)
//   ?ech=<value>     add ech to TLS configs      (?ech=off to disable the env default)
//   ?plain=1         return plain text lines instead of a base64 body

const DEFAULT_FP = 'unsafe';
const MIN_TOKEN_LENGTH = 16;

const DEFAULT_CS =
  'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:' +
  'TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256:TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:' +
  'TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA:TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA:' +
  'TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256:TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256';

// "v2 — new" preset from the tool
const DEFAULT_FM =
  '{"tcp": [{"type": "fragment", "settings": {"packets": "tlshello", "lengths": ["0", "104", "1"], "delays": ["0"], "maxSplit": "0"}},' +
  '{"type": "fragment", "settings": {"packets": "1-1", "lengths": ["114", "1"], "delays": ["1"], "maxSplit": "11"}}]}';

const SCHEME = /^(vless|vmess|trojan|ss|socks5?|tg):\/\//i;

// Headers worth forwarding so apps keep showing traffic/expiry/title info.
const PASS_HEADERS = [
  'subscription-userinfo',
  'profile-update-interval',
  'profile-title',
  'profile-web-page-url',
  'support-url',
  'content-disposition',
];

// ---------- base64 helpers ----------
function b64decode(str) {
  try {
    const clean = str.trim().replace(/\s+/g, '');
    if (!clean || !/^[A-Za-z0-9+/=_-]+$/.test(clean)) return null;
    let s = clean.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad === 1) return null;
    if (pad) s += '='.repeat(4 - pad);
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

const lines = (t) => t.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

// Accepts plain lists, one base64 blob, or per-line base64 — same as the tool.
function extractConfigs(body) {
  const text = (body || '').trim();
  if (!text) return [];
  const ls = lines(text);
  if (ls.some((l) => SCHEME.test(l))) return ls.filter((l) => SCHEME.test(l));

  const whole = b64decode(text);
  if (whole) {
    const d = lines(whole);
    if (d.some((l) => SCHEME.test(l))) return d.filter((l) => SCHEME.test(l));
  }
  return ls
    .map((l) => b64decode(l))
    .filter(Boolean)
    .flatMap(lines)
    .filter((l) => SCHEME.test(l));
}

// ---------- the enhancement (mirrors enhanceURL in the tool) ----------
function enhance(line, o) {
  const scheme = line.slice(0, line.indexOf('://')).toLowerCase();
  if (scheme !== 'vless' && scheme !== 'trojan') return line; // pass everything else through untouched

  // Split manually so the authority part (uuid/password@host:port) and the
  // #remark are preserved byte-for-byte; only the query is rebuilt.
  const hashIdx = line.indexOf('#');
  const hash = hashIdx >= 0 ? line.slice(hashIdx) : '';
  const rest = hashIdx >= 0 ? line.slice(0, hashIdx) : line;
  const qIdx = rest.indexOf('?');
  const head = qIdx >= 0 ? rest.slice(0, qIdx) : rest;
  const p = new URLSearchParams(qIdx >= 0 ? rest.slice(qIdx + 1) : '');

  const security = p.get('security') || 'none';

  if (o.fp && o.fp !== 'none') p.set('fp', o.fp);

  // cs / fm / ech only make sense for TLS (the tool does the same)
  if (security === 'tls') {
    if (o.cs) p.set('cs', o.cs);
    if (o.fm) p.set('fm', o.fm);
    if (o.ech) p.set('ech', o.ech);
  }

  // URLSearchParams writes spaces as '+', v2ray-style clients expect %20
  const q = p.toString().replace(/\+/g, '%20');
  return head + (q ? '?' + q : '') + hash;
}

function resolveOptions(url, env) {
  const q = url.searchParams;
  const pick = (name, envVal, dflt) => {
    const v = q.has(name) ? q.get(name) : envVal !== undefined ? envVal : dflt;
    return v === 'off' || v === '' ? '' : v;
  };
  return {
    fp: q.has('fp') ? q.get('fp') : env.FP || DEFAULT_FP,
    cs: pick('cs', env.CS, DEFAULT_CS),
    fm: pick('fm', env.FM, DEFAULT_FM),
    ech: pick('ech', env.ECH, ''),
    plain: q.get('plain') === '1',
  };
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const text = (body, status = 200, extra = {}) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/sub\/([^/]+)\/?$/);
    if (!m || !env.GATE_TOKEN) return text('Not found', 404);

    // Refuse to run with a guessable token: the token is the only protection.
    if (env.GATE_TOKEN.length < MIN_TOKEN_LENGTH || /^change-me/i.test(env.GATE_TOKEN)) {
      return text('GATE_TOKEN is too short: use at least ' + MIN_TOKEN_LENGTH + ' random characters', 500);
    }

    let given;
    try {
      given = decodeURIComponent(m[1]);
    } catch {
      return text('Not found', 404);
    }
    if (!safeEqual(given, env.GATE_TOKEN)) return text('Not found', 404);

    // Upstreams come from ?u=<url> (repeat it for several; plain URL-encoded or
    // base64), falling back to the optional UPSTREAMS env var when none is given.
    // Safety here rests entirely on GATE_TOKEN: anyone holding the link can make
    // this Worker fetch arbitrary http(s) URLs, so keep the token long and private.
    const fromQuery = url.searchParams.getAll('u').map((v) => {
      v = v.trim();
      if (/^https?:\/\//i.test(v)) return v;
      const d = b64decode(v);
      return d ? d.trim() : v;
    });
    const fromEnv = (env.UPSTREAMS || '').split(/[\s,]+/);
    const upstreams = [...new Set((fromQuery.length ? fromQuery : fromEnv).filter((u) => {
      if (!/^https?:\/\//i.test(u)) return false;
      try {
        return new URL(u).host !== url.host; // never fetch ourselves (loop)
      } catch {
        return false;
      }
    }))];
    if (!upstreams.length) {
      return text('No upstream: add ?u=<URL-encoded subscription link> to this link', 400);
    }

    const opts = resolveOptions(url, env);
    // Forward the client's User-Agent: many panels pick the output format from it.
    const ua = request.headers.get('user-agent') || 'v2rayNG/1.9.0';

    const results = await Promise.allSettled(
      upstreams.map(async (u) => {
        const res = await fetch(u, { headers: { 'user-agent': ua }, redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return { body: await res.text(), headers: res.headers };
      })
    );

    const ok = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    if (!ok.length) return text('Upstream fetch failed', 502);

    const seen = new Set();
    const out = [];
    for (const { body } of ok) {
      for (const cfg of extractConfigs(body)) {
        const e = enhance(cfg, opts);
        if (!seen.has(e)) {
          seen.add(e);
          out.push(e);
        }
      }
    }
    if (!out.length) return text('Upstream returned no recognizable configs', 502);

    const extra = { 'x-gate-upstreams-failed': String(results.length - ok.length) };
    for (const h of PASS_HEADERS) {
      const v = ok[0].headers.get(h);
      if (v) extra[h] = v;
    }

    const joined = out.join('\n');
    return text(opts.plain ? joined : b64encode(joined), 200, extra);
  },
};
