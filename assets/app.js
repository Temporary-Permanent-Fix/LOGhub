(function () {
  'use strict';
  var API = '/api/data';
  var LANGKEY = 'alzaHub.lang.v2';
  var POLL_MS = 20000;

  var T = {
    sk: { eyebrow: 'Rozcestník', h1: 'Všetko na jednom mieste.',
      lead: 'Kategórie aj odkazy si pridávaš sám — zoznam rastie, koľko treba. Hľadaj alebo prechádzaj.',
      search: 'Hľadať odkaz…', editBtn: 'Upraviť', editBtnOn: 'Hotovo',
      addLink: 'Pridať odkaz', addCat: 'Nová kategória', removeCat: 'Odstrániť', removeLink: 'Odstrániť odkaz',
      save: 'Uložiť', cancel: 'Zrušiť', none: 'Nič sa nenašlo',
      fName: 'Názov odkazu', fSub: 'Krátky popis', fUrl: 'URL adresa',
      fCatSk: 'Názov kategórie (SK)', fCatEn: 'Názov kategórie (EN)',
      inCats: ' v {n} kategóriách', loading: 'Načítavam…',
      confirmCat: 'Odstrániť kategóriu „{name}“ aj s jej odkazmi ({n})? Zmena sa prejaví všetkým.',
      noStore: 'Úložisko nie je pripojené — úpravy sú vypnuté', offline: 'Server nedostupný', saveErr: 'Uloženie zlyhalo' },
    en: { eyebrow: 'Start here', h1: 'Everything in one place.',
      lead: 'You add the categories and links yourself — the list grows as far as you need. Search or browse.',
      search: 'Search a link…', editBtn: 'Edit', editBtnOn: 'Done',
      addLink: 'Add link', addCat: 'New category', removeCat: 'Remove', removeLink: 'Remove link',
      save: 'Save', cancel: 'Cancel', none: 'No matches',
      fName: 'Link name', fSub: 'Short description', fUrl: 'URL',
      fCatSk: 'Category name (SK)', fCatEn: 'Category name (EN)',
      inCats: ' in {n} categories', loading: 'Loading…',
      confirmCat: 'Remove category “{name}” and its links ({n})? This changes it for everyone.',
      noStore: 'Storage not connected — editing is disabled', offline: 'Server unreachable', saveErr: 'Save failed' }
  };

  var st = { data: null, lang: 'sk', q: '', edit: false, adding: null, addingCat: false,
             busy: false, status: null, canEdit: true };
  try { var l = JSON.parse(localStorage.getItem(LANGKEY)); if (l === 'sk' || l === 'en') st.lang = l; } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  // Only http(s)/mailto ever reach an href, whatever is in storage.
  var safeHref = function (h) { return /^(https?:\/\/|mailto:)/i.test(h || '') ? h : '#'; };
  function plural(n, lang) {
    if (lang === 'en') return n + (n === 1 ? ' link' : ' links');
    return n + ' ' + (n === 1 ? 'odkaz' : (n >= 2 && n <= 4 ? 'odkazy' : 'odkazov'));
  }

  // ── server ──────────────────────────────────────────────
  function request(method, body) {
    return fetch(API, {
      method: method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.error || ('HTTP ' + r.status)); e.status = r.status; e.code = j.error; throw e; }
        return j.data;
      });
    });
  }

  function refresh(silent) {
    return request('GET').then(function (data) {
      st.canEdit = true; st.status = null;
      // Don't redraw under someone who is typing into a form.
      if (silent && (st.adding || st.addingCat || st.busy)) { st.pending = data; return; }
      st.data = data; render();
    }).catch(function (e) {
      if (e.code === 'storage_not_configured') { st.status = 'noStore'; st.canEdit = false; st.edit = false; }
      else st.status = 'offline';
      if (!st.data) st.data = [];
      render();
    });
  }

  function mutate(body) {
    if (st.busy) return Promise.resolve(false);
    st.busy = true;
    return request('POST', body).then(function (data) {
      st.busy = false; st.status = null; st.data = data; st.pending = null;
      return true;
    }).catch(function (e) {
      st.busy = false; st.status = 'saveErr'; st.statusDetail = e.status === 400 ? e.message : '';
      renderChrome();
      return false;
    });
  }

  // ── render ──────────────────────────────────────────────
  function renderChrome() {
    var t = T[st.lang];
    document.documentElement.lang = st.lang;
    $('eyebrow').textContent = t.eyebrow;
    $('h1').textContent = t.h1;
    $('lead').textContent = t.lead;
    $('search').placeholder = t.search;
    $('editBtn').textContent = st.edit ? t.editBtnOn : t.editBtn;
    $('editBtn').className = 'mono edit-btn' + (st.edit ? ' on' : '');
    $('editBtn').hidden = !st.canEdit;
    $('langSk').className = 'mono' + (st.lang === 'sk' ? ' on' : '');
    $('langEn').className = 'mono' + (st.lang === 'en' ? ' on' : '');
    var s = $('status');
    s.hidden = !st.status;
    if (st.status) {
      s.textContent = t[st.status] + (st.status === 'saveErr' && st.statusDetail ? ': ' + st.statusDetail : '');
      s.className = 'status' + (st.status === 'noStore' ? '' : ' err');
    }
  }

  function render() {
    renderChrome();
    var t = T[st.lang], lang = st.lang, box = $('sections');
    if (!st.data) { box.innerHTML = '<div class="empty">' + esc(t.loading) + '</div>'; $('count').textContent = ''; return; }

    var q = st.q.trim().toLowerCase(), zones = st.data, edit = st.edit;
    var all = zones.reduce(function (n, z) { return n + z.links.length; }, 0);
    var hay = function (z, l) { return (l.title + ' ' + (l.sub[lang] || '') + ' ' + z.name.sk + ' ' + z.name.en).toLowerCase(); };
    var shown = zones.map(function (z, i) {
      return { z: z, i: i, links: q ? z.links.filter(function (l) { return hay(z, l).indexOf(q) >= 0; }) : z.links };
    }).filter(function (o) { return o.links.length || (edit && !q); });
    var total = shown.reduce(function (n, o) { return n + o.links.length; }, 0);

    $('count').textContent = q ? total + ' / ' + plural(all, lang)
                               : plural(all, lang) + t.inCats.replace('{n}', zones.length);

    var h = shown.map(function (o) {
      var z = o.z, n = (o.i + 1 < 10 ? '0' : '') + (o.i + 1);
      var cards = o.links.map(function (l) {
        return '<div class="card-wrap"><a class="card" href="' + esc(safeHref(l.href)) + '">' +
          '<div class="dot"></div><div class="card-txt">' +
          '<div class="card-title">' + esc(l.title) + '</div>' +
          '<div class="card-sub">' + esc(l.sub[lang] || l.sub.sk || '') + '</div></div>' +
          '<div class="arrow">→</div></a>' +
          (edit ? '<button class="rm-link" data-act="rmLink" data-cat="' + esc(z.id) + '" data-link="' + esc(l.id) +
                  '" title="' + esc(t.removeLink) + '" aria-label="' + esc(t.removeLink) + '">×</button>' : '') +
          '</div>';
      }).join('');
      var tail = '';
      if (edit && st.adding === z.id) {
        tail = '<form class="form link-form" data-form="link" data-cat="' + esc(z.id) + '">' +
          '<input name="title" maxlength="120" placeholder="' + esc(t.fName) + '">' +
          '<input name="sub" maxlength="200" placeholder="' + esc(t.fSub) + '">' +
          '<input name="href" class="url" maxlength="2000" placeholder="' + esc(t.fUrl) + '">' +
          '<div class="form-btns"><button type="submit" class="btn primary">' + esc(t.save) + '</button>' +
          '<button type="button" class="btn ghost" data-act="cancel">' + esc(t.cancel) + '</button></div></form>';
      } else if (edit) {
        tail = '<button class="add-link" data-act="addLink" data-cat="' + esc(z.id) + '">+ ' + esc(t.addLink) + '</button>';
      }
      return '<section class="sec" id="' + esc(z.id) + '"><div class="sec-head">' +
        '<div class="sec-n">' + n + '</div>' +
        '<div class="sec-name">' + esc(z.name[lang] || z.name.sk) + '</div><div class="grow"></div>' +
        '<div class="sec-count">' + plural(o.links.length, lang) + '</div>' +
        (edit ? '<button class="rm-cat" data-act="rmCat" data-cat="' + esc(z.id) + '">' + esc(t.removeCat) + '</button>' : '') +
        '</div><div class="grid">' + cards + tail + '</div></section>';
    }).join('');

    if (!shown.length) h += '<div class="empty">' + esc(t.none) + '</div>';
    if (edit && st.addingCat) {
      h += '<form class="form cat-form" data-form="cat"><div class="form-title">' + esc(t.addCat) + '</div>' +
        '<input name="sk" maxlength="80" placeholder="' + esc(t.fCatSk) + '">' +
        '<input name="en" maxlength="80" placeholder="' + esc(t.fCatEn) + '">' +
        '<div class="form-btns"><button type="submit" class="btn primary">' + esc(t.save) + '</button>' +
        '<button type="button" class="btn ghost" data-act="cancel">' + esc(t.cancel) + '</button></div></form>';
    } else if (edit) {
      h += '<button class="add-cat" data-act="addCat">+ ' + esc(t.addCat) + '</button>';
    }
    box.innerHTML = h;
    var f = box.querySelector('form input'); if (f) f.focus();
  }

  function closeForms() {
    st.adding = null; st.addingCat = false;
    if (st.pending) { st.data = st.pending; st.pending = null; }
  }

  // ── events ──────────────────────────────────────────────
  $('editBtn').onclick = function () { st.edit = !st.edit; closeForms(); render(); };
  $('langSk').onclick = function () { setLang('sk'); };
  $('langEn').onclick = function () { setLang('en'); };
  function setLang(l) { st.lang = l; try { localStorage.setItem(LANGKEY, JSON.stringify(l)); } catch (e) {} render(); }
  $('search').oninput = function (e) { st.q = e.target.value; render(); };

  $('sections').addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    var act = b.dataset.act, cat = b.dataset.cat;
    if (act === 'addLink') { st.adding = cat; st.addingCat = false; render(); }
    else if (act === 'addCat') { st.addingCat = true; st.adding = null; render(); }
    else if (act === 'cancel') { closeForms(); render(); }
    else if (act === 'rmLink') { mutate({ op: 'removeLink', catId: cat, linkId: b.dataset.link }).then(function (ok) { if (ok) render(); }); }
    else if (act === 'rmCat') {
      var z = st.data.filter(function (x) { return x.id === cat; })[0]; if (!z) return;
      var msg = T[st.lang].confirmCat.replace('{name}', z.name[st.lang] || z.name.sk).replace('{n}', z.links.length);
      if (z.links.length && !window.confirm(msg)) return;
      mutate({ op: 'removeCat', catId: cat }).then(function (ok) { if (ok) render(); });
    }
  });

  $('sections').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, v = function (n) { return f.elements[n].value.trim(); }, body;
    if (f.dataset.form === 'link') {
      if (!v('title')) { f.elements.title.focus(); return; }
      body = { op: 'addLink', catId: f.dataset.cat, title: v('title'), sub: v('sub'), href: v('href') };
    } else {
      if (!v('sk') && !v('en')) { f.elements.sk.focus(); return; }
      body = { op: 'addCat', sk: v('sk'), en: v('en') };
    }
    var btn = f.querySelector('[type=submit]'); btn.disabled = true;
    mutate(body).then(function (ok) {
      if (ok) { st.adding = null; st.addingCat = false; render(); } else btn.disabled = false;
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && (st.adding || st.addingCat)) { closeForms(); render(); }
  });

  render();
  refresh(false);
  setInterval(function () { if (!document.hidden) refresh(true); }, POLL_MS);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(true); });
})();
