"""EbookForge web — API + UI mínima. El mismo motor, expuesto por HTTP.
Ejecuta:  uvicorn app:app --reload    (luego abre http://localhost:8000)"""
import json, tempfile
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse
from themes import get_theme, list_themes
from engine import generate

app = FastAPI(title="EbookForge")

@app.get("/", response_class=HTMLResponse)
def home():
    return Path("static/index.html").read_text(encoding="utf-8")

@app.get("/themes")
def themes():
    return {"themes": list_themes()}

@app.post("/generate")
async def gen(content: str = Form(...), theme: str = Form("amigurumi"),
              images: list[UploadFile] = File(default=[])):
    doc = json.loads(content)
    workdir = Path(tempfile.mkdtemp())
    imgdir = workdir / "imagenes"; imgdir.mkdir()
    for up in images:
        if up.filename:
            (imgdir / up.filename).write_bytes(await up.read())
    out = workdir / "ebook.pdf"
    generate(doc, get_theme(theme), imgdir, str(out))
    return FileResponse(str(out), media_type="application/pdf", filename="ebook.pdf")
