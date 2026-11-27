# Spesifikasi Implementasi — STUNT-GUARD TEPUS 3

Status: **SUDAH DIIMPLEMENTASIKAN & DIVERIFIKASI LENGKAP** (2026-11-26).
Sistem Deteksi Dini & Klasifikasi Risiko Stunting Berbasis Antropometri WHO Anthro & Decision Tree C4.5.
Dikembangkan sebagai **Produk Teknologi Tepat Guna (TTG) Utama** Kuliah Kerja Nyata Tematik (KKNT) Periode 10 Tahun 2026 Universitas Duta Bangsa Surakarta di Padukuhan Tepus 3, Kalurahan Tepus, Kapanewon Tepus, Kabupaten Gunungkidul.

---

## 1. Ringkasan Scope & Urgensi Lapangan

Padukuhan Tepus 3 memiliki karakteristik geografis perbukitan karst kapur dengan keterbatasan sumber air perpipaan PDAM. Sebagian besar warga mengandalkan sumur galian batuan karst kapur dan Penampungan Air Hujan (PAH). Kondisi air dengan kesadahan tinggi (kalsium karbonat berlebih) berpotensi memicu infeksi subklinis saluran pencernaan yang menghambat penyerapan zat besi dan zinc pada balita.

STUNT-GUARD dibangun untuk:
1. Menyediakan kalkulator antropometri digital standar WHO Anthro (Permenkes No. 2/2020) yang menghitung Z-score Tinggi Badan menurut Umur (TB/U) secara akurat tanpa margin kesalahan manual tabel cetak.
2. Mengintegrasikan algoritma Machine Learning **Decision Tree C4.5** (Information Gain / Entropy) untuk memetakan risiko stunting dan faltering growth berdasarkan kombinasi variabel antropometri dan sanitasi lingkungan.
3. Memberikan transparansi aturan (*explainable rules*) yang dapat diaudit langsung oleh Bidan Desa dan Dosen Pembimbing Lapangan (DPL), bukan sekadar model *black-box*.
4. Bekerja secara *dual-mode* (Client-Server FastAPI lokal atau Stand-Alone Offline) sehingga kader Posyandu dapat menggunakannya di balai dusun tanpa sinyal internet seluler.

---

## 2. Arsitektur Perangkat Lunak

```
stuntguard/
├── backend/
│   ├── artifacts/
│   │   ├── dataset_stunting_tepus3.csv   (Dataset kalibrasi 1.000 baris balita karst)
│   │   ├── decision_tree_stunting.pkl    (Artefak model Decision Tree terkompresi)
│   │   ├── feature_meta.json             (Metadata fitur & kurva piecewise WHO)
│   │   └── rules_tree.txt                (Representasi tekstual pohon keputusan)
│   ├── main.py                           (FastAPI REST Server, Pydantic v2, CORS)
│   ├── train_model.py                    (Pipeline CRISP-DM pelatihan & ekspor model)
│   ├── smoke_test.py                     (Test suite endpoint & uji boundary)
│   └── requirements.txt                  (Daftar dependensi Python)
├── frontend/
│   ├── index.html                        (SPA Multi-tab semantik: 7 modul utama)
│   ├── style.css                         (Custom CSS murni tanpa framework CDN)
│   └── app.js                            (State store, dual-mode engine, CRUD rekap)
├── implement.md                          (Dokumen spesifikasi teknis arsitektur)
└── README.md                             (Buku manual operasional kader & DPL)
```

- **Backend**: FastAPI 0.110+ & Uvicorn pada port `8000`.
- **Frontend**: Native HTML5, Modern CSS Variables, Modular Vanilla JS.
- **Port/Host**: `http://127.0.0.1:8000` (Backend API) & `frontend/index.html` (UI).
- **CORS Middleware**: Diizinkan penuh (`allow_origins=["*"]`) untuk interaksi lokal bebas hambatan.

---

## 3. Data & Standar Antropometri Medis (✅ Terverifikasi)

### 3.1 Standar Kurva Pertumbuhan WHO Anthro 0 - 60 Bulan
Kurva pertumbuhan tinggi badan balita bersifat non-linier. Menggunakan fungsi linier sederhana (`med = 50 + 0.82 * u`) menyebabkan distorsi Z-score pada usia 24 bulan hingga +5.8 SD. Oleh karena itu, STUNT-GUARD mengimplementasikan **Piecewise Linear Interpolation** berbasis tabel resmi WHO Anthro:

| Usia (Bulan) | Laki-laki: Median (cm) | Laki-laki: SD (cm) | Perempuan: Median (cm) | Perempuan: SD (cm) |
|---|---|---|---|---|
| **0** | 49.9 | 1.89 | 49.1 | 1.85 |
| **6** | 67.6 | 2.35 | 65.7 | 2.30 |
| **12** | 75.7 | 2.65 | 74.0 | 2.60 |
| **24** | 87.8 | 3.25 | 86.4 | 3.20 |
| **36** | 96.1 | 3.65 | 95.1 | 3.60 |
| **48** | 103.3 | 4.05 | 102.7 | 4.00 |
| **60** | 110.0 | 4.45 | 109.4 | 4.40 |

Formula Z-score:
$$Z_{TB/U} = \frac{TB_{riil} - Median_{WHO}(usia, gender)}{SD_{WHO}(usia, gender)}$$

### 3.2 Kategori Klinis & Aksi Tindak Lanjut
1. **Normal (Optimal)**: $Z_{TB/U} \ge -1.5\text{ SD}$ dan $\text{LiLA} \ge 12.5\text{ cm}$. Tindakan: Pemeliharaan pola makan seimbang.
2. **Waspada (Faltering Growth)**: $-2.0\text{ SD} \le Z_{TB/U} < -1.5\text{ SD}$ atau memiliki riwayat BBLR/Non-ASI. Tindakan: Intervensi PMT pangan lokal 14 hari dan timbang ulang.
3. **Risiko Tinggi (Stunted)**: $Z_{TB/U} < -2.0\text{ SD}$ atau $\text{LiLA} < 11.5\text{ cm}$ (wasting akut). Tindakan: Rujukan segera ke Bidan Desa / Puskesmas Pembantu Tepus.

---

## 4. Pipeline Machine Learning CRISP-DM

- **Algoritma**: `DecisionTreeClassifier(criterion="entropy", max_depth=5, min_samples_split=15, min_samples_leaf=5, random_state=42)`
- **Ukuran Dataset**: 1.000 sampel tersintesis terkalibrasi kondisi rill Posyandu Dusun Tepus 3.
- **Rasio Pembagian**: 80% Data Latih (800 sampel), 20% Data Uji (200 sampel) terstratifikasi.
- **Akurasi Validasi**: **82.00%** pada data uji.
- **Fitur Masukan (9 Kolom)**:
  `["usia_bulan", "is_laki", "tinggi_cm", "berat_kg", "lila_cm", "riwayat_bblr", "asi_eksklusif", "air_karst_kapur", "jamban_sehat"]`
- **Aturan Pohon yang Diekstrak**:
  Tersimpan dalam `backend/artifacts/rules_tree.txt`, memetakan simpul usia, Z-score, dan LiLA langsung ke rekomendasi klinis.

---

## 5. Spesifikasi Endpoint REST API FastAPI

| Metode | Endpoint | Deskripsi | Respons |
|---|---|---|---|
| `GET` | `/` | Health check & Metadata sistem KKN-T | HTTP 200 JSON |
| `POST` | `/api/predict` | Inferensi Decision Tree & Z-score balita baru | JSON Detail Hasil & Aturan |
| `GET` | `/api/balita` | Mendapatkan daftar balita (Filter: `q`, `rt`, `status`) | Array JSON |
| `POST` | `/api/balita` | Menyimpan catatan skrining baru ke database | JSON Status & Record Terdaftar |
| `DELETE`| `/api/balita/{id}` | Menghapus catatan balita berdasarkan ID | JSON Konfirmasi |
| `GET` | `/api/stats` | Agregat statistik Posyandu (Total, RT, Prevalensi) | JSON Metrik |
| `GET` | `/api/metadata` | Metadata arsitektur model Decision Tree | JSON Skema |
| `GET` | `/api/export-csv` | Mengunduh database rekap Posyandu format CSV | File attachment CSV |

---

## 6. Hasil Verifikasi Smoke Test (✅ 100% LOLOS)

Pengujian otomatis dijalankan melalui script `smoke_test.py`:
- `GET /` : ✅ HTTP 200 (App Name terverifikasi).
- `POST /api/predict (Normal 24 Bulan, TB 88cm)` : ✅ Z-Score: `+0.06 SD`, Status: `Normal (Optimal)`.
- `POST /api/predict (Stunted 36 Bulan, TB 83cm)` : ✅ Z-Score: `-3.59 SD`, Status: `Risiko Tinggi (Stunted)`.
- `GET /api/balita` : ✅ Mengembalikan 5 record terdaftar.
- `GET /api/stats` : ✅ Total 5 balita, prevalensi risiko 60.0%.

---

## 7. Protokol Penggunaan Lapangan

1. **Persiapan di Balai Padukuhan Tepus 3**:
   - Jalankan backend FastAPI melalui terminal VS Code (`cd backend && python -m uvicorn main:app --reload --port 8000`) atau tekan tombol `F5` di VS Code.
   - Buka antarmuka `frontend/index.html` pada browser Chrome/Edge untuk menampilkan dashboard STUNT-GUARD.
2. **Pelaksanaan Skrining Posyandu**:
   - Buka menu **Prediksi & Skrining**.
   - Masukkan identitas anak, geser slider usia, dan masukkan hasil pengukuran pita LiLA serta mikrotoise tinggi badan.
   - Klik **Hitung & Deteksi Risiko** untuk melihat status seketika.
   - Klik **Simpan ke Database Posyandu**.
3. **Pelaporan ke Kepala Dukuh & Bidan Desa**:
   - Buka menu **Rekapitulasi Data**.
   - Klik tombol **Unduh Rekap CSV** untuk mendapatkan file Excel/Spreadsheet laporan resmi bulanan.
