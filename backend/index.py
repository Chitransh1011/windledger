"""Vercel detects this FastAPI entry point when Root Directory is backend."""

from app.main import app

__all__ = ["app"]
