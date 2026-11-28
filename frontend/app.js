/**
 * STUNT-GUARD TEPUS 3 - Frontend Application Logic
 * Layanan Konsultasi & Skrining Balita Posyandu Padukuhan Tepus 3
 * Standar: Permenkes No. 2/2020 & WHO Child Growth Standards
 * Kelompok 39 Tim 1 KKNT UDB 2026
 */

// ==========================================
// INISIALISASI LENIS SMOOTH SCROLL (INERTIA MOMENTUM)
// Terinspirasi dari dinamika visual Relasi Consulting
// ==========================================
let lenisInstance = null;
if (typeof Lenis !== "undefined") {
  lenisInstance = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Exponential decay curve
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1.05,
    touchMultiplier: 1.8,
    infinite: false,
  });

  function raf(time) {
    lenisInstance.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  window.lenis = lenisInstance;
}

// Auto-detect API Base URL:
// - Hosting Vercel / server web: gunakan relative path ""
// - Localhost file:/// fallback: "http://localhost:8000"
const API_BASE_URL = window.location.protocol.startsWith("http") ? "" : "http://localhost:8000";

// WHO Piecewise Reference Standard (WHO Anthro 2006)
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

// State Pangkalan Data Posyandu (Dimulai Bersih / Tanpa Data Dummy)
let appState = {
  isBackendConnected: false,
  balitaData: [],
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

// Fallback Mesin Inferensi Standar Baku WHO Anthro
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
  let interpretasi = "Pertumbuhan tinggi badan dan lingkar lengan atas balita berada pada rentang ideal sesuai kurva baku WHO Anthro. Anak menunjukkan pertumbuhan fisik proporsional sesuai usianya tanpa indikasi faltering growth.";
  const rekomendasi = [];

  if (z_tb < -2.0 || (z_tb < -1.8 && lila < 11.5)) {
    status_risiko = "Risiko Tinggi (Stunted)";
    risk_score = 0.88;
    rule = "RULE-03: IF (Z_TB < -2.0) OR (Z_TB < -1.8 AND LiLA < 11.5cm) THEN 'Risiko Tinggi'";
    interpretasi = "Pertumbuhan fisik balita berada di bawah ambang batas standar baku WHO (Z-score < -2.0 SD) atau terindikasi malnutrisi akut berdasarkan lingkar lengan atas. Balita memerlukan evaluasi klinis segera oleh Bidan Desa / Puskesmas dan intervensi gizi terpadu.";
    rekomendasi.push("⚠️ Rujukan Segera: Laporkan dan rujuk balita ke Bidan Desa / Puskesmas Pembantu Tepus.");
    rekomendasi.push("🥩 Terapi Nutrisi: Asupan protein hewani harian (1 butir telur/hari, ikan laut lumat Tepus).");
    rekomendasi.push("💧 Sanitasi Air: Pastikan air minum balita bebas endapan kapur dan direbus mendidih.");
  } else if (z_tb < -1.5 || (z_tb < -1.2 && (bblr || !asi))) {
    status_risiko = "Waspada (Faltering Growth)";
    risk_score = 0.52;
    rule = "RULE-02: IF (Z_TB < -1.5) OR (Z_TB < -1.2 AND (BBLR == True OR ASI == False)) THEN 'Waspada'";
    interpretasi = "Balita menunjukkan perlambatan laju pertumbuhan (growth faltering) atau mendekati batas defisit nutrisi. Diperlukan intervensi makanan tambahan (PMT) kaya protein lokal serta pemantauan kenaikan berat/tinggi badan berkala 14 hari.";
    rekomendasi.push("🟡 Intervensi PMT Lokal: Berikan PMT fortifikasi olahan singkong & daun kelor atau nugget ikan.");
    rekomendasi.push("⚖️ Pemantauan Ulang: Timbang ulang berat dan tinggi badan dalam 14 hari di Posyandu.");
  } else {
    rekomendasi.push("✅ Pertahankan Pola Asuh: Tumbuh kembang balita sesuai kurva standar baku WHO Anthro.");
    rekomendasi.push("🥦 Diversifikasi Pangan: Lanjutkan pola makan gizi seimbang dengan prinsip Isi Piringku.");
  }

  return {
    zscore_tb: z_tb,
    kategori_zscore: kat_tb,
    status_lila: kat_lila,
    status_risiko: status_risiko,
    risk_score: risk_score,
    decision_rule: rule,
    interpretasi_klinis: interpretasi,
    rekomendasi: rekomendasi
  };
}

// Navigasi Tab Layanan
function gantiTab(tabId) {
  document.querySelectorAll(".halaman-tab").forEach(el => el.classList.remove("aktif"));
  document.querySelectorAll(".nav-link").forEach(btn => btn.classList.remove("aktif"));

  const targetTab = document.getElementById("tab-" + tabId);
  const targetBtn = document.getElementById("btn-" + tabId);

  if (targetTab) targetTab.classList.add("aktif");
  if (targetBtn) {
    targetBtn.classList.add("aktif");
    targetBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  if (tabId === "rekap") {
    renderTabelBalita();
    updateKPICards();
    renderAnalisisWilayah();
  }

  if (window.lenis) {
    window.lenis.scrollTo(0, { duration: 0.65 });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// State Flag Sertifikat
let isCertificateRevealed = false;

// Pilih Gender Balita
let selectedGender = "L";
function setGender(g) {
  selectedGender = g;
  const btnL = document.getElementById("btn-gender-l");
  const btnP = document.getElementById("btn-gender-p");
  if (btnL) btnL.classList.toggle("aktif", g === "L");
  if (btnP) btnP.classList.toggle("aktif", g === "P");
  if (isCertificateRevealed) {
    eksekusiPrediksiLive();
  }
}

// Sinkronisasi Usia Slider & Input
function syncUsia(val) {
  const inUsia = document.getElementById("in-usia");
  const rngUsia = document.getElementById("range-usia");
  const lblUsia = document.getElementById("label-usia-bln");

  if (inUsia) inUsia.value = val;
  if (rngUsia) rngUsia.value = val;
  if (lblUsia) lblUsia.innerText = val + " Bulan";
  if (isCertificateRevealed) {
    eksekusiPrediksiLive();
  }
}

// ================= SISTEM NOTIFIKASI TOAST PROFESIONAL =================
function tampilkanToast(judul, pesan, tipe = "sukses") {
  const container = document.getElementById("wadah-toast");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast-item ${tipe}`;

  let ikonSVG = "";
  if (tipe === "sukses") {
    ikonSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (tipe === "peringatan") {
    ikonSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    ikonSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }

  toast.innerHTML = `
    <div class="toast-ikon-lingkar">${ikonSVG}</div>
    <div class="toast-teks-wrap">
      <div class="toast-judul">${judul}</div>
      <div class="toast-pesan">${pesan}</div>
    </div>
    <button class="toast-tutup-btn" onclick="this.parentElement.remove()" title="Tutup">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("keluar");
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 250);
  }, 4000);
}

// ================= MODAL KONFIRMASI HAPUS PROFESIONAL =================
let pendingHapusId = null;
let pendingHapusNama = "";

function bukaModalKonfirmasiHapus(id, nama) {
  pendingHapusId = id;
  pendingHapusNama = nama;
  const modal = document.getElementById("modal-konfirmasi");
  const desc = document.getElementById("modal-hapus-deskripsi");
  const btn = document.getElementById("btn-eksekusi-hapus");

  if (desc) {
    desc.innerText = `Data balita ${nama} akan dihapus permanen dari rekam medis Posyandu Tepus 3. Tindakan ini tidak dapat dibatalkan.`;
  }
  if (btn) {
    btn.onclick = eksekusiHapusDariModal;
  }
  if (modal) {
    modal.classList.add("aktif");
  }
}

function tutupModalHapus() {
  const modal = document.getElementById("modal-konfirmasi");
  if (modal) modal.classList.remove("aktif");
  pendingHapusId = null;
  pendingHapusNama = "";
}

async function eksekusiHapusDariModal() {
  const id = pendingHapusId;
  const nama = pendingHapusNama;
  tutupModalHapus();

  if (appState.isBackendConnected && id) {
    try {
      await fetch(`${API_BASE_URL}/api/balita/${id}`, { method: "DELETE" });
    } catch (err) {
      console.warn("Gagal menghapus dari backend:", err);
    }
  }

  appState.balitaData = appState.balitaData.filter(b => b.id !== id);
  renderTabelBalita();
  updateKPICards();
  renderAnalisisWilayah();

  tampilkanToast("Data Berhasil Dihapus", `Data balita ${nama || 'terpilih'} telah dihapus dari rekam medis.`, "sukses");
}

function hapusBalita(id) {
  const b = appState.balitaData.find(item => item.id === id);
  const nama = b ? b.nama_balita : "Balita";
  bukaModalKonfirmasiHapus(id, nama);
}

// Tombol Periksa Status Gizi Diklik (Menerbitkan Lembar Hasil)
async function tombolPeriksaDiklik() {
  const elNama = document.getElementById("in-nama-balita");
  const nama = elNama ? elNama.value.trim() : "";

  if (!nama) {
    tampilkanToast("Nama Balita Belum Diisi", "Silakan masukkan nama lengkap balita sebelum memeriksa status gizi.", "peringatan");
    if (elNama) elNama.focus();
    return;
  }

  isCertificateRevealed = true;
  const placeholder = document.getElementById("placeholder-skrining");
  const cert = document.getElementById("lembar-laporan-cetak");

  if (placeholder) placeholder.style.display = "none";
  if (cert) {
    cert.style.display = "block";
    cert.classList.remove("muncul");
    void cert.offsetWidth;
    cert.classList.add("muncul");
  }

  await eksekusiPrediksiLive();

  tampilkanToast("Evaluasi Klinis Terbit", `Lembar hasil evaluasi klinis balita ${nama} berhasil diterbitkan.`, "sukses");

  if (window.innerWidth <= 1024 && cert) {
    if (window.lenis) {
      window.lenis.scrollTo(cert, { offset: -80, duration: 0.85 });
    } else {
      cert.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

// Eksekusi Prediksi & Skrining Real-Time
async function eksekusiPrediksiLive() {
  const elNama = document.getElementById("in-nama-balita");
  const elIbu = document.getElementById("in-nama-ibu");
  const elRT = document.getElementById("in-rt");
  const elUsia = document.getElementById("in-usia");
  const elTinggi = document.getElementById("in-tinggi");
  const elBerat = document.getElementById("in-berat");
  const elLila = document.getElementById("in-lila");
  const elAir = document.getElementById("in-air");
  const elBblr = document.getElementById("in-bblr");
  const elAsi = document.getElementById("in-asi");
  const elJamban = document.getElementById("in-jamban");

  if (!elUsia || !elTinggi || !elBerat || !elLila) return null;

  const nama = elNama ? (elNama.value.trim() || "Balita Posyandu") : "Balita Posyandu";
  const ibu = elIbu ? (elIbu.value.trim() || "-") : "-";
  const rt = elRT ? elRT.value : "RT 02";
  const usia = parseInt(elUsia.value, 10) || 0;
  const tinggi = parseFloat(elTinggi.value) || 0;
  const berat = parseFloat(elBerat.value) || 0;
  const lila = parseFloat(elLila.value) || 0;
  const sumberAir = elAir ? elAir.value : "Sumur Karst Kapur";
  const bblr = elBblr ? elBblr.checked : false;
  const asi = elAsi ? elAsi.checked : true;
  const jamban = elJamban ? elJamban.checked : true;

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
      console.warn("Backend API tidak merespons, beralih ke Fallback WHO Engine:", err);
    }
  }

  if (!resData) {
    const fb = hitungWHOFallback(usia, selectedGender, tinggi, lila, bblr, asi, sumberAir === "Sumur Karst Kapur");
    resData = {
      ...payload,
      ...fb
    };
  } else {
    // Pastikan identitas nama balita & ibu selalu terjaga penuh
    resData.nama_balita = nama;
    resData.nama_ibu = ibu;
    resData.rt_wilayah = rt;
    resData.gender = selectedGender;
    resData.usia_bulan = usia;
    resData.tinggi_cm = tinggi;
    resData.berat_kg = berat;
    resData.lila_cm = lila;
  }

  // Perbarui UI Lembar Hasil Skrining
  const badgeEl = document.getElementById("badge-hasil-risiko");
  const katRisiko = resData.status_risiko;
  if (badgeEl) {
    badgeEl.innerText = katRisiko;
    badgeEl.className = "badge-status-triage";
    if (katRisiko.includes("Normal")) badgeEl.classList.add("Normal");
    else if (katRisiko.includes("Waspada")) badgeEl.classList.add("Waspada");
    else badgeEl.classList.add("Stunted");
  }

  const elZscore = document.getElementById("res-zscore");
  if (elZscore) elZscore.innerText = `${resData.zscore_tb > 0 ? "+" : ""}${resData.zscore_tb} SD`;

  const elKatTB = document.getElementById("res-kategori-tb");
  if (elKatTB) elKatTB.innerText = resData.kategori_zscore;

  const elLilaStatus = document.getElementById("res-lila-status");
  if (elLilaStatus) elLilaStatus.innerText = resData.status_lila;

  const elRiskScore = document.getElementById("res-risk-score");
  if (elRiskScore) {
    const pct = Math.round(resData.risk_score * 100);
    let label = "Rendah";
    let warna = "var(--normal)";
    if (pct > 70) {
      label = "Tinggi";
      warna = "var(--stunted)";
    } else if (pct > 35) {
      label = "Sedang";
      warna = "var(--waspada)";
    }
    elRiskScore.innerText = `${label} (${pct}%)`;
    elRiskScore.style.color = warna;
  }

  // Interpretasi Klinis Bahasa Medis Manusia yang Menenangkan
  const elInterpretasi = document.getElementById("res-interpretasi");
  if (elInterpretasi) {
    elInterpretasi.innerText = resData.interpretasi_klinis || 
      (katRisiko.includes("Normal") 
        ? "Pertumbuhan tinggi badan dan lingkar lengan atas balita berada pada rentang ideal sesuai kurva baku WHO Anthro. Anak menunjukkan pertumbuhan fisik proporsional sesuai usianya tanpa indikasi faltering growth."
        : (katRisiko.includes("Waspada")
          ? "Balita menunjukkan perlambatan laju pertumbuhan (growth faltering) atau mendekati batas defisit nutrisi. Diperlukan intervensi makanan tambahan (PMT) kaya protein lokal serta pemantauan kenaikan berat/tinggi badan berkala 14 hari."
          : "Pertumbuhan fisik balita berada di bawah ambang batas standar baku WHO (Z-score < -2.0 SD) atau terindikasi malnutrisi akut berdasarkan lingkar lengan atas. Balita memerlukan evaluasi klinis segera oleh Bidan Desa / Puskesmas dan intervensi gizi terpadu."));
  }

  // Rencana Asuhan & Rekomendasi
  const listRekom = document.getElementById("list-rekomendasi");
  if (listRekom && resData.rekomendasi) {
    listRekom.innerHTML = "";
    resData.rekomendasi.forEach(item => {
      const li = document.createElement("li");
      li.innerText = item;
      listRekom.appendChild(li);
    });
  }

  return resData;
}

// Simpan Data Baru ke Rekapitulasi
async function simpanHasilKeRekap() {
  const elNama = document.getElementById("in-nama-balita");
  const elIbu = document.getElementById("in-nama-ibu");
  const nama = elNama ? elNama.value.trim() : "";
  const ibu = elIbu ? (elIbu.value.trim() || "-") : "-";

  if (!nama) {
    tampilkanToast("Nama Balita Kosong", "Silakan masukkan nama lengkap balita sebelum menyimpan data ke rekam medis.", "peringatan");
    if (elNama) elNama.focus();
    return;
  }

  // Jika sertifikat belum terbit, terbitkan terlebih dahulu
  isCertificateRevealed = true;
  const placeholder = document.getElementById("placeholder-skrining");
  const cert = document.getElementById("lembar-laporan-cetak");
  if (placeholder) placeholder.style.display = "none";
  if (cert) {
    cert.style.display = "block";
    cert.classList.add("muncul");
  }

  const currentResult = await eksekusiPrediksiLive();
  currentResult.nama_balita = nama;
  currentResult.nama_ibu = ibu;

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
        tampilkanToast("Tersimpan ke Rekam Medis", `Data balita ${nama} (Ibu: ${ibu}) berhasil disimpan ke Rekam Medis Posyandu Tepus 3. Formulir telah di-reset siap untuk balita berikutnya.`, "sukses");
        updateKPICards();
        resetFormSkrining();
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
    nama_balita: nama,
    nama_ibu: ibu,
    tanggal_periksa: new Date().toISOString().split("T")[0]
  };
  appState.balitaData.unshift(localRecord);
  tampilkanToast("Tersimpan ke Rekapitulasi", `Data balita ${nama} (Ibu: ${ibu}) berhasil disimpan ke rekam medis lokal. Formulir telah di-reset siap untuk balita berikutnya.`, "sukses");
  updateKPICards();
  resetFormSkrining();
}

// Reset Formulir Skrining ke Kondisi Awal Bersih
function resetFormSkrining() {
  const elNama = document.getElementById("in-nama-balita");
  const elIbu = document.getElementById("in-nama-ibu");
  const elRT = document.getElementById("in-rt");
  const elTinggi = document.getElementById("in-tinggi");
  const elBerat = document.getElementById("in-berat");
  const elLila = document.getElementById("in-lila");
  const elAir = document.getElementById("in-air");
  const elBblr = document.getElementById("in-bblr");
  const elAsi = document.getElementById("in-asi");
  const elJamban = document.getElementById("in-jamban");
  const placeholder = document.getElementById("placeholder-skrining");
  const cert = document.getElementById("lembar-laporan-cetak");

  // Kosongkan identitas
  if (elNama) elNama.value = "";
  if (elIbu) elIbu.value = "";
  if (elRT) elRT.value = "RT 02";

  // Reset gender ke default Laki-laki
  setGender("L");

  // Reset usia ke 24 bulan
  syncUsia(24);

  // Reset nilai antropometri ke baseline standar
  if (elTinggi) elTinggi.value = "88.0";
  if (elBerat) elBerat.value = "12.0";
  if (elLila) elLila.value = "14.5";
  if (elAir) elAir.value = "PAM Desa";

  // Reset faktor sanitasi & pola asuh
  if (elBblr) elBblr.checked = false;
  if (elAsi) elAsi.checked = true;
  if (elJamban) elJamban.checked = true;

  // Kembalikan lembar hasil skrining ke mode placeholder
  isCertificateRevealed = false;
  if (cert) {
    cert.style.display = "none";
    cert.classList.remove("muncul");
  }
  if (placeholder) {
    placeholder.style.display = "block";
  }

  // Gulir halus kembali ke awal form & fokus ke input nama balita
  if (window.lenis) {
    window.lenis.scrollTo('#in-nama-balita', { offset: -140, duration: 0.6 });
  } else {
    if (elNama) elNama.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  setTimeout(() => {
    if (elNama) elNama.focus();
  }, 350);
}

// Reset Formulir Skrining secara Manual oleh Kader
function resetFormSkriningManual() {
  resetFormSkrining();
  tampilkanToast("Formulir Direset", "Formulir pengukuran telah dikosongkan dan siap untuk balita berikutnya.", "peringatan");
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
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2.5rem 1rem; color: var(--text-muted); font-size:0.92rem;">Belum ada data pemeriksaan balita.<br><small style="color:var(--text-light); font-size:0.82rem;">Silakan buka menu Layanan Skrining untuk memasukkan data balita baru.</small></td></tr>`;
    return;
  }

  filtered.forEach((b, idx) => {
    const tr = document.createElement("tr");

    let statusClass = "Normal";
    if (b.status_risiko.includes("Waspada")) statusClass = "Waspada";
    if (b.status_risiko.includes("Tinggi") || b.status_risiko.includes("Stunted")) statusClass = "Stunted";

    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><strong>${b.nama_balita}</strong><br><small style="color:var(--text-muted)">Ibu: ${b.nama_ibu || '-'}</small></td>
      <td>${b.rt_wilayah}</td>
      <td>${b.usia_bulan} Bln (${b.gender})</td>
      <td>${b.tinggi_cm} cm / ${b.berat_kg} kg</td>
      <td>${b.lila_cm} cm</td>
      <td><span style="font-weight:700; color:${b.zscore_tb < -2 ? 'var(--stunted)' : (b.zscore_tb < -1.5 ? 'var(--waspada)' : 'var(--normal)')}">${b.zscore_tb > 0 ? '+' : ''}${b.zscore_tb} SD</span></td>
      <td><span class="badge-status-tabel ${statusClass}">${b.status_risiko}</span></td>
      <td style="text-align:center;">
        <button class="tombol-pill bahaya" onclick="hapusBalita(${b.id})">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Update KPI Cards di Modul Data Posyandu
function updateKPICards() {
  const total = appState.balitaData.length;
  const normal = appState.balitaData.filter(b => b.status_risiko.includes("Normal")).length;
  const waspada = appState.balitaData.filter(b => b.status_risiko.includes("Waspada")).length;
  const stunted = appState.balitaData.filter(b => b.status_risiko.includes("Tinggi") || b.status_risiko.includes("Stunted")).length;

  const kpiTot = document.getElementById("kpi-total-balita");
  const kpiNorm = document.getElementById("kpi-normal");
  const kpiWasp = document.getElementById("kpi-waspada");
  const kpiStunt = document.getElementById("kpi-stunted");

  if (kpiTot) kpiTot.innerText = total;
  if (kpiNorm) kpiNorm.innerText = normal;
  if (kpiWasp) kpiWasp.innerText = waspada;
  if (kpiStunt) kpiStunt.innerText = stunted;
}

// Render Analisis Distribusi Balita per RT Padukuhan Tepus 3
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
      <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem; font-size:0.86rem;">
        <strong>${rt} Padukuhan Tepus 3</strong>
        <span>${totalRT} Balita (${pctRisk}% Berisiko: ${stuntedRT} Prioritas, ${waspadaRT} Waspada)</span>
      </div>
      <div style="height:12px; background:#ebdcd4; border-radius:99px; overflow:hidden; display:flex;">
        <div style="width:${totalRT > 0 ? (normalRT/totalRT*100) : 0}%; background:var(--normal);" title="Normal: ${normalRT}"></div>
        <div style="width:${totalRT > 0 ? (waspadaRT/totalRT*100) : 0}%; background:var(--waspada);" title="Waspada: ${waspadaRT}"></div>
        <div style="width:${totalRT > 0 ? (stuntedRT/totalRT*100) : 0}%; background:var(--stunted);" title="Stunted: ${stuntedRT}"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// Ekspor Data Rekapitulasi ke File CSV
function eksporCSV() {
  if (appState.isBackendConnected) {
    window.location.href = `${API_BASE_URL}/api/export-csv`;
    return;
  }

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

// Cetak Lembar Hasil Skrining Klinis (Cetak / Simpan PDF)
function cetakLembarHasil() {
  window.print();
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
          <span class="dot-status-live" style="background:var(--normal);"></span>
          <span><strong>Layanan Posyandu Aktif</strong> &bull; Terhubung Basis Data & Standar Baku WHO Anthro</span>
        `;
      }
      const dataRes = await fetch(API_BASE_URL + "/api/balita");
      if (dataRes.ok) {
        appState.balitaData = await dataRes.json();
        renderTabelBalita();
        updateKPICards();
        renderAnalisisWilayah();
      }
      return;
    }
  } catch (e) {
    // Offline
  }

  appState.isBackendConnected = false;
  if (badgeKoneksi) {
    badgeKoneksi.innerHTML = `
      <span class="dot-status-live" style="background:var(--sekunder);"></span>
      <span><strong>Mode Mandiri (Stand-Alone Offline)</strong> &bull; Mesin Antropometri WHO Anthro Aktif</span>
    `;
  }
}

// Inisialisasi saat Halaman Dimuat
document.addEventListener("DOMContentLoaded", () => {
  cekKoneksiBackend();
  renderTabelBalita();
  updateKPICards();
  renderAnalisisWilayah();

  // Dynamic Header Elevation on Scroll (Relasi Consulting Style)
  const mainHeader = document.getElementById("main-header");
  const handleScrollElevation = (scrollY) => {
    if (mainHeader) {
      if (scrollY > 15) {
        mainHeader.classList.add("scrolled");
      } else {
        mainHeader.classList.remove("scrolled");
      }
    }
  };

  if (window.lenis) {
    window.lenis.on("scroll", (e) => handleScrollElevation(e.scroll));
  } else {
    window.addEventListener("scroll", () => handleScrollElevation(window.scrollY), { passive: true });
  }

  // Event Listeners Form Pengukuran (Live Calculation hanya jika hasil sudah terbit)
  const liveInputs = [
    "in-tinggi", "in-berat", "in-lila", "in-air", "in-bblr", "in-asi", "in-jamban"
  ];
  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", () => {
        if (isCertificateRevealed) {
          eksekusiPrediksiLive();
        }
      });
    }
  });

  // Filter Listeners
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
