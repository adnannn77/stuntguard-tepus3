# -*- coding: utf-8 -*-
"""
STUNT-GUARD TEPUS 3 - MODEL TRAINING & CRISP-DM PIPELINE
Sistem Deteksi Dini & Klasifikasi Risiko Stunting Berbasis Decision Tree C4.5
Lokasi Penelitian: Posyandu Padukuhan Tepus 3, Kalurahan Tepus, Gunungkidul
Institusi: Universitas Duta Bangsa Surakarta (Fakultas Ilmu Komputer)
Pengembang: Kelompok 39 Tim 1 KKNT UDB 2026 (Ahmadi Adnan, David V.I., Salfina E.S., Renita R., dkk.)
DPL: Aprilisa Arum Sari, S.T., M.Kom.
"""

from pathlib import Path
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier, export_text
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

BASE_DIR = Path(__file__).resolve().parent
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)

# Kurva Standar WHO Anthro & Permenkes No. 2 Tahun 2020 (Piecewise Interpolation)
WHO_AGE_MONTHS = np.array([0, 6, 12, 24, 36, 48, 60], dtype=float)

# Laki-Laki (Boy) Median & SD
WHO_BOYS_MEDIAN = np.array([49.9, 67.6, 75.7, 87.8, 96.1, 103.3, 110.0], dtype=float)
WHO_BOYS_SD     = np.array([1.89, 2.35, 2.65, 3.25, 3.65,  4.05,  4.45], dtype=float)

# Perempuan (Girl) Median & SD
WHO_GIRLS_MEDIAN = np.array([49.1, 65.7, 74.0, 86.4, 95.1, 102.7, 109.4], dtype=float)
WHO_GIRLS_SD     = np.array([1.85, 2.30, 2.60, 3.20, 3.60,  4.00,  4.40], dtype=float)

def get_who_median_sd(usia_bulan: float, gender: str):
    """Menghitung Median & SD Standar WHO Anthro menggunakan interpolasi piecewise."""
    if gender in ("L", 1, "1"):
        med = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_BOYS_MEDIAN))
        sd = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_BOYS_SD))
    else:
        med = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_GIRLS_MEDIAN))
        sd = float(np.interp(usia_bulan, WHO_AGE_MONTHS, WHO_GIRLS_SD))
    return med, sd

def generate_calibrated_dataset(n_samples=1000, seed=42):
    """
    Menghasilkan dataset terkalibrasi kondisi antropometri perdesaan karst Gunungkidul.
    Atribut klinis mengacu pada standar WHO Anthro & Permenkes No. 2 Tahun 2020.
    Atribut lingkungan mengacu pada temuan survei sanitasi air kapur Padukuhan Tepus 3.
    """
    np.random.seed(seed)
    
    usia_bulan = np.random.randint(0, 60, n_samples)
    gender = np.random.choice(["L", "P"], n_samples)
    riwayat_bblr = np.random.choice([0, 1], n_samples, p=[0.82, 0.18])  # 18% riwayat BBLR
    asi_eksklusif = np.random.choice([1, 0], n_samples, p=[0.68, 0.32]) # 32% non-ASI eksklusif
    air_karst_kapur = np.random.choice([1, 0], n_samples, p=[0.58, 0.42]) # 58% sumur kapur karst
    jamban_sehat = np.random.choice([1, 0], n_samples, p=[0.88, 0.12])
    
    tinggi_list = []
    berat_list = []
    lila_list = []
    ztb_list = []
    status_list = []
    
    for i in range(n_samples):
        u = float(usia_bulan[i])
        g = gender[i]
        b = riwayat_bblr[i]
        asi = asi_eksklusif[i]
        k = air_karst_kapur[i]
        
        med_h, sd_h = get_who_median_sd(u, g)
        
        # Penalti deviasi akibat gizi mikro & sanitasi perdesaan karst
        penalti = 0.0
        if b: penalti += 2.0
        if not asi and u > 6: penalti += 1.6
        if k: penalti += 1.1  # Infeksi saluran cerna akibat konsumsi air kapur karst
        
        tb = max(45.0, np.random.normal(med_h - penalti, sd_h))
        z_tb = (tb - med_h) / sd_h
        
        # Median berat badan WHO
        med_w = 3.3 + (0.35 * u if u <= 12 else 4.2 + 0.18 * (u - 12))
        bb = max(2.5, np.random.normal(med_w - (penalti * 0.3), 1.1))
        
        # Estimasi LiLA (cm)
        med_lila = 14.2 if u >= 12 else (10.5 + 0.28 * u)
        lila = max(9.0, np.random.normal(med_lila - (penalti * 0.25), 1.0))
        
        # Label Klasifikasi 3 Kelas Standar Kemenkes RI
        if z_tb < -2.0 or (z_tb < -1.8 and lila < 11.5):
            status = "Risiko Tinggi (Stunted)"
        elif z_tb < -1.5 or (z_tb < -1.2 and (b or not asi)):
            status = "Waspada (Faltering Growth)"
        else:
            status = "Normal (Optimal)"
            
        tinggi_list.append(round(float(tb), 1))
        berat_list.append(round(float(bb), 1))
        lila_list.append(round(float(lila), 1))
        ztb_list.append(round(float(z_tb), 2))
        status_list.append(status)
        
    df = pd.DataFrame({
        "usia_bulan": usia_bulan,
        "is_laki": (gender == "L").astype(int),
        "tinggi_cm": tinggi_list,
        "berat_kg": berat_list,
        "lila_cm": lila_list,
        "riwayat_bblr": riwayat_bblr,
        "asi_eksklusif": asi_eksklusif,
        "air_karst_kapur": air_karst_kapur,
        "jamban_sehat": jamban_sehat,
        "zscore_tb": ztb_list,
        "status_risiko": status_list
    })
    return df

def train_and_export_model():
    print("=" * 60)
    print("STUNT-GUARD TEPUS 3 - DATA MINING TRAINING PIPELINE")
    print("=" * 60)
    
    # 1. CRISP-DM Data Preparation
    print("[1/5] Membangun dataset kalibrasi antropometri Tepus 3...")
    df = generate_calibrated_dataset(n_samples=1000, seed=42)
    csv_path = ARTIFACTS_DIR / "dataset_stunting_tepus3.csv"
    df.to_csv(csv_path, index=False)
    print(f" -> Dataset tersimpan di: {csv_path} ({len(df)} baris)")
    
    feature_cols = [
        "usia_bulan", "is_laki", "tinggi_cm", "berat_kg", 
        "lila_cm", "riwayat_bblr", "asi_eksklusif", 
        "air_karst_kapur", "jamban_sehat"
    ]
    target_col = "status_risiko"
    
    X = df[feature_cols]
    y = df[target_col]
    
    # 2. Split Data (80% Train, 20% Test)
    print("[2/5] Membagi dataset train-test (80:20)...")
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    
    # 3. Modeling: Decision Tree C4.5 / CART (Entropy-based)
    print("[3/5] Melatih model Decision Tree Classifier (Criterion=Entropy)...")
    clf = DecisionTreeClassifier(
        criterion="entropy",
        max_depth=5,
        min_samples_split=15,
        min_samples_leaf=5,
        random_state=42
    )
    clf.fit(X_train, y_train)
    
    # 4. Evaluation
    print("[4/5] Evaluasi performa model...")
    y_pred = clf.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f" -> Akurasi Uji: {acc * 100:.2f}%\n")
    print("Classification Report:")
    print(classification_report(y_test, y_pred))
    
    # 5. Export Artifacts (Model, Metadata, Tree Rules)
    print("[5/5] Mengekspor artefak model untuk backend FastAPI...")
    model_path = ARTIFACTS_DIR / "decision_tree_stunting.pkl"
    joblib.dump(clf, model_path)
    print(f" -> Model tersimpan: {model_path}")
    
    # Export Rule Tree dalam format teks yang dapat dibaca manusia
    tree_rules = export_text(clf, feature_names=feature_cols)
    rules_path = ARTIFACTS_DIR / "rules_tree.txt"
    with open(rules_path, "w", encoding="utf-8") as f:
        f.write("=== ATURAN POHON KEPUTUSAN STUNT-GUARD TEPUS 3 ===\n")
        f.write(f"Akurasi Model: {acc * 100:.2f}%\n")
        f.write("Kriteria: Entropy (Gain Ratio / C4.5)\n")
        f.write("=" * 50 + "\n\n")
        f.write(tree_rules)
    print(f" -> Tree Rules tersimpan: {rules_path}")
    
    # Export Metadata Fitur
    meta = {
        "model_name": "Decision Tree C4.5 Stunting Detector",
        "algorithm": "DecisionTreeClassifier",
        "accuracy": round(float(acc), 4),
        "target_classes": list(clf.classes_),
        "feature_names": feature_cols,
        "feature_importances": dict(zip(feature_cols, [round(float(v), 4) for v in clf.feature_importances_])),
        "who_reference_table": {
            "months": WHO_AGE_MONTHS.tolist(),
            "boys_median": WHO_BOYS_MEDIAN.tolist(),
            "boys_sd": WHO_BOYS_SD.tolist(),
            "girls_median": WHO_GIRLS_MEDIAN.tolist(),
            "girls_sd": WHO_GIRLS_SD.tolist()
        },
        "lokasi": "Posyandu Padukuhan Tepus 3, Kapanewon Tepus, Gunungkidul",
        "author": "Kelompok 39 Tim A KKNT UDB 2026"
    }
    meta_path = ARTIFACTS_DIR / "feature_meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f" -> Feature Metadata tersimpan: {meta_path}")
    
    print("\n[SELESAI] Pipeline CRISP-DM berhasil dieksekusi tanpa kendala.")

if __name__ == "__main__":
    train_and_export_model()
