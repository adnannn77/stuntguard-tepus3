# -*- coding: utf-8 -*-
"""
Vercel Serverless Entry Point untuk STUNT-GUARD TEPUS 3
Menjembatani request API Vercel ke FastAPI application instance.
"""
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"

if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
