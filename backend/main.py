# -*- coding: utf-8 -*-
"""
=============================================================================
STUNT-GUARD TEPUS 3 - RESTful API Backend
Sistem Prediksi Risiko Stunting & Antropometri Balita Berbasis Decision Tree
=============================================================================
Institusi   : Universitas Duta Bangsa Surakarta - Fakultas Ilmu Komputer
Program     : KKNT Periode 10 Tahun 2026 - Kapanewon Tepus, Gunungkidul
Lokasi      : Balai Padukuhan Tepus 3, Kalurahan Tepus
Tim Peneliti: Kelompok 39 Tim 1 (Ahmadi Adnan, David V.I., Salfina E.S., Renita R., Ananda S.M., Denik L.E.S., Happy N.I.)
DPL         : Aprilisa Arum Sari, S.T., M.Kom.
=============================================================================
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import List, Optional, Dict, Any
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Inisialisasi Path Artefak & Database SQLite
import os
import shutil

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)
MODEL_PATH = ARTIFACTS_DIR / "decision_tree_stunting.pkl"
META_PATH = ARTIFACTS_DIR / "feature_meta.json"
FRONTEND_DIR = BASE_DIR.parent / "frontend"

# Deteksi Serverless Vercel: /tmp adalah satu-satunya direktori dengan izin tulis
IS_VERCEL = "VERCEL" in os.environ
if IS_VERCEL:
    TMP_DIR = Path("/tmp")
    DB_PATH = TMP_DIR / "posyandu_tepus3.db"
    SOURCE_DB = ARTIFACTS_DIR / "posyandu_tepus3.db"
    if not DB_PATH.exists() and SOURCE_DB.exists():
        try:
            shutil.copy2(SOURCE_DB, DB_PATH)
        except Exception:
            pass
else:
    DB_PATH = ARTIFACTS_DIR / "posyandu_tepus3.db"

FEATURE_COLS = [
    "usia_bulan", "is_laki", "tinggi_cm", "berat_kg", 
    "lila_cm", "riwayat_bblr", "asi_eksklusif", 
    "air_karst_kapur", "jamban_sehat"
]

# Standar WHO Anthro & Permenkes No. 2 Tahun 2020 (Piecewise Reference)
WHO_AGE_MONTHS = np.array([0, 6, 12, 24, 36, 48, 60], dtype=float)
WHO_BOYS_MEDIAN = np.array([49.9, 67.6, 75.7, 87.8, 96.1, 103.3, 110.0], dtype=float)
WHO_BOYS_SD     = np.array([1.89, 2.35, 2.65, 3.25, 3.65,  4.05,  4.45], dtype=float)
WHO_GIRLS_MEDIAN = np.array([49.1, 65.7, 74.0, 86.4, 95.1, 102.7, 109.4], dtype=float)
WHO_GIRLS_SD     = np.array([1.85, 2.30, 2.60, 3.20, 3.60,  4.00,  4.40], dtype=float)

def get_who_median_sd(usia_bulan: float, gender: str):
    """Kalkulasi Median & SD WHO piecewise interpolation."""
    if gender in ("L", 1, "1"):
        med = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_BOYS_MEDIAN))
        sd = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_BOYS_SD))
    else:
        med = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_GIRLS_MEDIAN))
        sd = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_GIRLS_SD))
    return med, sd

def init_sqlite_db():
    """Inisialisasi tabel SQLite relasional dan data awal Posyandu Tepus 3."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS balita (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nama_balita TEXT NOT NULL,
            nama_ibu TEXT DEFAULT '-',
            rt_wilayah TEXT NOT NULL,
            usia_bulan INTEGER NOT NULL,
            gender TEXT NOT NULL,
            tinggi_cm REAL NOT NULL,
            berat_kg REAL NOT NULL,
            lila_cm REAL NOT NULL,
            sumber_air TEXT NOT NULL,
            riwayat_bblr INTEGER NOT NULL,
            asi_eksklusif INTEGER NOT NULL,
            jamban_sehat INTEGER NOT NULL,
            zscore_tb REAL NOT NULL,
            status_risiko TEXT NOT NULL,
            risk_score REAL NOT NULL,
            tanggal_periksa TEXT NOT NULL
        )
    """)
    conn.commit()

    # Cek jika tabel kosong, isi data seeding 5 balita Tepus 3
    cur.execute("SELECT COUNT(*) FROM balita")
    if cur.fetchone()[0] == 0:
        seed_data = [
            ("Aditia Pratama", "Siti Aminah", "RT 01", 18, "L", 82.5, 10.8, 14.5, "Sumur Karst Kapur", 0, 1, 1, 0.25, "Normal (Optimal)", 0.10, "2026-11-20"),
            ("Aulia Rahmawati", "Sri Wahyuni", "RT 02", 24, "P", 81.2, 9.4, 12.0, "Sumur Karst Kapur", 1, 0, 1, -1.63, "Waspada (Faltering Growth)", 0.58, "2026-11-21"),
            ("Bima Sakti", "Kustini", "RT 03", 36, "L", 84.5, 10.1, 11.2, "PAH Air Hujan", 1, 0, 1, -3.18, "Risiko Tinggi (Stunted)", 0.89, "2026-11-22"),
            ("Citra Kirana", "Wulandari", "RT 04", 12, "P", 74.5, 9.2, 14.0, "PAM Desa", 0, 1, 1, 0.19, "Normal (Optimal)", 0.08, "2026-11-23"),
            ("Dafa Alfarizi", "Nurjanah", "RT 02", 30, "L", 86.0, 10.8, 12.2, "Sumur Karst Kapur", 0, 1, 1, -1.72, "Waspada (Faltering Growth)", 0.45, "2026-11-24")
        ]
        cur.executemany("""
            INSERT INTO balita (
                nama_balita, nama_ibu, rt_wilayah, usia_bulan, gender, tinggi_cm,
                berat_kg, lila_cm, sumber_air, riwayat_bblr, asi_eksklusif,
                jamban_sehat, zscore_tb, status_risiko, risk_score, tanggal_periksa
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, seed_data)
        conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Jalankan inisialisasi database SQLite
init_sqlite_db()

app = FastAPI(
    title="STUNT-GUARD TEPUS 3 API",
    description="Backend Machine Learning & Decision Support System (DSS) untuk Pencegahan Stunting Posyandu Padukuhan Tepus 3",
    version="1.0.0"
)

# Konfigurasi CORS agar frontend dapat mengakses API secara lokal dan publik
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pemuatan Model Terlatih (Artefak Data Mining)
try:
    model_stunting = joblib.load(MODEL_PATH)
    with open(META_PATH, "r", encoding="utf-8") as f:
        model_meta = json.load(f)
    print(f"[OK] Artefak Model Decision Tree berhasil dimuat: {MODEL_PATH}")
except Exception as e:
    print(f"[WARN] Gagal memuat model (.pkl). Sistem akan menggunakan Fallback Engine WHO: {e}")
    model_stunting = None
    model_meta = {}

# --- SCHEMA PYDANTIC ---

class BalitaInput(BaseModel):
    nama_balita: str = Field(..., example="Muhammad Rizki")
    nama_ibu: Optional[str] = Field("-", example="Ibu Siti")
    rt_wilayah: str = Field(..., example="RT 02")
    usia_bulan: int = Field(..., ge=0, le=59, example=24)
    gender: str = Field(..., pattern="^(L|P)$", example="L")
    tinggi_cm: float = Field(..., ge=40.0, le=130.0, example=88.0)
    berat_kg: float = Field(..., ge=2.0, le=35.0, example=12.0)
    lila_cm: float = Field(..., ge=8.0, le=25.0, example=14.5)
    sumber_air: str = Field("Sumur Karst Kapur", example="Sumur Karst Kapur")
    riwayat_bblr: bool = Field(False, example=False)
    asi_eksklusif: bool = Field(True, example=True)
    jamban_sehat: bool = Field(True, example=True)

class PredictionResponse(BaseModel):
    nama_balita: str
    rt_wilayah: str
    usia_bulan: int
    gender: str
    tinggi_cm: float
    berat_kg: float
    lila_cm: float
    zscore_tb: float
    kategori_zscore: str
    status_lila: str
    status_risiko: str
    risk_score: float
    decision_rule: str
    rekomendasi: List[str]

# --- HELPER FUNCTIONS ---

def hitung_antropometri_who(usia: int, gender: str, tinggi: float, lila: float):
    """Kalkulasi Z-score TB/U standar WHO Anthro & Permenkes No. 2 Th 2020."""
    med_h, sd_h = get_who_median_sd(usia, gender)
    z_tb = (tinggi - med_h) / sd_h
    
    # Kategori Klinis WHO
    if z_tb < -3.0:
        kat_tb = "Sangat Pendek (Severely Stunted)"
    elif z_tb < -2.0:
        kat_tb = "Pendek (Stunted)"
    elif z_tb <= 3.0:
        kat_tb = "Normal (Gizi Baik)"
    else:
        kat_tb = "Tinggi"
        
    # Kategori LiLA Balita
    if lila < 11.5:
        kat_lila = "Merah (Gizi Buruk / Wasting Akut)"
    elif lila < 12.5:
        kat_lila = "Kuning (Waspada / Gizi Kurang)"
    else:
        kat_lila = "Hijau (Gizi Baik)"
        
    return round(float(z_tb), 2), kat_tb, kat_lila

def run_decision_tree_engine(inp: BalitaInput):
    """Menjalankan inferensi model Decision Tree atau Rule-Based fallback."""
    z_tb, kat_tb, kat_lila = hitung_antropometri_who(
        inp.usia_bulan, inp.gender, inp.tinggi_cm, inp.lila_cm
    )
    
    pred_class = None
    # 1. Gunakan Model Machine Learning jika tersedia
    if model_stunting is not None:
        try:
            feat_df = pd.DataFrame([{
                "usia_bulan": inp.usia_bulan,
                "is_laki": 1 if inp.gender == "L" else 0,
                "tinggi_cm": inp.tinggi_cm,
                "berat_kg": inp.berat_kg,
                "lila_cm": inp.lila_cm,
                "riwayat_bblr": 1 if inp.riwayat_bblr else 0,
                "asi_eksklusif": 1 if inp.asi_eksklusif else 0,
                "air_karst_kapur": 1 if inp.sumber_air == "Sumur Karst Kapur" else 0,
                "jamban_sehat": 1 if inp.jamban_sehat else 0
            }], columns=FEATURE_COLS)
            pred_class = model_stunting.predict(feat_df)[0]
        except Exception as e:
            print(f"[WARN] Error prediksi model: {e}")
            pred_class = None
            
    # 2. Aturan Pohon Keputusan Transparan (C4.5 Rules Permenkes 2/2020)
    rekomendasi = []
    if z_tb < -2.0 or (z_tb < -1.8 and inp.lila_cm < 11.5) or pred_class == "Risiko Tinggi (Stunted)":
        status_risiko = "Risiko Tinggi (Stunted)"
        risk_score = 0.88
        rule = "RULE-03: IF (Z_TB < -2.0) OR (Z_TB < -1.8 AND LiLA < 11.5cm) THEN 'Risiko Tinggi'"
        rekomendasi.append("⚠️ Rujukan Segera: Laporkan dan rujuk balita ke Bidan Desa / Puskesmas Pembantu Tepus.")
        rekomendasi.append("🥩 Terapi Nutrisi: Asupan protein hewani harian (1 butir telur/hari, ikan laut lumat Tepus).")
        rekomendasi.append("💧 Sanitasi Air: Pastikan air minum balita bebas endapan kapur dan direbus mendidih.")
    elif z_tb < -1.5 or (z_tb < -1.2 and (inp.riwayat_bblr or not inp.asi_eksklusif)) or pred_class == "Waspada (Faltering Growth)":
        status_risiko = "Waspada (Faltering Growth)"
        risk_score = 0.52
        rule = "RULE-02: IF (Z_TB < -1.5) OR (Z_TB < -1.2 AND (BBLR == True OR ASI == False)) THEN 'Waspada'"
        rekomendasi.append("🟡 Intervensi PMT Lokal: Berikan PMT fortifikasi olahan singkong & daun kelor atau nugget ikan.")
        rekomendasi.append("⚖️ Pemantauan Ulang: Timbang ulang berat dan tinggi badan dalam 14 hari di Posyandu.")
    else:
        status_risiko = "Normal (Optimal)"
        risk_score = 0.12
        rule = "RULE-01: IF (Z_TB >= -1.5 AND LiLA >= 12.5cm) THEN 'Normal (Optimal)'"
        rekomendasi.append("✅ Pertahankan Pola Asuh: Tumbuh kembang balita sesuai kurva standar WHO.")
        rekomendasi.append("🥦 Diversifikasi Pangan: Lanjutkan pola makan gizi seimbang berbasis pangan lokal.")
        
    return {
        "nama_balita": inp.nama_balita,
        "rt_wilayah": inp.rt_wilayah,
        "usia_bulan": inp.usia_bulan,
        "gender": inp.gender,
        "tinggi_cm": inp.tinggi_cm,
        "berat_kg": inp.berat_kg,
        "lila_cm": inp.lila_cm,
        "zscore_tb": z_tb,
        "kategori_zscore": kat_tb,
        "status_lila": kat_lila,
        "status_risiko": status_risiko,
        "risk_score": risk_score,
        "decision_rule": rule,
        "rekomendasi": rekomendasi
    }

# --- ROUTES & ENDPOINTS ---

@app.get("/", tags=["Info"])
def root_info(request: Request):
    """
    Jika diakses dari browser, otomatis menyajikan antarmuka Web STUNT-GUARD.
    Jika diakses via client HTTP/API/Smoke test, menyajikan metadata JSON.
    """
    accept = request.headers.get("accept", "")
    index_file = FRONTEND_DIR / "index.html"
    if "text/html" in accept and index_file.exists():
        return FileResponse(index_file)
    return {
        "app_name": "STUNT-GUARD TEPUS 3 REST API",
        "version": "1.0.0",
        "location": "Padukuhan Tepus 3, Kalurahan Tepus, Gunungkidul",
        "dpl": "Aprilisa Arum Sari, S.T., M.Kom.",
        "database": "SQLite Relasional (posyandu_tepus3.db)",
        "status": "Operational / Ready for Cloud & Field Deployment",
        "docs_url": "/docs",
        "web_app_url": "/app"
    }

@app.get("/app", tags=["UI"], include_in_schema=False)
def serve_frontend_ui():
    """Menyajikan antarmuka web langsung dari server backend FastAPI."""
    index_file = FRONTEND_DIR / "index.html"
    return FileResponse(index_file)

@app.get("/style.css", include_in_schema=False)
def serve_root_css():
    return FileResponse(FRONTEND_DIR / "style.css")

@app.get("/app.js", include_in_schema=False)
def serve_root_js():
    return FileResponse(FRONTEND_DIR / "app.js")

@app.get("/favicon.svg", include_in_schema=False)
@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    return FileResponse(FRONTEND_DIR / "favicon.svg")

@app.get("/og-image.png", include_in_schema=False)
def serve_og_image():
    return FileResponse(FRONTEND_DIR / "og-image.png")

@app.post("/api/predict", response_model=PredictionResponse, tags=["Inference"])
def predict_stunting_risk(data: BalitaInput):
    """Eksekusi inferensi model Decision Tree & Z-score untuk balita baru."""
    result = run_decision_tree_engine(data)
    return result

@app.get("/api/balita", tags=["Database"])
def list_balita(
    q: Optional[str] = Query(None, description="Pencarian nama balita atau ibu"),
    rt: Optional[str] = Query(None, description="Filter per RT (RT 01 s/d RT 04)"),
    status: Optional[str] = Query(None, description="Filter status risiko")
):
    """Mendapatkan daftar seluruh balita dari database SQLite Posyandu Tepus 3."""
    conn = get_db()
    query = "SELECT * FROM balita WHERE 1=1"
    params = []
    if q:
        query += " AND (LOWER(nama_balita) LIKE ? OR LOWER(nama_ibu) LIKE ?)"
        ql = f"%{q.lower()}%"
        params.extend([ql, ql])
    if rt and rt != "ALL":
        query += " AND rt_wilayah = ?"
        params.append(rt)
    if status and status != "ALL":
        query += " AND status_risiko LIKE ?"
        params.append(f"%{status}%")
    query += " ORDER BY id DESC"
    rows = conn.execute(query, params).fetchall()
    res = [dict(r) for r in rows]
    conn.close()
    return res

@app.post("/api/balita", tags=["Database"])
def create_balita_record(data: BalitaInput):
    """Menyimpan record pemeriksaan baru ke database SQLite Posyandu."""
    result = run_decision_tree_engine(data)
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO balita (
            nama_balita, nama_ibu, rt_wilayah, usia_bulan, gender, tinggi_cm,
            berat_kg, lila_cm, sumber_air, riwayat_bblr, asi_eksklusif,
            jamban_sehat, zscore_tb, status_risiko, risk_score, tanggal_periksa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.nama_balita, data.nama_ibu, data.rt_wilayah, data.usia_bulan, data.gender,
        data.tinggi_cm, data.berat_kg, data.lila_cm, data.sumber_air,
        1 if data.riwayat_bblr else 0, 1 if data.asi_eksklusif else 0, 1 if data.jamban_sehat else 0,
        result["zscore_tb"], result["status_risiko"], result["risk_score"], today
    ))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    
    record = {
        "id": new_id,
        "nama_balita": data.nama_balita,
        "nama_ibu": data.nama_ibu,
        "rt_wilayah": data.rt_wilayah,
        "usia_bulan": data.usia_bulan,
        "gender": data.gender,
        "tinggi_cm": data.tinggi_cm,
        "berat_kg": data.berat_kg,
        "lila_cm": data.lila_cm,
        "sumber_air": data.sumber_air,
        "riwayat_bblr": data.riwayat_bblr,
        "asi_eksklusif": data.asi_eksklusif,
        "jamban_sehat": data.jamban_sehat,
        "zscore_tb": result["zscore_tb"],
        "status_risiko": result["status_risiko"],
        "risk_score": result["risk_score"],
        "tanggal_periksa": today
    }
    return {"message": "Data berhasil disimpan ke database SQLite Posyandu Tepus 3", "record": record}

@app.delete("/api/balita/{balita_id}", tags=["Database"])
def delete_balita_record(balita_id: int):
    """Menghapus record balita dari database SQLite berdasarkan ID."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM balita WHERE id = ?", (balita_id,))
    conn.commit()
    affected = cur.rowcount
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Balita ID tidak ditemukan")
    return {"message": f"Data balita ID {balita_id} berhasil dihapus dari database"}

@app.get("/api/stats", tags=["Analytics"])
def get_dashboard_statistics():
    """Statistik agregat real-time dari database SQLite."""
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM balita").fetchone()[0]
    normal = conn.execute("SELECT COUNT(*) FROM balita WHERE status_risiko LIKE '%Normal%'").fetchone()[0]
    waspada = conn.execute("SELECT COUNT(*) FROM balita WHERE status_risiko LIKE '%Waspada%'").fetchone()[0]
    stunted = conn.execute("SELECT COUNT(*) FROM balita WHERE status_risiko LIKE '%Tinggi%' OR status_risiko LIKE '%Stunted%'").fetchone()[0]
    
    rt_counts = {}
    for rt in ["RT 01", "RT 02", "RT 03", "RT 04"]:
        c_tot = conn.execute("SELECT COUNT(*) FROM balita WHERE rt_wilayah = ?", (rt,)).fetchone()[0]
        c_risk = conn.execute("SELECT COUNT(*) FROM balita WHERE rt_wilayah = ? AND status_risiko NOT LIKE '%Normal%'", (rt,)).fetchone()[0]
        rt_counts[rt] = {"total": c_tot, "berisiko": c_risk}
    conn.close()
    
    return {
        "total_balita": total,
        "normal_optimal": normal,
        "waspada_faltering": waspada,
        "risiko_tinggi_stunting": stunted,
        "prevalensi_risiko_pct": round(((waspada + stunted) / total * 100), 1) if total > 0 else 0,
        "distribusi_per_rt": rt_counts
    }

@app.get("/api/metadata", tags=["Info"])
def get_model_metadata():
    """Mengembalikan metadata model machine learning dan aturan CRISP-DM."""
    return model_meta

@app.get("/api/export-csv", tags=["Export"])
def export_csv_data():
    """Mengunduh seluruh database SQLite balita dalam format CSV untuk pelaporan posyandu."""
    conn = get_db()
    df = pd.read_sql_query("SELECT * FROM balita ORDER BY id ASC", conn)
    conn.close()
    csv_str = df.to_csv(index=False)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=Rekap_Balita_Posyandu_Tepus3.csv"}
    )

# Static UI Serving (Memungkinkan sistem di-host satu pintu tanpa server terpisah)
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/app", tags=["UI"], include_in_schema=False)
    def serve_frontend_ui():
        """Menyajikan antarmuka web langsung dari server backend FastAPI."""
        index_file = FRONTEND_DIR / "index.html"
        return FileResponse(index_file)
