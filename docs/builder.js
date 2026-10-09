/*
 * sub-gate link builder: pure logic, no DOM access.
 * Loaded as a classic script (works from file:// and GitHub Pages) and exposes
 * window.SubGateBuilder. Tests load it with node:vm.
 */
(function (root) {
  'use strict';

  var MIN_TOKEN = 16;
  var enc = encodeURIComponent;

  // "abc.com", "https://abc.com/", "https://abc.com/sub/xyz" -> "https://abc.com"
  function normalizeBase(input) {
    var v = String(input == null ? '' : input).trim();
    if (!v) return { ok: false, error: 'empty' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = 'https://' + v;
    var u;
    try {
      u = new URL(v);
    } catch (e) {
      return { ok: false, error: 'invalid' };
    }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { ok: false, error: 'invalid' };
    if (u.hostname.indexOf('.') < 0 && u.hostname !== 'localhost') return { ok: false, error: 'invalid' };
    return { ok: true, value: u.origin, insecure: u.protocol === 'http:' };
  }

  // One link per whitespace-separated chunk; only http(s) links are usable.
  function parseSubs(text) {
    var seen = {};
    var valid = [];
    var invalid = [];
    String(text == null ? '' : text)
      .split(/\s+/)
      .filter(Boolean)
      .forEach(function (chunk) {
        if (/^https?:\/\/\S+$/i.test(chunk)) {
          if (!seen[chunk]) {
            seen[chunk] = true;
            valid.push(chunk);
          }
        } else {
          invalid.push(chunk);
        }
      });
    return { valid: valid, invalid: invalid };
  }

  /*
   * state: { base, token, subs (textarea text), fp, format, fragment, cipher, ech }
   *   fp: 'default' | 'chrome' | 'firefox' | 'safari' | 'random' | 'none'
   *   format: 'base64' | 'plain'
   * returns { ready, link, problems: [code], warnings: [{code, n?}], count }
   */
  function buildLink(state) {
    var problems = [];
    var warnings = [];

    var base = normalizeBase(state.base);
    if (!base.ok) problems.push('base');
    else if (base.insecure) warnings.push({ code: 'insecure' });

    var token = String(state.token == null ? '' : state.token).trim();
    if (!token) problems.push('token-missing');
    else if (/^change-me/i.test(token)) problems.push('token-placeholder');
    else if (token.length < MIN_TOKEN) problems.push('token-short');

    var subs = parseSubs(state.subs);
    if (!subs.valid.length) problems.push('subs');
    if (subs.invalid.length) warnings.push({ code: 'ignored', n: subs.invalid.length });

    if (problems.length) {
      return { ready: false, link: '', problems: problems, warnings: warnings, count: subs.valid.length };
    }

    var parts = subs.valid.map(function (u) {
      return 'u=' + enc(u);
    });
    if (state.fp && state.fp !== 'default') parts.push('fp=' + enc(state.fp));
    if (state.fragment === false) parts.push('fm=off');
    if (state.cipher === false) parts.push('cs=off');
    var ech = String(state.ech == null ? '' : state.ech).trim();
    if (ech) parts.push('ech=' + enc(ech));
    if (state.format === 'plain') parts.push('plain=1');

    return {
      ready: true,
      link: base.value + '/sub/' + enc(token) + '?' + parts.join('&'),
      problems: [],
      warnings: warnings,
      count: subs.valid.length,
    };
  }

  // Same link, forced to plain-text output (used by the Preview button).
  function previewLink(link) {
    return /[?&]plain=1(&|$)/.test(link) ? link : link + '&plain=1';
  }

  // 48 hex chars from a getRandomValues-style function.
  function randomToken(getRandomValues) {
    var bytes = new Uint8Array(24);
    getRandomValues(bytes);
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += ('0' + bytes[i].toString(16)).slice(-2);
    return out;
  }

  root.SubGateBuilder = {
    MIN_TOKEN: MIN_TOKEN,
    normalizeBase: normalizeBase,
    parseSubs: parseSubs,
    buildLink: buildLink,
    previewLink: previewLink,
    randomToken: randomToken,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
