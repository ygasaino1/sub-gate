/*
 * Minimal offline QR Code encoder for sub-gate (no dependencies, no network).
 * Byte mode, versions 1-40, error correction levels L and M.
 *
 *   SubGateQR.encode(text, 'M')  ->  { version, size, mask, ecc, modules }
 *   modules[y][x] === true means a dark module. The quiet zone is NOT included.
 *   Throws an Error with code 'too-long' when the text does not fit in version 40.
 *
 * Loaded as a classic script (works from file:// and GitHub Pages) and exposes
 * window.SubGateQR. Tests load it with node:vm.
 */
(function (root) {
  'use strict';

  // Index = version (index 0 unused). Standard QR tables.
  var ECC = {
    L: {
      format: 1,
      perBlock: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      blocks: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25]
    },
    M: {
      format: 0,
      perBlock: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
      blocks: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
    }
  };

  function fail(code) {
    var e = new Error('QR: ' + code);
    e.code = code;
    return e;
  }

  // ---------- helpers ----------
  function utf8(str) {
    var s = encodeURIComponent(str);
    var out = [];
    for (var i = 0; i < s.length; i++) {
      if (s.charAt(i) === '%') {
        out.push(parseInt(s.substr(i + 1, 2), 16));
        i += 2;
      } else {
        out.push(s.charCodeAt(i));
      }
    }
    return out;
  }

  function bit(value, i) {
    return ((value >>> i) & 1) !== 0;
  }

  // Number of modules that can hold data or error correction (everything except function patterns).
  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }

  function dataCodewords(ver, level) {
    return Math.floor(rawModules(ver) / 8) - level.perBlock[ver] * level.blocks[ver];
  }

  // ---------- Reed-Solomon over GF(256), polynomial 0x11D ----------
  function gfMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree; i++) result.push(0);
    result[degree - 1] = 1;
    var rootPow = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], rootPow);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      rootPow = gfMul(rootPow, 2);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) {
        result[i] ^= gfMul(coef, factor);
      });
    });
    return result;
  }

  // Split data into blocks, add error correction to each, interleave.
  function addEccAndInterleave(data, ver, level) {
    var numBlocks = level.blocks[ver];
    var blockEcc = level.perBlock[ver];
    var rawCw = Math.floor(rawModules(ver) / 8);
    var numShort = numBlocks - (rawCw % numBlocks);
    var shortLen = Math.floor(rawCw / numBlocks);
    var divisor = rsDivisor(blockEcc);
    var blocks = [];
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = data.slice(k, k + shortLen - blockEcc + (i < numShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, divisor);
      if (i < numShort) dat.push(0); // placeholder so all blocks have equal length
      blocks.push(dat.concat(ecc));
    }
    var out = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        // skip the placeholder byte of short blocks
        if (i !== shortLen - blockEcc || j >= numShort) out.push(blocks[j][i]);
      }
    }
    return out;
  }

  // ---------- matrix ----------
  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var n = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
    var res = [6];
    for (var pos = ver * 4 + 10; res.length < n; pos -= step) res.splice(1, 0, pos);
    return res;
  }

  function Matrix(ver) {
    var size = ver * 4 + 17;
    var modules = [];
    var isFn = [];
    for (var y = 0; y < size; y++) {
      var row = [];
      var frow = [];
      for (var x = 0; x < size; x++) { row.push(false); frow.push(false); }
      modules.push(row);
      isFn.push(frow);
    }
    this.ver = ver;
    this.size = size;
    this.modules = modules;
    this.isFn = isFn;
  }

  Matrix.prototype.setFn = function (x, y, dark) {
    this.modules[y][x] = dark;
    this.isFn[y][x] = true;
  };

  Matrix.prototype.drawFunctionPatterns = function () {
    var size = this.size, i;
    for (i = 0; i < size; i++) {
      this.setFn(6, i, i % 2 === 0);
      this.setFn(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(size - 4, 3);
    this.finder(3, size - 4);
    var pos = alignmentPositions(this.ver);
    var n = pos.length;
    for (i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.alignment(pos[i], pos[j]);
      }
    }
    this.drawFormat(0, 0); // reserve the area; real value is written after masking
    this.drawVersion();
  };

  Matrix.prototype.finder = function (cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var x = cx + dx, y = cy + dy;
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.setFn(x, y, dist !== 2 && dist !== 4);
      }
    }
  };

  Matrix.prototype.alignment = function (cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        this.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  };

  Matrix.prototype.drawFormat = function (eccFormat, mask) {
    var data = (eccFormat << 3) | mask;
    var rem = data;
    var i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = (((data << 10) | rem) ^ 0x5412) & 0x7fff;
    var size = this.size;
    for (i = 0; i <= 5; i++) this.setFn(8, i, bit(bits, i));
    this.setFn(8, 7, bit(bits, 6));
    this.setFn(8, 8, bit(bits, 7));
    this.setFn(7, 8, bit(bits, 8));
    for (i = 9; i < 15; i++) this.setFn(14 - i, 8, bit(bits, i));
    for (i = 0; i < 8; i++) this.setFn(size - 1 - i, 8, bit(bits, i));
    for (i = 8; i < 15; i++) this.setFn(8, size - 15 + i, bit(bits, i));
    this.setFn(8, size - 8, true); // the always-dark module
  };

  Matrix.prototype.drawVersion = function () {
    if (this.ver < 7) return;
    var rem = this.ver;
    var i;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (this.ver << 12) | rem;
    for (i = 0; i < 18; i++) {
      var dark = bit(bits, i);
      var a = this.size - 11 + (i % 3);
      var b = Math.floor(i / 3);
      this.setFn(a, b, dark);
      this.setFn(b, a, dark);
    }
  };

  Matrix.prototype.drawCodewords = function (data) {
    var size = this.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!this.isFn[y][x] && i < data.length * 8) {
            this.modules[y][x] = bit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  };

  Matrix.prototype.applyMask = function (mask) {
    for (var y = 0; y < this.size; y++) {
      for (var x = 0; x < this.size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        }
        if (!this.isFn[y][x] && invert) this.modules[y][x] = !this.modules[y][x];
      }
    }
  };

  var FINDER_A = [true, false, true, true, true, false, true, false, false, false, false];
  var FINDER_B = [false, false, false, false, true, false, true, true, true, false, true];

  function hasPattern(line, at, pat) {
    for (var k = 0; k < pat.length; k++) if (line[at + k] !== pat[k]) return false;
    return true;
  }

  Matrix.prototype.penalty = function () {
    var m = this.modules, size = this.size, p = 0, x, y, line, run;
    for (var dir = 0; dir < 2; dir++) {
      for (y = 0; y < size; y++) {
        line = [];
        for (x = 0; x < size; x++) line.push(dir ? m[x][y] : m[y][x]);
        run = 1;
        for (x = 1; x <= size; x++) {
          if (x < size && line[x] === line[x - 1]) {
            run++;
          } else {
            if (run >= 5) p += 3 + (run - 5);
            run = 1;
          }
        }
        for (x = 0; x + 11 <= size; x++) {
          if (hasPattern(line, x, FINDER_A) || hasPattern(line, x, FINDER_B)) p += 40;
        }
      }
    }
    var dark = 0;
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        if (m[y][x]) dark++;
        if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
      }
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return p + k * 10;
  };

  // ---------- public ----------
  // forceMask (0-7) is a test hook; leave it undefined to pick the best mask automatically.
  function encode(text, eccName, forceMask) {
    var level = ECC[eccName || 'M'];
    if (!level) throw fail('bad-ecc');
    var bytes = utf8(String(text));

    var ver = 1;
    for (;; ver++) {
      if (ver > 40) throw fail('too-long');
      // Version 21 is skipped on purpose. It is valid, but OpenCV (a widely used decoder)
      // places its last alignment pattern at 92 instead of the standard 94 and reads
      // correct version-21 codes unreliably. Using version 22 instead costs a few modules.
      if (ver === 21) continue;
      var countBits = ver <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(ver, level) * 8) break;
    }
    var countBitsFinal = ver <= 9 ? 8 : 16;
    var capBits = dataCodewords(ver, level) * 8;

    var bits = [];
    function put(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    put(4, 4); // byte mode
    put(bytes.length, countBitsFinal);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8 !== 0) bits.push(0);
    for (var pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);

    var data = [];
    for (var i = 0; i < bits.length; i += 8) {
      var v = 0;
      for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      data.push(v);
    }

    var all = addEccAndInterleave(data, ver, level);
    var mx = new Matrix(ver);
    mx.drawFunctionPatterns();
    mx.drawCodewords(all);

    var best = 0;
    var bestPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      mx.applyMask(mask);
      mx.drawFormat(level.format, mask);
      var pen = mx.penalty();
      if (pen < bestPenalty) { bestPenalty = pen; best = mask; }
      mx.applyMask(mask); // undo (XOR is its own inverse)
    }
    if (forceMask >= 0 && forceMask <= 7) best = forceMask | 0;
    mx.applyMask(best);
    mx.drawFormat(level.format, best);

    return { version: ver, size: mx.size, mask: best, ecc: eccName || 'M', modules: mx.modules };
  }

  root.SubGateQR = { encode: encode };
})(typeof globalThis !== 'undefined' ? globalThis : this);
