/* Pitaya Béthune – Stocks : alerte du matin, graphiques produits, suivi du plan. */
(function () {
  "use strict";

  var ACCESS_CODE = "2026";
  var AUTH_KEY = "pitaya-auth";

  function checkAuth() {
    try {
      return localStorage.getItem(AUTH_KEY) === ACCESS_CODE;
    } catch (e) {
      return false;
    }
  }

  function initPinGate() {
    var gate = document.createElement("div");
    gate.className = "pin-gate";
    gate.innerHTML = '<div class="pin-box">' +
      '<h1>Code d\'accès</h1>' +
      '<p>Entrez le code pour accéder aux stocks</p>' +
      '<input type="number" inputmode="numeric" class="pin-input" id="pin-input" placeholder="••••" maxlength="4" autocomplete="off">' +
      '<button class="pin-btn" id="pin-btn">Valider</button>' +
      '<div class="pin-error" id="pin-error"></div>' +
      '</div>';
    document.body.insertBefore(gate, document.body.firstChild);

    var input = document.getElementById("pin-input");
    var btn = document.getElementById("pin-btn");
    var error = document.getElementById("pin-error");

    function verify() {
      var val = input.value.trim();
      if (val === ACCESS_CODE) {
        try { localStorage.setItem(AUTH_KEY, ACCESS_CODE); } catch (e) {}
        gate.classList.add("hidden");
        initApp();
      } else {
        input.classList.add("error");
        error.textContent = "Code incorrect";
        setTimeout(function () {
          input.classList.remove("error");
          input.value = "";
          input.focus();
        }, 300);
      }
    }

    btn.addEventListener("click", verify);
    input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") verify();
    });
    input.focus();
  }

  if (checkAuth()) {
    initApp();
  } else {
    initPinGate();
  }

  function initApp() {
  var state = { stocks: null, today: null, chart: null };
  var app = document.getElementById("app");
  var STATUS = {
    ok: { icon: "✅", label: "OK" },
    alerte: { icon: "⚠️", label: "Écart" },
    non_compte: { icon: "➖", label: "Non compté" },
    anomalie: { icon: "❗", label: "Anomalie" }
  };
  var DIAG_ICON = { perte: "🔴", comptage: "🟠", surplus: "🔵", stable: "🟢", inconnu: "⚪", surveiller: "⚪" };

  /* ---------- formatage ---------- */
  function nf(d) { return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function num(x, d) { if (x === null || x === undefined) return "–"; return nf(d === undefined ? 1 : d).format(Math.abs(x) < 1e-9 ? 0 : x).replace("-", "−"); }
  function signed(x, d) {
    if (x === null || x === undefined) return "–";
    var r = Number(Math.abs(x).toFixed(d === undefined ? 1 : d));
    var s = r === 0 ? "" : (x > 0 ? "+" : "−");
    return s + nf(d === undefined ? 1 : d).format(r);
  }
  function cls(x) { if (x === null || x === undefined) return "muted"; return x > 0.005 ? "pos" : (x < -0.005 ? "neg" : "zero"); }
  function d2(iso) { var p = iso.split("-"); return p[2] + "/" + p[1]; }
  function d3(iso) { var p = iso.split("-"); return p[2] + "/" + p[1] + "/" + p[0]; }
  function longDate(iso) {
    var dt = new Date(iso + "T12:00:00");
    var s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(dt);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function unitsTxt(u, item, signedVal) {
    if (u === null || u === undefined || item.unit === "kg") return "";
    var n = Math.abs(u);
    var label = n >= 2 ? item.unit_plural : item.unit;
    return (signedVal ? signed(u, 1) : num(u, 1)) + " " + label;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- données ---------- */
  function load() {
    return Promise.all([
      fetch("data/stocks.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("stocks.json " + r.status); return r.json(); }),
      fetch("data/today.json", { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("today.json " + r.status); return r.json(); })
    ]).then(function (res) {
      state.stocks = res[0]; state.today = res[1];
      var m = state.stocks.meta;
      document.getElementById("footer-update").textContent = " · Données au " + d3(m.latest_date) + " (stock du soir)";
    });
  }
  function product(key) { return state.stocks.products.filter(function (p) { return p.key === key; })[0]; }

  /* ---------- écran 1 : alerte du matin ---------- */
  var ORDER = { alerte: 0, anomalie: 1, non_compte: 2, ok: 3 };
  function recountKey(date, key) { return "pitaya-recompte:" + date + ":" + key; }

  function renderAlerte() {
    var t = state.today, s = t.summary;
    var items = t.items.slice().sort(function (a, b) {
      if (ORDER[a.status] !== ORDER[b.status]) return ORDER[a.status] - ORDER[b.status];
      return Math.abs(b.gap_eur || 0) - Math.abs(a.gap_eur || 0);
    });
    var chips = [];
    if (s.alerte) chips.push(s.alerte + " écart" + (s.alerte > 1 ? "s" : "") + " > 5 %");
    if (s.anomalie) chips.push(s.anomalie + " anomalie" + (s.anomalie > 1 ? "s" : ""));
    if (s.non_compte) chips.push(s.non_compte + " non compté" + (s.non_compte > 1 ? "s" : ""));
    if (s.ok) chips.push(s.ok + " OK");
    var nCheck = s.a_recompter.length;

    var html = '<section class="card hero">' +
      '<div class="eyebrow">Alerte du matin · ' + esc(t.meta.store) + '</div>' +
      '<div class="big">' + (nCheck ? nCheck + " produit" + (nCheck > 1 ? "s" : "") + " à recompter" : "✅ Stock OK") + '</div>' +
      '<div style="font-size:14px;opacity:.95;margin-bottom:10px">Inventaire du ' + longDate(t.date).toLowerCase() + ' (' + d3(t.date) + ') au soir, comparé au stock théorique</div>' +
      '<div class="chips">' + chips.map(function (c) { return '<span class="chip">' + c + '</span>'; }).join("") + '</div>' +
      '</section>';

    if (nCheck) {
      html += '<section class="card instruction"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-2h2v2Zm0-4h-2V7h2v6Z"/></svg>' +
        '<div>' + esc(t.instruction) + '</div></section>';
    }

    items.forEach(function (it) { html += alertCard(it, t.date); });
    html += '<p class="note" style="text-align:center">Tolérance : écart ≤ ' + num(t.meta.threshold_pct, 0) + ' % du théorique = ✅</p>';
    app.innerHTML = html;

    app.querySelectorAll("input[data-recount]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var k = cb.getAttribute("data-recount");
        try { if (cb.checked) localStorage.setItem(k, new Date().toISOString()); else localStorage.removeItem(k); } catch (e) {}
        cb.closest(".recount").classList.toggle("done", cb.checked);
      });
    });
  }

  function alertCard(it, date) {
    var st = STATUS[it.status];
    var h = '<section class="card"><div class="pcard-head"><div><div class="pname">' + esc(it.name) + '</div></div>' +
      '<span class="badge ' + it.status + '">' + st.icon + " " + st.label + '</span></div>';

    if (it.status === "non_compte") {
      h += '<div class="gap-big"><span class="v muted">Non compté</span></div>' +
        '<div class="gap-sub">Produit absent de l\'inventaire : à compter au prochain comptage.</div>' +
        '<div class="kv"><div><div class="k"><span class="dot real"></span>Réel</div><div class="v muted">–</div></div>' +
        '<div><div class="k"><span class="dot theo"></span>Théorique</div><div class="v">' + num(it.theo_kg, 2) + ' kg</div><div class="s">' + unitsTxt(it.theo_kg / it.unit_kg, it) + '</div></div></div>';
    } else {
      var gc = it.status === "ok" ? "zero" : cls(it.gap_kg);
      var pct = it.status === "anomalie" ? "" : '<span class="pct ' + gc + '">' + signed(it.gap_pct, 1) + ' %</span>';
      var sub = [];
      var u = unitsTxt(it.gap_units, it, true);
      if (u) sub.push("≈ " + u);
      sub.push(signed(it.gap_eur, 2) + " €");
      h += '<div class="gap-big"><span class="v ' + gc + '">' + signed(it.gap_kg, 2) + ' kg</span>' + pct + '</div>' +
        '<div class="gap-sub">Écart réel − théorique · ' + sub.join(" · ") + '</div>' +
        '<div class="kv"><div><div class="k"><span class="dot real"></span>Réel</div><div class="v">' + num(it.real_kg, 2) + ' kg</div><div class="s">' + unitsTxt(it.real_units, it) + '</div></div>' +
        '<div><div class="k"><span class="dot theo"></span>Théorique</div><div class="v">' + num(it.theo_kg, 2) + ' kg</div><div class="s">' + unitsTxt(it.theo_kg / it.unit_kg, it) + '</div></div></div>';
      if (it.status === "anomalie") h += '<div class="note">Théorique à 0 : livraison ou transfert probablement non saisi dans Inpulse.</div>';
    }

    if (it.status !== "ok") {
      var key = recountKey(date, it.key), checked = false;
      try { checked = !!localStorage.getItem(key); } catch (e) {}
      h += '<label class="recount' + (checked ? " done" : "") + '"><input type="checkbox" data-recount="' + key + '"' + (checked ? " checked" : "") + '> ' +
        (it.status === "non_compte" ? "Compté" : "Recompté") + '</label>';
    }
    return h + '</section>';
  }

  /* ---------- écran 2 : produits ---------- */
  var planMarker = {
    id: "planMarker",
    afterDatasetsDraw: function (chart, args, opts) {
      if (opts.index === undefined || opts.index < 0) return;
      var x = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
      var px = opts.index > 0 ? (x.getPixelForValue(opts.index - 1) + x.getPixelForValue(opts.index)) / 2 : x.getPixelForValue(0) - 6;
      ctx.save();
      ctx.strokeStyle = "#E6007E"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(px, area.top + 16); ctx.lineTo(px, area.bottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = "700 11px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillStyle = "#E6007E"; ctx.textBaseline = "top";
      var label = "Début du plan d'action", w = ctx.measureText(label).width;
      var tx = Math.min(Math.max(px - w / 2, area.left), area.right - w);
      ctx.fillText(label, tx, area.top);
      ctx.restore();
    }
  };

  function renderProduits(key) {
    var products = state.stocks.products;
    var p = product(key) || products[0];
    var plan = state.stocks.meta.plan_start;
    var html = '<h1>Produits</h1><p class="lead">Stock théorique et réel le soir après fermeture, jour par jour.</p>' +
      '<div class="chipbar" role="tablist">' + products.map(function (x) {
        return '<button data-key="' + x.key + '" class="' + (x.key === p.key ? "active" : "") + '">' + esc(x.name) + '</button>';
      }).join("") + '</div>';

    html += '<section class="card"><div class="pcard-head"><div><div class="pname">' + esc(p.name) + '</div><div class="pinp">' + esc(p.inpulse_name) +
      (p.unit !== "kg" ? " · 1 " + p.unit + " = " + num(p.unit_kg, p.unit_kg % 1 ? 1 : 0) + " kg" : "") + '</div></div></div>' +
      '<div class="chart-wrap"><canvas id="chart" aria-label="Graphique stock théorique et réel"></canvas></div>' +
      '<div class="legend"><span><span class="dot theo"></span>Stock théorique (kg)</span><span><span class="dot real"></span>Stock réel (kg)</span><span class="plan">┊ Début du plan d\'action (' + d2(plan) + ')</span></div></section>';

    var rows = p.days.slice().reverse();
    html += '<section class="card"><div class="pname" style="margin-bottom:6px">Écarts par jour</div><div class="table-scroll"><table><thead><tr>' +
      '<th>Date</th><th>Théo</th><th>Réel</th><th>Écart kg</th><th>%</th><th>€</th><th></th></tr></thead><tbody>';
    rows.forEach(function (d, i) {
      var next = rows[i + 1];
      var gapUnits = (d.gap_units !== null && p.unit !== "kg") ? '<div style="font-size:11px;color:var(--ink-3)">' + unitsTxt(d.gap_units, p, true) + '</div>' : "";
      html += '<tr><td><b>' + d2(d.date) + '</b></td><td>' + num(d.theo_kg, 1) + '</td><td>' + num(d.real_kg, 1) + '</td>' +
        '<td class="' + cls(d.gap_kg) + '"><b>' + signed(d.gap_kg, 1) + '</b>' + gapUnits + '</td>' +
        '<td class="' + cls(d.gap_kg) + '">' + (d.gap_pct === null ? "–" : signed(d.gap_pct, 0)) + '</td>' +
        '<td>' + (d.gap_eur === null ? "–" : signed(d.gap_eur, 0)) + '</td>' +
        '<td class="st" title="' + STATUS[d.status].label + '">' + STATUS[d.status].icon + '</td></tr>';
      if (d.date === plan && next) {
        html += '<tr class="plan-start"><td colspan="7" style="text-align:center;color:var(--accent);font-weight:800;font-size:12px">▲ Plan d\'action depuis le ' + d2(plan) + '</td></tr>';
      }
    });
    html += '</tbody></table></div><p class="note">✅ ≤ 5 % · ⚠️ écart &gt; 5 % · ➖ non compté · ❗ théorique à 0 (anomalie)</p></section>';
    app.innerHTML = html;

    app.querySelectorAll(".chipbar button").forEach(function (b) {
      b.addEventListener("click", function () { location.hash = "#/produits/" + b.getAttribute("data-key"); });
    });
    var active = app.querySelector(".chipbar button.active");
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest", inline: "center" });

    drawChart(p, plan);
  }

  function drawChart(p, plan) {
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    if (typeof Chart === "undefined") return;
    var labels = p.days.map(function (d) { return d2(d.date); });
    var planIdx = p.days.findIndex(function (d) { return d.date >= plan; });
    state.chart = new Chart(document.getElementById("chart"), {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          { label: "Théorique", data: p.days.map(function (d) { return d.theo_kg; }), backgroundColor: "#00D1D1", borderRadius: 6, borderSkipped: false, categoryPercentage: 0.75, barPercentage: 0.9 },
          { label: "Réel", data: p.days.map(function (d) { return d.real_kg; }), backgroundColor: "#C5C9CF", borderRadius: 6, borderSkipped: false, categoryPercentage: 0.75, barPercentage: 0.9 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        layout: { padding: { top: 4 } },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          planMarker: { index: planIdx },
          tooltip: {
            callbacks: {
              label: function (c) { return c.dataset.label + " : " + (c.raw === null ? "non compté" : num(c.raw, 2) + " kg"); },
              afterBody: function (items) {
                var d = p.days[items[0].dataIndex];
                if (d.gap_kg === null) return "";
                return "Écart : " + signed(d.gap_kg, 2) + " kg" + (d.gap_pct !== null ? " (" + signed(d.gap_pct, 1) + " %)" : "") + " · " + signed(d.gap_eur, 2) + " €";
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 60, autoSkip: false, color: "#8A8E9C" } },
          y: { beginAtZero: true, grace: "12%", grid: { color: "#EFEFF3" }, border: { display: false }, ticks: { font: { size: 10 }, color: "#8A8E9C", callback: function (v) { return num(v, 0); } } }
        }
      },
      plugins: [planMarker]
    });
  }

  /* ---------- écran 3 : suivi du plan ---------- */
  function renderSuivi() {
    var m = state.stocks.meta, plan = m.plan_start;
    var products = state.stocks.products.slice().sort(function (a, b) { return a.since_plan.cum_gap_eur - b.since_plan.cum_gap_eur; });
    var sinceDays = state.stocks.products[0].days.filter(function (d) { return d.date >= plan; }).length;
    var firstBefore = m.first_date, prevDay = state.stocks.products[0].days.filter(function (d) { return d.date < plan; }).slice(-1)[0];
    var total = products.reduce(function (s, p) { return s + p.since_plan.cum_gap_eur; }, 0);
    var losses = products.filter(function (p) { return p.since_plan.diagnostic_code === "perte"; });

    var html = '<section class="card hero"><div class="eyebrow">Suivi du plan d\'action</div>' +
      '<div class="big">Depuis le ' + d2(plan) + '</div>' +
      '<div style="font-size:14px;opacity:.95;margin-bottom:10px">' + sinceDays + ' jours (' + d2(plan) + ' → ' + d2(m.latest_date) + ') · écart net cumulé ' + signed(total, 0) + ' €</div>' +
      '<div class="chips">' + (losses.length ? losses.map(function (p) { return '<span class="chip">🔴 Vraie perte : ' + esc(p.name) + '</span>'; }).join("") : '<span class="chip">Aucune vraie perte détectée</span>') + '</div></section>';

    products.forEach(function (p) {
      var s = p.since_plan, b = p.before_plan;
      var days = p.days.filter(function (d) { return d.date >= plan; });
      html += '<section class="card"><div class="pcard-head"><div class="pname">' + esc(p.name) + '</div>' +
        '<span class="badge ' + (s.days_over_threshold ? "alerte" : "ok") + '">' + s.days_over_threshold + ' / ' + s.days_counted + ' j &gt; 5 %</span></div>' +
        '<div class="summary-grid">' +
        '<div><div class="k">Écart cumulé</div><div class="v ' + cls(s.cum_gap_kg) + '">' + signed(s.cum_gap_kg, 1) + ' kg</div><div class="k">' + (p.unit !== "kg" ? "≈ " + unitsTxt(s.cum_gap_units, p, true) : "&nbsp;") + '</div></div>' +
        '<div><div class="k">Valeur</div><div class="v ' + cls(s.cum_gap_eur) + '">' + signed(s.cum_gap_eur, 0) + ' €</div><div class="k">' + s.days_negative + ' j négatifs · ' + s.days_positive + ' j positifs</div></div>' +
        '</div>' +
        '<div class="signs">' + days.map(function (d) {
          var c = d.status === "non_compte" || d.status === "anomalie" ? "x" : (d.status === "ok" ? "o" : (d.gap_kg > 0 ? "p" : "n"));
          var v = d.status === "non_compte" ? "–" : (d.gap_pct === null ? "!" : signed(d.gap_pct, 0) + "%");
          return '<span class="' + c + '">' + d2(d.date) + '<br>' + v + '</span>';
        }).join("") + '</div>' +
        '<div class="diag ' + s.diagnostic_code + '">' + (DIAG_ICON[s.diagnostic_code] || "") + ' ' + esc(s.diagnostic) + '</div>' +
        (s.days_not_counted ? '<div class="compare">➖ ' + s.days_not_counted + ' jour' + (s.days_not_counted > 1 ? "s" : "") + ' non compté' + (s.days_not_counted > 1 ? "s" : "") + ' depuis le ' + d2(plan) + '.</div>' : "") +
        '<div class="compare">Avant le plan (' + d2(firstBefore) + ' → ' + d2(prevDay.date) + ') : ' + signed(b.cum_gap_kg, 1) + ' kg (' + signed(b.cum_gap_eur, 0) + ' €), ' +
        b.days_over_threshold + ' / ' + b.days_counted + ' j &gt; 5 %' + (b.days_anomaly ? ', ' + b.days_anomaly + ' j théorique à 0' : '') + '.</div>' +
        '</section>';
    });

    html += '<section class="card"><div class="pname" style="margin-bottom:6px">Comment lire le diagnostic</div><div class="rule">' +
      '🟠 <b>L\'écart alterne entre + et −</b> → erreur de comptage ou de saisie : recompter au sachet / à la poche près.<br>' +
      '🔴 <b>Écart négatif presque tous les jours</b> → vraie perte : portions, pertes non déclarées, réceptions à peser.<br>' +
      '🔵 <b>Écart positif presque tous les jours</b> → livraison ou transfert non saisi.<br>' +
      '🟢 <b>Tous les jours ≤ 5 %</b> → stock maîtrisé.</div></section>';
    app.innerHTML = html;
  }

  /* ---------- routeur ---------- */
  function route() {
    if (!state.stocks) return;
    var parts = (location.hash || "#/alerte").replace(/^#\/?/, "").split("/");
    var tab = ["alerte", "produits", "suivi"].indexOf(parts[0]) >= 0 ? parts[0] : "alerte";
    if (state.chart && tab !== "produits") { state.chart.destroy(); state.chart = null; }
    document.querySelectorAll(".tabbar a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-tab") === tab); });
    if (tab === "alerte") renderAlerte();
    else if (tab === "produits") renderProduits(parts[1]);
    else renderSuivi();
    window.scrollTo(0, 0);
  }

  function updateOnline() { document.getElementById("offline-pill").hidden = navigator.onLine; }
  window.addEventListener("online", updateOnline);
  window.addEventListener("offline", updateOnline);
  window.addEventListener("hashchange", route);
  updateOnline();

  load().then(route).catch(function (e) {
    app.innerHTML = '<div class="error">Impossible de charger les données (' + esc(e.message) + '). Vérifiez la connexion puis rouvrez l\'appli.</div>';
  });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
  }
})();
