/**
 * STUNT-GUARD TEPUS 3 - Frontend Application Logic
 * Sistem Deteksi Dini & Antropometri Balita Posyandu Padukuhan Tepus 3
 * Kelompok 39 Tim A KKNT UDB 2026
 */

// Auto-detect API Base URL:
// - Dibuka via server hosting / IP LAN Wi-Fi / localhost: gunakan relative path ""
// - Dibuka via double-click file://: fallback ke http://localhost:8000
const API_BASE_URL = window.location.protocol.startsWith("http") ? "" : "http://localhost:8000";

// WHO Piecewise Reference Standard
const WHO_CURVES = {
  months: [0, 6, 12, 24, 36, 48, 60],
  boys: {
    median: [49.9, 67.6, 75.7, 87.8, 96.1, 103.3, 110.0],
    sd:     [1.89, 2.35, 2.65, 3.25, 3.65,  4.05,  4.45]
  },
  girls: {
    median: [49.1, 65.7, 74.0, 86.4, 95.1, 102.7, 109.4],
    sd:     [1.85, 2.30, 2.60, 3.20, 3.60,  4.00,  4.40]
  }
};

// State Aplikasi
let appState = {
  isBackendConnected: false,
  balitaData: [
    {
      id: 1,
      nama_balita: "Aditia Pratama",
      nama_ibu: "Siti Aminah",
      rt_wilayah: "RT 01",
      usia_bulan: 18,
      gender: "L",
      tinggi_cm: 82.5,
      berat_kg: 10.8,
      lila_cm: 14.5,
      sumber_air: "Sumur Karst Kapur",
      riwayat_bblr: false,
      asi_eksklusif: true,
      jamban_sehat: true,
      zscore_tb: 0.25,
      status_risiko: "Normal (Optimal)",
      risk_score: 0.10,
      tanggal_periksa: "2026-11-20"
    },
    {
      id: 2,
      nama_balita: "Aulia Rahmawati",
      nama_ibu: "Sri Wahyuni",
      rt_wilayah: "RT 02",
      usia_bulan: 24,
      gender: "P",
      tinggi_cm: 81.2,
      berat_kg: 9.4,
      lila_cm: 12.0,
      sumber_air: "Sumur Karst Kapur",
      riwayat_bblr: true,
      asi_eksklusif: false,
      jamban_sehat: true,
      zscore_tb: -1.63,
      status_risiko: "Waspada (Faltering Growth)",
      risk_score: 0.58,
      tanggal_periksa: "2026-11-21"
    },
    {
      id: 3,
      nama_balita: "Bima Sakti",
      nama_ibu: "Kustini",
      rt_wilayah: "RT 03",
      usia_bulan: 36,
      gender: "L",
      tinggi_cm: 84.5,
      berat_kg: 10.1,
      lila_cm: 11.2,
      sumber_air: "PAH Air Hujan",
      riwayat_bblr: true,
      asi_eksklusif: false,
      jamban_sehat: true,
      zscore_tb: -3.18,
      status_risiko: "Risiko Tinggi (Stunted)",
      risk_score: 0.89,
      tanggal_periksa: "2026-11-22"
    },
    {
      id: 4,
      nama_balita: "Citra Kirana",
      nama_ibu: "Wulandari",
      rt_wilayah: "RT 04",
      usia_bulan: 12,
      gender: "P",
      tinggi_cm: 74.5,
      berat_kg: 9.2,
      lila_cm: 14.0,
      sumber_air: "PAM Desa",
      riwayat_bblr: false,
      asi_eksklusif: true,
      jamban_sehat: true,
      zscore_tb: 0.19,
      status_risiko: "Normal (Optimal)",
      risk_score: 0.08,
      tanggal_periksa: "2026-11-23"
    },
    {
      id: 5,
      nama_balita: "Dafa Alfarizi",
      nama_ibu: "Nurjanah",
      rt_wilayah: "RT 02",
      usia_bulan: 30,
      gender: "L",
      tinggi_cm: 86.0,
      berat_kg: 10.8,
      lila_cm: 12.2,
      sumber_air: "Sumur Karst Kapur",
      riwayat_bblr: false,
      asi_eksklusif: true,
      jamban_sehat: true,
      zscore_tb: -1.72,
      status_risiko: "Waspada (Faltering Growth)",
      risk_score: 0.45,
      tanggal_periksa: "2026-11-24"
    }
  ],
  filterRT: "ALL",
  filterStatus: "ALL",
  searchQuery: ""
};

// Interpolasi Linier Piecewise
function interpolate(x, xArr, yArr) {
  if (x <= xArr[0]) return yArr[0];
  if (x >= xArr[xArr.length - 1]) return yArr[yArr.length - 1];
  for (let i = 0; i < xArr.length - 1; i++) {
    if (x >= xArr[i] && x <= xArr[i + 1]) {
      const t = (x - xArr[i]) / (xArr[i + 1] - xArr[i]);
      return yArr[i] + t * (yArr[i + 1] - yArr[i]);
    }
  }
  return yArr[0];
}

// Fallback Mesin Inferensi WHO & Decision Tree
function hitungWHOFallback(usia, gender, tinggi, lila, bblr, asi, karst) {
  const curve = (gender === "L") ? WHO_CURVES.boys : WHO_CURVES.girls;
  const med_h = interpolate(usia, WHO_CURVES.months, curve.median);
  const sd_h  = interpolate(usia, WHO_CURVES.months, curve.sd);
  const z_tb  = Number(((tinggi - med_h) / sd_h).toFixed(2));

  let kat_tb = "Normal (Gizi Baik)";
  if (z_tb < -3.0) kat_tb = "Sangat Pendek (Severely Stunted)";
  else if (z_tb < -2.0) kat_tb = "Pendek (Stunted)";
  else if (z_tb > 3.0) kat_tb = "Tinggi";

  let kat_lila = "Hijau (Gizi Baik)";
  if (lila < 11.5) kat_lila = "Merah (Gizi Buruk / Wasting Akut)";
  else if (lila < 12.5) kat_lila = "Kuning (Waspada / Gizi Kurang)";

  let status_risiko = "Normal (Optimal)";
  let risk_score = 0.12;
  let rule = "RULE-01: IF (Z_TB >= -1.5 AND LiLA >= 12.5cm) THEN 'Normal (Optimal)'";
  const rekomendasi = [];

  if (z_tb < -2.0 || (z_tb < -1.8 && lila < 11.5)) {
    status_risiko = "Risiko Tinggi (Stunted)";
    risk_score = 0.88;
    rule = "RULE-03: IF (Z_TB < -2.0) OR (Z_TB < -1.8 AND LiLA < 11.5cm) THEN 'Risiko Tinggi'";
    rekomendasi.push("⚠️ Rujukan Segera: Laporkan dan rujuk balita ke Bidan Desa / Puskesmas Pembantu Tepus.");
    rekomendasi.push("🥩 Terapi Nutrisi: Asupan protein hewani harian (1 butir telur/hari, ikan laut lumat Tepus).");
    rekomendasi.push("💧 Sanitasi Air: Pastikan air minum balita bebas endapan kapur dan direbus mendidih.");
  } else if (z_tb < -1.5 || (z_tb < -1.2 && (bblr || !asi))) {
    status_risiko = "Waspada (Faltering Growth)";
    risk_score = 0.52;
    rule = "RULE-02: IF (Z_TB < -1.5) OR (Z_TB < -1.2 AND (BBLR == True OR ASI == False)) THEN 'Waspada'";
    rekomendasi.push("🟡 Intervensi PMT Lokal: Berikan PMT fortifikasi olahan singkong & daun kelor atau nugget ikan.");
    rekomendasi.push("⚖️ Pemantauan Ulang: Timbang ulang berat dan tinggi badan dalam 14 hari di Posyandu.");
  } else {
    rekomendasi.push("✅ Pertahankan Pola Asuh: Tumbuh kembang balita sesuai kurva standar WHO.");
    rekomendasi.push("🥦 Diversifikasi Pangan: Lanjutkan pola makan gizi seimbang berbasis pangan lokal.");
  }

  return {
    zscore_tb: z_tb,
    kategori_zscore: kat_tb,
    status_lila: kat_lila,
    status_risiko: status_risiko,
    risk_score: risk_score,
    decision_rule: rule,
    rekomendasi: rekomendasi
  };
}

// Navigasi Tab
function gantiTab(tabId) {
  document.querySelectorAll(".halaman-tab").forEach(el => el.classList.remove("aktif"));
  document.querySelectorAll("nav button").forEach(btn => btn.classList.remove("aktif"));

  const targetTab = document.getElementById("tab-" + tabId);
  const targetBtn = document.getElementById("btn-" + tabId);

  if (targetTab) targetTab.classList.add("aktif");
  if (targetBtn) {
    targetBtn.classList.add("aktif");
    // Geser otomatis pill navigation ke tengah saat diklik di layar HP
    targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  if (tabId === "rekap") renderTabelBalita();
  if (tabId === "analisis") renderAnalisisWilayah();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Pilih Gender Segmen
let selectedGender = "L";
function setGender(g) {
  selectedGender = g;
  document.getElementById("btn-gender-l").classList.toggle("aktif", g === "L");
  document.getElementById("btn-gender-p").classList.toggle("aktif", g === "P");
  eksekusiPrediksiLive();
}

// Sinkronisasi Usia Slider & Input
function syncUsia(val) {
  document.getElementById("in-usia").value = val;
  document.getElementById("range-usia").value = val;
  document.getElementById("label-usia-bln").innerText = val + " Bulan";
  eksekusiPrediksiLive();
}

// Eksekusi Prediksi
async function eksekusiPrediksiLive() {
  const nama = document.getElementById("in-nama-balita").value || "Balita Posyandu";
  const ibu = document.getElementById("in-nama-ibu").value || "-";
  const rt = document.getElementById("in-rt").value;
  const usia = parseInt(document.getElementById("in-usia").value, 10);
  const tinggi = parseFloat(document.getElementById("in-tinggi").value);
  const berat = parseFloat(document.getElementById("in-berat").value);
  const lila = parseFloat(document.getElementById("in-lila").value);
  const sumberAir = document.getElementById("in-air").value;
  const bblr = document.getElementById("in-bblr").checked;
  const asi = document.getElementById("in-asi").checked;
  const jamban = document.getElementById("in-jamban").checked;

  const payload = {
    nama_balita: nama,
    nama_ibu: ibu,
    rt_wilayah: rt,
    usia_bulan: usia,
    gender: selectedGender,
    tinggi_cm: tinggi,
    berat_kg: berat,
    lila_cm: lila,
    sumber_air: sumberAir,
    riwayat_bblr: bblr,
    asi_eksklusif: asi,
    jamban_sehat: jamban
  };

  let resData = null;

  if (appState.isBackendConnected) {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        resData = await resp.json();
      }
    } catch (err) {
      console.warn("Backend offline, menggunakan Fallback Engine WHO:", err);
    }
  }

  if (!resData) {
    // Fallback Client-side Engine
    const fb = hitungWHOFallback(usia, selectedGender, tinggi, lila, bblr, asi, sumberAir === "Sumur Karst Kapur");
    resData = {
      ...payload,
      ...fb
    };
  }

  // Tampilkan Hasil ke DOM
  const badgeEl = document.getElementById("badge-hasil-risiko");
  const katRisiko = resData.status_risiko;
  badgeEl.innerText = katRisiko;

  badgeEl.className = "badge-hasil-besar";
  if (katRisiko.includes("Normal")) badgeEl.classList.add("Normal");
  else if (katRisiko.includes("Waspada")) badgeEl.classList.add("Waspada");
  else badgeEl.classList.add("Stunted");

  document.getElementById("res-zscore").innerText = `${resData.zscore_tb > 0 ? "+" : ""}${resData.zscore_tb} SD`;
  document.getElementById("res-kategori-tb").innerText = resData.kategori_zscore;
  document.getElementById("res-lila-status").innerText = resData.status_lila;
  document.getElementById("res-risk-score").innerText = `${Math.round(resData.risk_score * 100)}%`;
  document.getElementById("res-decision-rule").innerText = resData.decision_rule;

  const listRekom = document.getElementById("list-rekomendasi");
  listRekom.innerHTML = "";
  resData.rekomendasi.forEach(item => {
    const li = document.createElement("li");
    li.innerText = item;
    listRekom.appendChild(li);
  });

  return resData;
}

// Simpan Data Baru ke Rekapitulasi
async function simpanHasilKeRekap() {
  const currentResult = await eksekusiPrediksiLive();
  const nama = document.getElementById("in-nama-balita").value.trim();
  if (!nama) {
    alert("Silakan masukkan Nama Balita terlebih dahulu.");
    document.getElementById("in-nama-balita").focus();
    return;
  }

  if (appState.isBackendConnected) {
    try {
      const resp = await fetch(`${API_BASE_URL}/api/balita`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentResult)
      });
      if (resp.ok) {
        const saved = await resp.json();
        appState.balitaData.unshift(saved.record);
        alert(`Data balita ${nama} berhasil disimpan ke Database Posyandu Tepus 3!`);
        updateKPICards();
        gantiTab("rekap");
        return;
      }
    } catch (err) {
      console.warn("Gagal simpan ke backend:", err);
    }
  }

  // Simpan Lokal
  const newId = Math.max(...appState.balitaData.map(b => b.id), 0) + 1;
  const localRecord = {
    id: newId,
    ...currentResult,
    tanggal_periksa: new Date().toISOString().split("T")[0]
  };
  appState.balitaData.unshift(localRecord);
  alert(`Data balita ${nama} berhasil disimpan ke Rekap Posyandu (Penyimpanan Lokal)!`);
  updateKPICards();
  gantiTab("rekap");
}

// Hapus Data Balita
async function hapusBalita(id) {
  if (!confirm("Apakah Anda yakin ingin menghapus catatan balita ini?")) return;

  if (appState.isBackendConnected) {
    try {
      await fetch(`${API_BASE_URL}/api/balita/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Gagal menghapus dari backend:", err);
    }
  }

  appState.balitaData = appState.balitaData.filter(b => b.id !== id);
  renderTabelBalita();
  updateKPICards();
}

// Render Tabel Balita
function renderTabelBalita() {
  const tbody = document.getElementById("tbody-balita");
  if (!tbody) return;

  let filtered = [...appState.balitaData];

  // Filter RT
  if (appState.filterRT !== "ALL") {
    filtered = filtered.filter(b => b.rt_wilayah === appState.filterRT);
  }

  // Filter Status
  if (appState.filterStatus !== "ALL") {
    filtered = filtered.filter(b => b.status_risiko.includes(appState.filterStatus));
  }

  // Filter Search
  if (appState.searchQuery) {
    const q = appState.searchQuery.toLowerCase();
    filtered = filtered.filter(b => 
      b.nama_balita.toLowerCase().includes(q) || 
      (b.nama_ibu && b.nama_ibu.toLowerCase().includes(q))
    );
  }

  tbody.innerHTML = "";

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2rem; color: var(--teks-redup);">Tidak ada data balita yang sesuai filter.</td></tr>`;
    return;
  }

  filtered.forEach((b, idx) => {
    const tr = document.createElement("tr");

    let statusClass = "Normal";
    if (b.status_risiko.includes("Waspada")) statusClass = "Waspada";
    if (b.status_risiko.includes("Tinggi") || b.status_risiko.includes("Stunted")) statusClass = "Stunted";

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${b.nama_balita}</strong><br><small style="color:var(--teks-redup)">Ibu: ${b.nama_ibu || '-'}</small></td>
      <td>${b.rt_wilayah}</td>
      <td>${b.usia_bulan} Bln (${b.gender})</td>
      <td>${b.tinggi_cm} cm / ${b.berat_kg} kg</td>
      <td>${b.lila_cm} cm</td>
      <td><span style="font-weight:600; color:${b.zscore_tb < -2 ? 'var(--stunted)' : (b.zscore_tb < -1.5 ? 'var(--waspada)' : 'var(--normal)')}">${b.zscore_tb > 0 ? '+' : ''}${b.zscore_tb} SD</span></td>
      <td><span class="badge-tabel ${statusClass}">${b.status_risiko}</span></td>
      <td>
        <button class="tombol bahaya" style="padding:0.25rem 0.55rem; font-size:0.75rem;" onclick="hapusBalita(${b.id})">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Update KPI Cards di Dashboard
function updateKPICards() {
  const total = appState.balitaData.length;
  const normal = appState.balitaData.filter(b => b.status_risiko.includes("Normal")).length;
  const waspada = appState.balitaData.filter(b => b.status_risiko.includes("Waspada")).length;
  const stunted = appState.balitaData.filter(b => b.status_risiko.includes("Tinggi") || b.status_risiko.includes("Stunted")).length;
  const prevalensi = total > 0 ? Math.round(((waspada + stunted) / total) * 100) : 0;

  const kpiTot = document.getElementById("kpi-total-balita");
  const kpiNorm = document.getElementById("kpi-normal");
  const kpiWasp = document.getElementById("kpi-waspada");
  const kpiStunt = document.getElementById("kpi-stunted");
  const kpiPrev = document.getElementById("kpi-prevalensi");

  if (kpiTot) kpiTot.innerText = total;
  if (kpiNorm) kpiNorm.innerText = normal;
  if (kpiWasp) kpiWasp.innerText = waspada;
  if (kpiStunt) kpiStunt.innerText = stunted;
  if (kpiPrev) kpiPrev.innerText = `${prevalensi}%`;
}

// Render Analisis Wilayah (Per RT 01 s/d RT 04)
function renderAnalisisWilayah() {
  const container = document.getElementById("wadah-chart-rt");
  if (!container) return;

  const rts = ["RT 01", "RT 02", "RT 03", "RT 04"];
  container.innerHTML = "";

  rts.forEach(rt => {
    const totalRT = appState.balitaData.filter(b => b.rt_wilayah === rt).length;
    const stuntedRT = appState.balitaData.filter(b => b.rt_wilayah === rt && (b.status_risiko.includes("Tinggi") || b.status_risiko.includes("Stunted"))).length;
    const waspadaRT = appState.balitaData.filter(b => b.rt_wilayah === rt && b.status_risiko.includes("Waspada")).length;
    const normalRT = totalRT - stuntedRT - waspadaRT;

    const pctRisk = totalRT > 0 ? Math.round(((stuntedRT + waspadaRT) / totalRT) * 100) : 0;

    const row = document.createElement("div");
    row.style.marginBottom = "1.2rem";
    row.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:0.35rem; font-size:0.88rem;">
        <strong>${rt} Padukuhan Tepus 3</strong>
        <span>${totalRT} Balita (${pctRisk}% Berisiko: ${stuntedRT} Stunted, ${waspadaRT} Waspada)</span>
      </div>
      <div style="height:14px; background:#e2e8f0; border-radius:99px; overflow:hidden; display:flex;">
        <div style="width:${totalRT > 0 ? (normalRT/totalRT*100) : 100}%; background:var(--normal);" title="Normal: ${normalRT}"></div>
        <div style="width:${totalRT > 0 ? (waspadaRT/totalRT*100) : 0}%; background:var(--waspada);" title="Waspada: ${waspadaRT}"></div>
        <div style="width:${totalRT > 0 ? (stuntedRT/totalRT*100) : 0}%; background:var(--stunted);" title="Stunted: ${stuntedRT}"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// Ekspor CSV
function eksporCSV() {
  if (appState.isBackendConnected) {
    window.location.href = `${API_BASE_URL}/api/export-csv`;
    return;
  }

  // Ekspor CSV Lokal
  const headers = ["ID", "Nama Balita", "Nama Ibu", "RT", "Usia (Bulan)", "Gender", "TB (cm)", "BB (kg)", "LiLA (cm)", "Z-Score TB/U", "Status Risiko", "Tanggal Periksa"];
  const rows = appState.balitaData.map(b => [
    b.id, `"${b.nama_balita}"`, `"${b.nama_ibu || '-'}"`, b.rt_wilayah, b.usia_bulan, b.gender, b.tinggi_cm, b.berat_kg, b.lila_cm, b.zscore_tb, `"${b.status_risiko}"`, b.tanggal_periksa
  ]);

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Rekap_Balita_Posyandu_Tepus3.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Cek Status Koneksi Backend
async function cekKoneksiBackend() {
  const badgeKoneksi = document.getElementById("badge-koneksi-api");
  try {
    const res = await fetch(API_BASE_URL + "/", { method: "GET" });
    if (res.ok) {
      appState.isBackendConnected = true;
      if (badgeKoneksi) {
        badgeKoneksi.innerHTML = `
          <span class="dot-status" style="background:#10b981;"></span>
          <span><strong>FastAPI Backend Aktif</strong> &bull; Decision Tree & Artefak Model Terhubung</span>
        `;
        badgeKoneksi.style.background = "#ffffff";
        badgeKoneksi.style.color = "#0f172a";
        badgeKoneksi.style.borderColor = "var(--border-light)";
      }
      // Ambil data terbaru dari backend
      const dataRes = await fetch(API_BASE_URL + "/api/balita");
      if (dataRes.ok) {
        appState.balitaData = await dataRes.json();
        renderTabelBalita();
        updateKPICards();
      }
      return;
    }
  } catch (e) {
    // Backend offline
  }

  appState.isBackendConnected = false;
  if (badgeKoneksi) {
    badgeKoneksi.innerHTML = `
      <span class="dot-status" style="background:#0284c7;"></span>
      <span><strong>Mode Mandiri (Stand-Alone Offline)</strong> &bull; Mesin Antropometri WHO Anthro Aktif</span>
    `;
    badgeKoneksi.style.background = "#ffffff";
    badgeKoneksi.style.color = "#0f172a";
    badgeKoneksi.style.borderColor = "var(--border-light)";
  }
}

// Inisialisasi saat Halaman Dimuat
document.addEventListener("DOMContentLoaded", () => {
  cekKoneksiBackend();
  eksekusiPrediksiLive();
  renderTabelBalita();
  updateKPICards();

  // Dynamic Header Elevation on Scroll (Relasi Consulting Style)
  const mainHeader = document.getElementById("main-header");
  window.addEventListener("scroll", () => {
    if (mainHeader) {
      if (window.scrollY > 15) {
        mainHeader.classList.add("scrolled");
      } else {
        mainHeader.classList.remove("scrolled");
      }
    }
  }, { passive: true });

  // Event Listeners Form Inputs
  const liveInputs = [
    "in-tinggi", "in-berat", "in-lila", "in-air", "in-bblr", "in-asi", "in-jamban"
  ];
  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", eksekusiPrediksiLive);
  });

  // Filter RT & Status Listeners
  const selRT = document.getElementById("filter-rt");
  if (selRT) {
    selRT.addEventListener("change", (e) => {
      appState.filterRT = e.target.value;
      renderTabelBalita();
    });
  }

  const selStatus = document.getElementById("filter-status");
  if (selStatus) {
    selStatus.addEventListener("change", (e) => {
      appState.filterStatus = e.target.value;
      renderTabelBalita();
    });
  }

  const inCari = document.getElementById("in-cari-balita");
  if (inCari) {
    inCari.addEventListener("input", (e) => {
      appState.searchQuery = e.target.value;
      renderTabelBalita();
    });
  }
});
