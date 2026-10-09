/* sub-gate link builder: UI wiring. Logic lives in builder.js. Nothing here sends data anywhere. */
(function () {
  'use strict';

  var B = window.SubGateBuilder;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- strings ----------
  var T = {
    en: {
      title: 'Build your gate link',
      lead: 'Paste your subscription and get a link that always returns it enhanced with fragment + fingerprint.',
      privacy: 'Runs in your browser. Your token and subscription are never sent or stored.',
      s1: 'Your gate',
      baseLabel: 'Worker address',
      baseHelp: 'The domain of your deployed sub-gate Worker.',
      tokenLabel: 'Gate token',
      tokenHelp: 'Same value as GATE_TOKEN on your Worker. At least 16 characters.',
      gen: 'Generate one',
      tokenShow: 'Show token',
      tokenHide: 'Hide token',
      s2: 'Your subscription',
      subsLabel: 'Subscription link(s)',
      subsHelp: 'One link per line. Several links are merged.',
      paste: 'Paste',
      count: function (n) { return n === 1 ? '1 link' : n + ' links'; },
      s3: 'Options',
      fpLabel: 'Fingerprint',
      fpDefault: 'Default',
      fpRandom: 'Random',
      fpNone: 'Off',
      fmtLabel: 'Output',
      fmtPlain: 'Plain text',
      adv: 'Advanced',
      fragLabel: 'TLS fragmentation',
      fragHelp: 'Splits the TLS hello. Turn off if a config stops working.',
      cipherLabel: 'Cipher suites',
      cipherHelp: 'Sends a browser-like cipher list.',
      echLabel: 'ECH (optional)',
      echHelp: 'Adds Encrypted Client Hello to TLS configs. Leave empty to skip.',
      resultTitle: 'Your link',
      resultEmpty: 'Fill in the steps above to see your link.',
      preview: 'Preview',
      share: 'Share',
      resultTip: "Paste this into your app's subscription URL field.",
      copy: 'Copy link',
      copied: 'Copied',
      copyFail: 'Could not copy. Press and hold the link to copy it.',
      pasteFail: 'Allow clipboard access, or paste manually.',
      tokenMade: 'Token generated. Set the same value as GATE_TOKEN on your Worker.',
      tokenMadeCopied: 'Token generated and copied. Set it as GATE_TOKEN on your Worker.',
      noGate: 'No gate yet?',
      deploy: 'Deploy your own in one click',
      'p.base': 'Enter your Worker address',
      'p.token-missing': 'Enter your gate token',
      'p.token-short': 'Token must be at least 16 characters',
      'p.token-placeholder': 'Replace the placeholder token',
      'p.subs': 'Add at least one http(s) subscription link',
      'w.insecure': 'Your Worker address uses http. Use https.',
      'w.ignored': function (n) { return n + (n === 1 ? ' item ignored (not an http/https link)' : ' items ignored (not http/https links)'); },
      langBtn: 'فارسی'
    },
    fa: {
      title: 'ساخت لینک گیت',
      lead: 'لینک اشتراک خود را وارد کنید تا لینکی بگیرید که همیشه نسخهٔ بهبودیافته (فرگمنت + فینگرپرینت) را برمی‌گرداند.',
      privacy: 'همه‌چیز در مرورگر شما انجام می‌شود. توکن و لینک اشتراک هرگز ارسال یا ذخیره نمی‌شود.',
      s1: 'گیت شما',
      baseLabel: 'آدرس ورکر',
      baseHelp: 'دامنهٔ ورکر sub-gate که دیپلوی کرده‌اید.',
      tokenLabel: 'توکن گیت',
      tokenHelp: 'همان مقدار GATE_TOKEN در ورکر شما. حداقل ۱۶ کاراکتر.',
      gen: 'تولید توکن',
      tokenShow: 'نمایش توکن',
      tokenHide: 'پنهان کردن توکن',
      s2: 'اشتراک شما',
      subsLabel: 'لینک(های) اشتراک',
      subsHelp: 'هر لینک در یک خط. چند لینک با هم ادغام می‌شوند.',
      paste: 'چسباندن',
      count: function (n) { return n + ' لینک'; },
      s3: 'تنظیمات',
      fpLabel: 'فینگرپرینت',
      fpDefault: 'پیش‌فرض',
      fpRandom: 'تصادفی',
      fpNone: 'خاموش',
      fmtLabel: 'خروجی',
      fmtPlain: 'متن ساده',
      adv: 'پیشرفته',
      fragLabel: 'فرگمنت TLS',
      fragHelp: 'پیام TLS hello را تکه‌تکه می‌کند. اگر کانفیگی کار نکرد خاموشش کنید.',
      cipherLabel: 'سایفر سوییت‌ها',
      cipherHelp: 'فهرست سایفر شبیه مرورگر ارسال می‌کند.',
      echLabel: 'ECH (اختیاری)',
      echHelp: 'به کانفیگ‌های TLS قابلیت Encrypted Client Hello اضافه می‌کند. برای نادیده گرفتن خالی بگذارید.',
      resultTitle: 'لینک شما',
      resultEmpty: 'مراحل بالا را کامل کنید تا لینک ساخته شود.',
      preview: 'پیش‌نمایش',
      share: 'اشتراک‌گذاری',
      resultTip: 'این لینک را در بخش آدرس اشتراک برنامه‌تان وارد کنید.',
      copy: 'کپی لینک',
      copied: 'کپی شد',
      copyFail: 'کپی نشد. روی لینک نگه دارید تا کپی کنید.',
      pasteFail: 'دسترسی به کلیپ‌بورد را مجاز کنید یا دستی بچسبانید.',
      tokenMade: 'توکن ساخته شد. همین مقدار را به‌عنوان GATE_TOKEN در ورکر تنظیم کنید.',
      tokenMadeCopied: 'توکن ساخته و کپی شد. آن را به‌عنوان GATE_TOKEN در ورکر تنظیم کنید.',
      noGate: 'هنوز گیت ندارید؟',
      deploy: 'با یک کلیک دیپلوی کنید',
      'p.base': 'آدرس ورکر را وارد کنید',
      'p.token-missing': 'توکن گیت را وارد کنید',
      'p.token-short': 'توکن باید حداقل ۱۶ کاراکتر باشد',
      'p.token-placeholder': 'توکن نمونه را عوض کنید',
      'p.subs': 'حداقل یک لینک اشتراک http(s) اضافه کنید',
      'w.insecure': 'آدرس ورکر با http است. از https استفاده کنید.',
      'w.ignored': function (n) { return n + ' مورد نادیده گرفته شد (لینک http/https نیست)'; },
      langBtn: 'English'
    }
  };

  // ---------- tiny safe storage (only non-secret things: language, worker address) ----------
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
    return null;
  }

  var lang = store('sg.lang') || ((navigator.language || '').slice(0, 2) === 'fa' ? 'fa' : 'en');
  if (!T[lang]) lang = 'en';
  var t = function (k) { return T[lang][k]; };

  var touched = {}; // fields the user has interacted with: errors only show for these

  // ---------- state ----------
  function radio(name) {
    var el = document.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function readState() {
    return {
      base: $('base').value,
      token: $('token').value,
      subs: $('subs').value,
      fp: radio('fp'),
      format: radio('format'),
      fragment: $('fragment').checked,
      cipher: $('cipher').checked,
      ech: $('ech').value
    };
  }

  var current = { ready: false, link: '' };
  var copyTimer = null;

  // ---------- render ----------
  function problemField(code) {
    return code === 'base' ? 'base' : code.indexOf('token') === 0 ? 'token' : 'subs';
  }

  function render() {
    var s = readState();
    var res = B.buildLink(s);
    current = res;

    // subscription counter
    var counter = $('subs-count');
    if (res.count > 0) { counter.hidden = false; counter.textContent = t('count')(res.count); } else { counter.hidden = true; }

    // link box
    var box = $('link');
    box.textContent = res.ready ? res.link : t('resultEmpty');
    box.classList.toggle('ready', res.ready);

    // notes: errors only for touched fields, warnings always
    var notes = $('notes');
    notes.textContent = '';
    res.problems.forEach(function (code) {
      if (!touched[problemField(code)]) return;
      var li = document.createElement('li');
      li.className = 'bad';
      li.textContent = t('p.' + code);
      notes.appendChild(li);
    });
    res.warnings.forEach(function (w) {
      var li = document.createElement('li');
      li.className = 'warn';
      var msg = t('w.' + w.code);
      li.textContent = typeof msg === 'function' ? msg(w.n) : msg;
      notes.appendChild(li);
    });

    // actions
    $('btn-preview').disabled = !res.ready;
    $('btn-share').disabled = !res.ready;

    // primary button doubles as a "what's next" hint while not ready
    var copy = $('copy');
    if (!copyTimer) {
      copy.classList.remove('done');
      copy.disabled = !res.ready;
      copy.textContent = res.ready ? t('copy') : t('p.' + res.problems[0]);
    }
  }

  // ---------- i18n ----------
  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].id === 'link') continue; // rendered by render()
      var v = t(els[i].getAttribute('data-i18n'));
      if (typeof v === 'string') els[i].textContent = v;
    }
    $('lang').textContent = t('langBtn');
    $('lang').setAttribute('aria-label', lang === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی');
    syncTokenToggle();
    render();
  }

  // ---------- actions ----------
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  function onCopy() {
    if (!current.ready) return;
    copyText(current.link).then(function () {
      var btn = $('copy');
      btn.classList.add('done');
      btn.textContent = '✓ ' + t('copied');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(function () { copyTimer = null; render(); }, 1800);
    }, function () { toast(t('copyFail')); });
  }

  function onPaste() {
    navigator.clipboard.readText().then(function (txt) {
      if (!txt) return;
      var ta = $('subs');
      ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '\n') + txt.trim() : txt.trim();
      touched.subs = true;
      render();
    }, function () { toast(t('pasteFail')); });
  }

  function syncTokenToggle() {
    var shown = $('token').type === 'text';
    var b = $('token-toggle');
    b.setAttribute('aria-pressed', shown ? 'true' : 'false');
    b.setAttribute('aria-label', shown ? t('tokenHide') : t('tokenShow'));
  }

  function onGenerate() {
    var token = B.randomToken(function (a) { return crypto.getRandomValues(a); });
    $('token').value = token;
    $('token').type = 'text'; // show it so it can be copied into Cloudflare
    touched.token = true;
    syncTokenToggle();
    render();
    copyText(token).then(function () { toast(t('tokenMadeCopied')); }, function () { toast(t('tokenMade')); });
  }

  function onPreview() {
    if (!current.ready) return;
    window.open(B.previewLink(current.link), '_blank', 'noopener,noreferrer');
  }

  function onShare() {
    if (!current.ready || !navigator.share) return;
    navigator.share({ url: current.link }).catch(function () { /* user cancelled */ });
  }

  // ---------- wire up ----------
  var form = $('form');
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  form.addEventListener('input', function (e) {
    var id = e.target.id;
    if (id === 'base') {
      touched.base = true;
      store('sg.base', e.target.value.trim());
    }
    if (id === 'token') touched.token = true;
    if (id === 'subs') touched.subs = true;
    render();
  });
  form.addEventListener('focusout', function (e) {
    var id = e.target.id;
    if (id === 'base' || id === 'token' || id === 'subs') {
      if (e.target.value.trim()) { touched[id] = true; render(); }
    }
  });

  $('copy').addEventListener('click', onCopy);
  $('btn-preview').addEventListener('click', onPreview);
  $('btn-share').addEventListener('click', onShare);
  $('token-gen').addEventListener('click', onGenerate);
  $('token-toggle').addEventListener('click', function () {
    var f = $('token');
    f.type = f.type === 'password' ? 'text' : 'password';
    syncTokenToggle();
  });
  $('lang').addEventListener('click', function () {
    lang = lang === 'fa' ? 'en' : 'fa';
    store('sg.lang', lang);
    applyLang();
  });

  if (navigator.clipboard && navigator.clipboard.readText) {
    $('subs-paste').addEventListener('click', onPaste);
  } else {
    $('subs-paste').hidden = true;
  }
  if (navigator.share) $('btn-share').hidden = false;

  // Link the repo and the one-click deploy button when served from <owner>.github.io/<repo>/
  (function repoLinks() {
    var host = location.hostname;
    if (!/\.github\.io$/i.test(host)) return;
    var owner = host.split('.')[0];
    var repo = location.pathname.split('/')[1] || owner + '.github.io';
    var url = 'https://github.com/' + owner + '/' + repo;
    var r = document.querySelectorAll('[data-repo-link]');
    for (var i = 0; i < r.length; i++) r[i].href = url;
    var d = document.querySelectorAll('[data-deploy-link]');
    for (var j = 0; j < d.length; j++) d[j].href = 'https://deploy.workers.cloudflare.com/?url=' + url;
  })();

  var savedBase = store('sg.base');
  if (savedBase) { $('base').value = savedBase; touched.base = true; }

  applyLang();
})();
