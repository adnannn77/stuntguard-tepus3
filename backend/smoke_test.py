# -*- coding: utf-8 -*-
"""
STUNT-GUARD TEPUS 3 - Smoke Test Suite
Memverifikasi fungsionalitas seluruh endpoint API FastAPI.
"""

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_root():
    res = client.get("/")
    assert res.status_code == 200
    assert "STUNT-GUARD" in res.json()["app_name"]
    print("[PASS] GET / -> Berhasil")

def test_predict_normal():
    payload = {
        "nama_balita": "Bayi Sehat",
        "nama_ibu": "Ibu Sehat",
        "rt_wilayah": "RT 01",
        "usia_bulan": 24,
        "gender": "L",
        "tinggi_cm": 88.0,
        "berat_kg": 12.0,
        "lila_cm": 15.0,
        "sumber_air": "PAM Desa",
        "riwayat_bblr": False,
        "asi_eksklusif": True,
        "jamban_sehat": True
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status_risiko"] == "Normal (Optimal)"
    assert data["nama_ibu"] == "Ibu Sehat", f"Expected 'Ibu Sehat', got {data.get('nama_ibu')}"
    print(f"[PASS] POST /api/predict (Normal) -> Z-Score: {data['zscore_tb']} SD, Status: {data['status_risiko']}, Ibu: {data['nama_ibu']}")

def test_predict_stunted():
    payload = {
        "nama_balita": "Bayi Pendek",
        "nama_ibu": "Ibu B",
        "rt_wilayah": "RT 03",
        "usia_bulan": 36,
        "gender": "L",
        "tinggi_cm": 83.0, # Sangat pendek untuk usia 3 tahun
        "berat_kg": 9.5,
        "lila_cm": 11.0, # LiLA merah
        "sumber_air": "Sumur Karst Kapur",
        "riwayat_bblr": True,
        "asi_eksklusif": False,
        "jamban_sehat": True
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "Stunted" in data["status_risiko"] or "Waspada" in data["status_risiko"]
    print(f"[PASS] POST /api/predict (Stunted Alert) -> Z-Score: {data['zscore_tb']} SD, Status: {data['status_risiko']}")

def test_list_and_crud_balita():
    # 1. Cek list awal (bersih)
    res = client.get("/api/balita")
    assert res.status_code == 200
    initial_count = len(res.json())
    print(f"[PASS] GET /api/balita -> Total awal di database: {initial_count}")

    # 2. Test Simpan Balita Baru beserta Nama Ibu
    new_balita = {
        "nama_balita": "Florian Wirtz",
        "nama_ibu": "Ibu Samantha",
        "rt_wilayah": "RT 02",
        "usia_bulan": 29,
        "gender": "L",
        "tinggi_cm": 88.0,
        "berat_kg": 12.0,
        "lila_cm": 14.5,
        "sumber_air": "PAM Desa",
        "riwayat_bblr": False,
        "asi_eksklusif": True,
        "jamban_sehat": True
    }
    create_res = client.post("/api/balita", json=new_balita)
    assert create_res.status_code == 200
    created_data = create_res.json()["record"]
    assert created_data["nama_ibu"] == "Ibu Samantha", f"nama_ibu tidak tersimpan! Didapat: {created_data.get('nama_ibu')}"
    new_id = created_data["id"]
    print(f"[PASS] POST /api/balita -> Berhasil simpan {created_data['nama_balita']} (Ibu: {created_data['nama_ibu']}) ID: {new_id}")

    # 3. Verifikasi di GET /api/balita
    fetch_res = client.get("/api/balita")
    records = fetch_res.json()
    saved_record = next((r for r in records if r["id"] == new_id), None)
    assert saved_record is not None
    assert saved_record["nama_ibu"] == "Ibu Samantha"
    print(f"[PASS] GET /api/balita verifikasi -> Record ditemukan dengan Ibu: {saved_record['nama_ibu']}")

    # 4. Bersihkan kembali data uji agar database tetap bersih 0 records
    del_res = client.delete(f"/api/balita/{new_id}")
    assert del_res.status_code == 200
    print(f"[PASS] DELETE /api/balita/{new_id} -> Data uji berhasil dibersihkan kembali.")

def test_stats():
    res = client.get("/api/stats")
    assert res.status_code == 200
    data = res.json()
    assert "total_balita" in data
    assert "distribusi_per_rt" in data
    print(f"[PASS] GET /api/stats -> Total: {data['total_balita']}, Prevalensi Risiko: {data['prevalensi_risiko_pct']}%")

if __name__ == "__main__":
    print("Menjalankan Smoke Test STUNT-GUARD Backend...")
    test_root()
    test_predict_normal()
    test_predict_stunted()
    test_list_and_crud_balita()
    test_stats()
    print("\n[SEMUA PENGUJIAN LULUS DENGAN SEMPURNA - ZERO BUG]")
