/* ──────────────────────────────────────────────────────────────
   Glyph engine: renders animated character grids on <canvas>.
   Any <canvas data-scene="..."> on the page is mounted automatically.

     data-scene        pipeline | ticker | bitmap
     data-rows         grid rows (pipeline / ticker)
     data-cell         cell height in px (pipeline / ticker)
     data-cell-mobile  cell height under 640px wide
     data-text         text for bitmap / ticker scenes
     data-pad          empty cells around bitmap text
     data-max-cell     max cell height for bitmap scenes
     data-cols         minimum columns for bitmap scenes (keeps sibling canvases at one scale)
     data-interactive  cells react to the pointer
   A parent with [data-glyph-hover] turns on hover mode for its canvases.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var C = {
    dot: '#22362b',
    dim: '#2c4a3a',
    g0: '#0b2a1c',
    g1: '#104a2d',
    g1b: '#0d3d25',
    g2: '#1d8c55',
    g3: '#3ecf8e',
    g4: '#8fe3b9',
    g5: '#c9f5dd',
    white: '#f0fff7',
    ink: '#06120b'
  };
  var SHADES = [C.g2, C.g3, C.g4, C.g5, C.white];
  var NOISE = '0A1I+';
  var ASPECT = 0.62; // cell width / height
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hash(a, b, c) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul((c || 0) | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mod(n, m) { return ((n % m) + m) % m; }

  /* 5×7 bitmap font */
  var FONT = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
    '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
    '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
    '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
    '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
    '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....']
  };

  function bitmap(text) {
    var chars = String(text || '').toUpperCase().split('');
    var rows = [];
    for (var y = 0; y < 7; y++) {
      var line = '';
      for (var i = 0; i < chars.length; i++) {
        line += (FONT[chars[i]] || FONT[' '])[y] + (i < chars.length - 1 ? '.' : '');
      }
      rows.push(line);
    }
    return {
      w: Math.max(0, chars.length * 6 - 1),
      on: function (x, y) { return y >= 0 && y < 7 && x >= 0 && x < rows[0].length && rows[y][x] === '#'; },
      letter: function (x) { return chars[Math.floor(x / 6)]; }
    };
  }

  /* ───────────── scenes ─────────────
     factory(cols, rows, opts) -> fn(x, y, state) -> {ch, fg, bg?} | null */

  var SCENES = {};

  /* Hero: bracket streams (the idea) → cell block spelling APP/WEB/PPT/XLS → arrow lanes (shipped) */
  SCENES.pipeline = function (cols, rows) {
    var words = ['APP', 'WEB', 'PPT', 'XLS'].map(bitmap);
    var BW = 21, BH = 9, PERIOD = 3.4, SWEEP = 0.78;
    var narrow = cols < 72;
    var bx = narrow ? Math.max(1, Math.floor((cols - BW) * 0.18)) : Math.floor(cols * 0.34);
    var by = Math.max(0, Math.floor((rows - BH) / 2));
    var rx = bx + BW;
    var E = Math.min(cols - 3, rx + Math.max(10, Math.floor((cols - rx) * 0.86)));
    var OPEN = '(<{[', CLOSE = ')>}]';

    var streams = [];
    for (var r = 0; r < BH - 2; r++) {
      var open = '', depth = 4 + Math.floor(hash(r, 1) * 5);
      for (var i = 0; i < depth; i++) open += OPEN[Math.floor(hash(r, i, 7) * 4)];
      var close = open.split('').reverse().map(function (ch) { return CLOSE[OPEN.indexOf(ch)]; }).join('');
      streams.push({
        s: open + close + (hash(r, 2) > 0.5 ? ' ' : ''),
        len: Math.floor(bx * (0.4 + hash(r, 3) * 0.55)),
        speed: 2 + hash(r, 4) * 2.5
      });
    }
    var rowEnd = [];
    for (var k = 0; k < BH; k++) rowEnd.push(E - 2 - Math.floor(hash(k, 5) * Math.max(1, (E - rx) * 0.5)));
    // p = distance along the lane; a ◆ packet with a short trail travels every `spacing` cells
    function lane(ch, p, speed, spacing, off) {
      var q = mod(p - Math.floor(state.t * speed + off), spacing);
      if (q === 0) return { ch: '◆', fg: C.ink, bg: C.white };
      if (q === spacing - 1) return { ch: ch, fg: C.g5 };
      if (q === spacing - 2) return { ch: ch, fg: C.g4 };
      return { ch: ch, fg: C.g2 };
    }

    var state = { t: 0 };

    function base(x, y) {
      var t = state.t;
      var ly = y - by;

      // cell block
      if (x >= bx && x < rx && ly >= 0 && ly < BH) {
        var cyc = t / PERIOD, wi = Math.floor(cyc) % words.length, ph = cyc - Math.floor(cyc);
        var lx = x - bx, word = words[wi];
        if (ph > SWEEP) {
          var edge = ((ph - SWEEP) / (1 - SWEEP)) * (BW + 3);
          if (lx < edge - 2) word = words[(wi + 1) % words.length];
          else if (lx < edge) return { ch: NOISE[Math.floor(hash(x, y, Math.floor(t * 20)) * NOISE.length)], fg: C.ink, bg: C.white };
        }
        var px = lx - 2, py = ly - 1;
        if (word.on(px, py)) {
          var h = hash(x, y, Math.floor(t * 1.5));
          return { ch: word.letter(px), fg: C.ink, bg: SHADES[2 + Math.floor(h * 3)] };
        }
        var edgeCell = ly === 0 || ly === BH - 1 || lx === 0 || lx === BW - 1;
        var n = hash(x, y, Math.floor(t * 0.8));
        return {
          ch: !edgeCell && n > 0.86 ? NOISE[Math.floor(n * 97) % NOISE.length] : '',
          fg: C.g3,
          bg: edgeCell ? C.g0 : (n > 0.5 ? C.g1 : C.g1b)
        };
      }

      // left: bracket streams flowing into the block
      if (x < bx && ly >= 1 && ly < BH - 1) {
        var st = streams[ly - 1];
        var dist = bx - x;
        if (dist <= st.len) {
          var ch = st.s[mod(Math.floor(x - t * st.speed), st.s.length)];
          if (ch === ' ') return null;
          var f = 1 - dist / st.len;
          return { ch: ch, fg: f > 0.78 ? C.g5 : f > 0.5 ? C.g4 : f > 0.22 ? C.g3 : C.g2 };
        }
      }

      // right: arrow lanes carrying shipped work out
      if (x >= rx && x <= E && ly >= 0 && ly < BH) {
        var last = BH - 1;
        if (ly === 0) return lane(x === E ? '↓' : '→', x - rx, 9, 23, 0);
        if (ly === last) return lane('←', (E - rx) + last + (E - x), 9, 23, 0);
        if (x === E) return lane('↓', (E - rx) + ly, 9, 23, 0);
        if (x < rowEnd[ly]) return lane('→', x - rx, 6 + hash(ly, 8) * 6, 27 + Math.floor(hash(ly, 9) * 14), hash(ly, 10) * 40);
        if (x === rowEnd[ly] + 1) return { ch: '·', fg: C.dim };
        return null;
      }

      // sparse dot field
      if (mod(x, 6) === 2 && mod(y, 2) === 0 && hash(x, y, 1) > 0.35) return { ch: '·', fg: C.dot };
      return null;
    }

    return function (x, y, s) {
      state.t = s.t;
      var cell = base(x, y);
      if (s.hover) {
        var dx = (x - s.mx) * ASPECT, dy = y - s.my;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < 2.4) {
          if (!cell) return { ch: NOISE[Math.floor(hash(x, y, Math.floor(s.t * 10)) * NOISE.length)], fg: C.g3 };
          if (cell.bg) return { ch: cell.ch, fg: C.ink, bg: d < 1.2 ? C.white : C.g4 };
          if (cell.ch) return { ch: cell.ch, fg: C.ink, bg: d < 1.2 ? C.g4 : C.g3 };
        }
      }
      return cell;
    };
  };

  /* Sequencer band: arrows → shapes → scrolling letters in shaded cells */
  SCENES.ticker = function (cols, rows, opts) {
    var text = (opts.text || 'APPS · WEBSITES · DECKS · SHEETS · ').toUpperCase();
    var SHAPES = '■●▣◆';
    return function (x, y, s) {
      var t = s.t, k;
      if (y === 0) {
        k = mod(x - Math.floor(t * 7), 46);
        if (k < 37) return { ch: '→', fg: C.g3 };
        if (k === 37) return { ch: '┘', fg: C.g3 };
        if (k === 41) return { ch: '·', fg: C.dim };
        return null;
      }
      if (y === 1) {
        k = mod(x - Math.floor(t * 7) + 17, 52);
        if (k < 4) return { ch: SHAPES[k], fg: C.ink, bg: C.white };
        if (k < 31) return { ch: '→', fg: C.g2 };
        if (k === 31) return { ch: '┘', fg: C.g2 };
        return null;
      }
      var ch = text[mod(x + Math.floor(t * 5), text.length)];
      if (ch === ' ') return null;
      if (ch === '·') return { ch: '◆', fg: C.g3 };
      return { ch: ch, fg: C.ink, bg: SHADES[mod(ch.charCodeAt(0) * 7, 5)] };
    };
  };

  /* Big bitmap text where every lit pixel is a shaded glyph cell */
  SCENES.bitmap = function (cols, rows, opts) {
    var bm = bitmap(opts.text);
    var ox = Math.floor((cols - bm.w) / 2), oy = Math.floor((rows - 7) / 2);
    return function (x, y, s) {
      var px = x - ox, py = y - oy, t = s.t;
      if (bm.on(px, py)) {
        var wave = (Math.sin(px * 0.55 + py * 0.35 - t * 2.2) + 1) / 2;
        var speed = s.hover ? 9 : 1.1;
        var h = hash(x, y, Math.floor(t * speed + hash(x, y, 3) * 10));
        var idx = Math.min(4, Math.floor(wave * 3.2 + (s.hover ? 1.6 : 0.5)));
        return { ch: NOISE[Math.floor(h * NOISE.length)], fg: C.ink, bg: SHADES[idx] };
      }
      if (mod(x + y, 2) === 0 && hash(x, y, 11) > 0.72) return { ch: '·', fg: C.dot };
      return null;
    };
  };

  /* ───────────── renderer ───────────── */

  function mount(canvas) {
    var factory = SCENES[canvas.dataset.scene];
    if (!factory) return;
    var ds = canvas.dataset;
    var opts = { text: ds.text || '' };
    var fit = ds.scene === 'bitmap';
    var fps = +ds.fps || 12;
    var g = canvas.getContext('2d');
    var hoverHost = canvas.closest('[data-glyph-hover]');
    var interactive = 'interactive' in ds;

    var rows = +ds.rows || 9, cols = 1, cw = 10, ch = 16, ox = 0, W = 0, H = 0, lastW = -1;
    var fn = null;
    var st = { t: REDUCED ? 1.7 : 0, mx: -99, my: -99, hover: false };

    function layout(force) {
      var width = canvas.clientWidth;
      if (!width || (!force && width === lastW)) return;
      lastW = width;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      ox = 0;
      if (fit) {
        var pad = ds.pad != null ? +ds.pad : 1;
        cols = Math.max(bitmap(opts.text).w + pad * 2, +ds.cols || 0);
        rows = 7 + pad * 2;
        cw = width / cols;
        ch = cw / ASPECT;
        var maxCell = +ds.maxCell || 40;
        if (ch > maxCell) { ch = maxCell; cw = ch * ASPECT; ox = (width - cols * cw) / 2; }
      } else {
        ch = width < 640 && ds.cellMobile ? +ds.cellMobile : (+ds.cell || 22);
        cols = Math.max(1, Math.floor(width / (ch * ASPECT)));
        cw = width / cols;
      }
      W = width;
      H = Math.round(rows * ch);
      canvas.style.height = H + 'px';
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      fn = factory(cols, rows, opts);
      draw();
    }

    function draw() {
      if (!fn) return;
      g.clearRect(0, 0, W, H);
      g.font = '500 ' + Math.round(ch * 0.66) + 'px "JetBrains Mono", ui-monospace, monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (var y = 0; y < rows; y++) {
        var y0 = Math.round(y * ch), y1 = Math.round((y + 1) * ch);
        for (var x = 0; x < cols; x++) {
          var c = fn(x, y, st);
          if (!c) continue;
          var x0 = Math.round(ox + x * cw), x1 = Math.round(ox + (x + 1) * cw);
          if (c.bg) {
            g.fillStyle = c.bg;
            g.fillRect(x0, y0, x1 - x0, y1 - y0);
            g.fillStyle = 'rgba(0,0,0,.14)';
            g.fillRect(x1 - 1, y0, 1, y1 - y0);
            g.fillRect(x0, y1 - 1, x1 - x0, 1);
          }
          if (c.ch) {
            g.fillStyle = c.fg;
            g.fillText(c.ch, (x0 + x1) / 2, (y0 + y1) / 2 + 1);
          }
        }
      }
    }

    // animation loop, paused while offscreen
    var raf = 0, running = false, last = 0, t0 = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var interval = 1000 / (st.hover ? Math.max(fps, 24) : fps);
      if (now - last < interval) return;
      last = now;
      st.t = (now - t0) / 1000;
      draw();
    }
    function start() { if (!running && !REDUCED) { running = true; raf = requestAnimationFrame(frame); } }
    function stop() { running = false; cancelAnimationFrame(raf); }

    new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? start() : stop();
    }, { rootMargin: '80px' }).observe(canvas);

    new ResizeObserver(function () { layout(false); }).observe(canvas);

    // pointer
    if (interactive) {
      canvas.addEventListener('pointermove', function (e) {
        var r = canvas.getBoundingClientRect();
        st.mx = Math.floor((e.clientX - r.left - ox) / cw);
        st.my = Math.floor((e.clientY - r.top) / ch);
        st.hover = true;
        if (REDUCED) draw();
      });
      canvas.addEventListener('pointerleave', function () { st.hover = false; if (REDUCED) draw(); });
    }
    if (hoverHost) {
      hoverHost.addEventListener('pointerenter', function () { st.hover = true; if (REDUCED) draw(); });
      hoverHost.addEventListener('pointerleave', function () { st.hover = false; if (REDUCED) draw(); });
    }

    layout(true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(true); });

    canvas._glyph = { relayout: function () { layout(true); } };
  }

  function mountAll(root) {
    (root || document).querySelectorAll('canvas[data-scene]').forEach(function (c) {
      if (!c._glyph) mount(c);
    });
  }

  window.Glyph = { mountAll: mountAll, SHADES: SHADES, hash: hash };
  mountAll();
})();
