# STUNT-GUARD TEPUS 3 🩺
### Sistem Deteksi Dini & Antropometri Balita Berbasis Decision Tree C4.5 & WHO Anthro

**Produk Teknologi Tepat Guna (TTG) Utama**  
Kuliah Kerja Nyata Tematik (KKNT) Periode 10 Tahun 2026 Universitas Duta Bangsa Surakarta  
**Lokasi**: Posyandu Padukuhan Tepus 3, Kalurahan Tepus, Kapanewon Tepus, Kabupaten Gunungkidul, D.I. Yogyakarta  
**Dosen Pembimbing Lapangan (DPL)**: Aprilisa Arum Sari, S.T., M.Kom.  
**Tim Pengembang**: Kelompok 39 Tim A (Ahmadi Adnan, David Vicky Irwansyah, Renita R., Fatikhah, Nofa, Aditia, Muhammad Zaidan)

---

## 🌟 Keunggulan Sistem

1. **Akurasi Antropometri Baku Kemenkes RI**: Menggunakan piecewise linear interpolation standar kurva baku WHO Anthro & Permenkes No. 2 Tahun 2020 untuk Z-score Tinggi Badan menurut Umur ($Z_{TB/U}$) dan pita Lingkar Lengan Atas (LiLA).
2. **Explainable AI (Decision Tree C4.5)**: Bebas dari bias "black-box". Setiap rekomendasi yang dihasilkan memiliki jejak aturan keputusan (*decision rule*) yang transparan dan dapat diverifikasi langsung oleh Bidan Desa.
3. **Kontekstual Wilayah Karst**: Mengakomodasi faktor lingkungan khas Gunungkidul, seperti sanitasi sumur galian batuan karst kapur dan Penampungan Air Hujan (PAH).
4. **Dual-Mode Execution**:
   - **Mode Full-Stack API**: FastAPI backend + REST endpoints + SQLite/in-memory data store.
   - **Mode Mandiri (Stand-Alone Offline)**: Tetap dapat dijalankan secara langsung membuka file `frontend/index.html` di browser tanpa memerlukan server aktif maupun koneksi internet di balai dusun.

---

## 🚀 Cara Menjalankan Aplikasi

### Metode 1: Lewat VS Code (1-Klik Debugger F5)
1. Buka folder proyek di VS Code (`File` -> `Open Folder...`).
2. Masuk ke panel **Run and Debug** (`Ctrl + Shift + D`).
3. Pilih profil: **`StuntGuard: Jalankan Backend FastAPI (Port 8000)`** lalu tekan **`F5`**.
4. Buka file `frontend/index.html` di browser Anda (atau klik kanan -> *Open with Live Server*).

### Metode 2: Lewat Terminal Terintegrasi VS Code / CLI
1. Jalankan Backend FastAPI:
   ```bash
   cd backend
   python -m uvicorn main:app --reload --port 8000
   ```
2. Buka Frontend di Browser:
   Buka file `frontend/index.html` langsung di browser, atau akses dokumentasi interaktif Swagger API di `http://localhost:8000/docs`.

---

## 📂 Struktur Direktori Proyek

```
stuntguard/
├── .vscode/
│   ├── launch.json                       # Profil debugger & run VS Code (F5)
│   └── tasks.json                        # Build task terintegrasi VS Code
├── backend/
│   ├── artifacts/
│   │   ├── dataset_stunting_tepus3.csv   # Dataset 1.000 sampel balita karst
│   │   ├── decision_tree_stunting.pkl    # Artefak model terlatih
│   │   ├── feature_meta.json             # Metadata kurva WHO & fitur
│   │   └── rules_tree.txt                # Pohon keputusan teks terbaca
│   ├── main.py                           # REST API FastAPI (Port 8000)
│   ├── train_model.py                    # Script pelatihan Decision Tree
│   ├── smoke_test.py                     # Smoke test otomatis endpoint
│   └── requirements.txt                  # Dependensi Python
├── frontend/
│   ├── index.html                        # Multi-tab SPA 7 modul
│   ├── style.css                         # Custom CSS murni (Emerald / Slate)
│   └── app.js                            # Controller, fallback engine WHO, CRUD
├── implement.md                          # Dokumen spesifikasi teknis lengkap
└── README.md                             # Panduan penggunaan proyek
```

---

## 🧪 Verifikasi & Uji Klinis Smoke Test

Jalankan test suite backend untuk memastikan zero-bug:
```bash
cd backend
python smoke_test.py
```
Hasil uji:
- `GET /` : 200 OK
- `POST /api/predict (Normal)` : Z-Score `+0.06 SD` (Normal)
- `POST /api/predict (Stunted)` : Z-Score `-3.59 SD` (Risiko Tinggi Stunting)
- `GET /api/balita` : Sukses
- `GET /api/stats` : Sukses

---

## 📜 Hak Cipta & Lisensi
Dikembangkan untuk pengabdian masyarakat Posyandu Padukuhan Tepus 3 dan pemenuhan luaran Produk Teknologi Tepat Guna (TTG) KKNT UDB 2026.  
Fakultas Ilmu Komputer, Universitas Duta Bangsa Surakarta.
