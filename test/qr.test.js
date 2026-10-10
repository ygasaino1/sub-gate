import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

// Load docs/qr.js exactly as the browser does (classic script, no module system).
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(new URL('../docs/qr.js', import.meta.url), 'utf8'), ctx);
const Q = ctx.SubGateQR;

// Published byte-mode capacities of QR versions 1..40 (ISO/IEC 18004).
const CAP = {
  L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953],
  M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331],
};

// Version 21 is skipped on purpose (see qr.js), so its range is served by version 22.
const served = (v) => (v === 21 ? 22 : v);

test('version selection matches the published capacity table at every boundary', () => {
  for (const level of ['L', 'M']) {
    CAP[level].forEach((cap, i) => {
      const v = i + 1;
      assert.equal(Q.encode('a'.repeat(cap), level).version, served(v), `${level} v${v}: ${cap} bytes`);
      if (v < 40) {
        assert.equal(Q.encode('a'.repeat(cap + 1), level).version, served(v + 1), `${level} v${v}: ${cap + 1} bytes`);
      }
    });
  }
});

test('too long for version 40 throws "too-long"', () => {
  assert.equal(Q.encode('a'.repeat(2953), 'L').version, 40);
  assert.throws(() => Q.encode('a'.repeat(2954), 'L'), { code: 'too-long' });
  assert.throws(() => Q.encode('a'.repeat(2332), 'M'), { code: 'too-long' });
  assert.throws(() => Q.encode('x', 'Z'), { code: 'bad-ecc' });
});

test('text is encoded as UTF-8 bytes', () => {
  assert.equal(Q.encode('é'.repeat(7), 'M').version, 1); // 14 bytes
  assert.equal(Q.encode('é'.repeat(8), 'M').version, 2); // 16 bytes
});

test('structure: size, finder patterns, timing patterns, dark module', () => {
  for (const [text, level] of [['hi', 'M'], ['a'.repeat(100), 'L'], ['b'.repeat(500), 'M']]) {
    const { version, size, modules: m } = Q.encode(text, level);
    assert.equal(size, 4 * version + 17);
    assert.equal(m.length, size);
    assert.ok(m.every((row) => row.length === size));

    // 7x7 finder: dark ring, light ring, dark 3x3 core, at three corners
    const finder = (ox, oy) => {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const edge = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          assert.equal(m[oy + dy][ox + dx], edge || core, `finder at ${ox},${oy} (${dx},${dy})`);
        }
      }
    };
    finder(0, 0);
    finder(size - 7, 0);
    finder(0, size - 7);

    for (let i = 8; i < size - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `timing row ${i}`);
      assert.equal(m[i][6], i % 2 === 0, `timing column ${i}`);
    }
    assert.equal(m[size - 8][8], true, 'always-dark module');
  }
});

test('deterministic, and the mask can be forced (test hook)', () => {
  const a = Q.encode('https://example.com/x', 'M');
  const b = Q.encode('https://example.com/x', 'M');
  assert.deepEqual(JSON.stringify(a.modules), JSON.stringify(b.modules));
  const m0 = Q.encode('https://example.com/x', 'M', 0);
  const m1 = Q.encode('https://example.com/x', 'M', 1);
  assert.equal(m0.mask, 0);
  assert.equal(m1.mask, 1);
  assert.notEqual(JSON.stringify(m0.modules), JSON.stringify(m1.modules));
});

test('regression: a fixed link always produces the same code (verified by decoding with OpenCV)', () => {
  const link = 'https://abc.com/sub/0123456789abcdef0123456789abcdef?u=https%3A%2F%2Fprovider.com%2Fsub%3Ftoken%3Dabc';
  const r = Q.encode(link, 'M');
  const rows = r.modules.map((row) => row.map((b) => (b ? '1' : '0')).join('')).join('\n');
  assert.equal(r.version, 6);
  assert.equal(r.mask, 2);
  assert.equal(crypto.createHash('sha256').update(rows).digest('hex'), '0cbb36cec9d38e238b9f554ba342db0f8541835452b0029fbe818ed8a1dda1bd');
});
