
import io
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import pandas as pd
import streamlit as st


# =========================================================
# KONFIGURASI
# =========================================================

ROOT = Path(__file__).resolve().parent
SCRIPT = ROOT / "examples" / "cekranmor.ts"

NPM_RUNNER = "npx.cmd" if os.name == "nt" else "npx"

st.set_page_config(
    page_title="Signal Ranmor Checker",
    page_icon="🚘",
    layout="wide",
    initial_sidebar_state="expanded",
)


# =========================================================
# FUNGSI PENDUKUNG
# =========================================================

def normalize_plate(value):
    """B-1234-CC -> B 1234 CC; AB-1223-BBB -> AB 1223 BBB."""
    value = str(value or "").strip().upper()
    value = re.sub(r"[\s-]+", " ", value).strip()

    match = re.fullmatch(
        r"([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{1,3})",
        value,
    )

    if not match:
        return None

    prefix, number, suffix = match.groups()
    return f"{prefix} {number} {suffix}"


def chassis_last5(value):
    """Ambil 5 karakter terakhir dari nomor rangka."""
    value = str(value or "").strip().upper()
    value = re.sub(r"\s+", "", value)

    if not value:
        return None

    if len(value) < 5:
        return None

    return value[-5:]


def parse_cli_output(output):
    """Baca output teks dari examples/cekranmor.ts."""
    result = {
        "API_CODE": "",
        "API_MESSAGE": "",
        "STNK_DATE": "",
        "STATUS_STNK": "",
        "STATUS_PKB": "",
        "STATUS_SWDKLLJ": "",
        "RESULT": "",
        "RESULT_DESC": "",
        "ERROR": "",
    }

    for line in output.splitlines():
        stripped = line.strip()

        if stripped.startswith("code"):
            result["API_CODE"] = stripped.split(":", 1)[-1].strip()
        elif stripped.startswith("message"):
            result["API_MESSAGE"] = stripped.split(":", 1)[-1].strip()

    marker = "data   :"
    pos = output.find(marker)

    if pos < 0:
        result["ERROR"] = "Data JSON tidak ditemukan pada output."
        return result

    raw = output[pos + len(marker):].strip()

    try:
        payload, _ = json.JSONDecoder().raw_decode(raw)
    except json.JSONDecodeError:
        result["ERROR"] = "Respons API tidak dapat dibaca sebagai JSON."
        return result

    if not isinstance(payload, dict):
        result["ERROR"] = "Format data API tidak sesuai."
        return result

    result["STNK_DATE"] = payload.get("stnk_date", "")
    result["STATUS_STNK"] = payload.get("status_stnk", "")
    result["STATUS_PKB"] = payload.get("status_pkb", "")
    result["STATUS_SWDKLLJ"] = payload.get("status_swdkllj", "")
    result["RESULT"] = payload.get("result", "")
    result["RESULT_DESC"] = payload.get("result_desc", "")

    return result


def run_check(plate, chassis):
    """Jalankan script TypeScript untuk satu kendaraan."""
    command = [
        NPM_RUNNER,
        "tsx",
        str(SCRIPT.relative_to(ROOT)),
        plate,
        chassis,
    ]

    try:
        proc = subprocess.run(
            command,
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=60,
            encoding="utf-8",
            errors="replace",
            shell=False,
        )

        output = proc.stdout or ""
        error_output = proc.stderr or ""

        if proc.returncode != 0:
            return {
                "API_CODE": "",
                "API_MESSAGE": "",
                "STNK_DATE": "",
                "STATUS_STNK": "",
                "STATUS_PKB": "",
                "STATUS_SWDKLLJ": "",
                "RESULT": "",
                "RESULT_DESC": "",
                "ERROR": (
                    error_output.strip()
                    or output.strip()
                    or f"Proses gagal, kode {proc.returncode}"
                )[-1500:],
            }

        return parse_cli_output(output)

    except subprocess.TimeoutExpired:
        return {
            "API_CODE": "",
            "API_MESSAGE": "",
            "STNK_DATE": "",
            "STATUS_STNK": "",
            "STATUS_PKB": "",
            "STATUS_SWDKLLJ": "",
            "RESULT": "",
            "RESULT_DESC": "",
            "ERROR": "Waktu permintaan habis (timeout 60 detik).",
        }

    except Exception as exc:
        return {
            "API_CODE": "",
            "API_MESSAGE": "",
            "STNK_DATE": "",
            "STATUS_STNK": "",
            "STATUS_PKB": "",
            "STATUS_SWDKLLJ": "",
            "RESULT": "",
            "RESULT_DESC": "",
            "ERROR": str(exc)[:1500],
        }


def make_excel(df):
    buffer = io.BytesIO()

    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Hasil Ranmor")

        worksheet = writer.sheets["Hasil Ranmor"]
        worksheet.freeze_panes = "A2"
        worksheet.auto_filter.ref = worksheet.dimensions

        for column_cells in worksheet.columns:
            max_length = max(
                len(str(cell.value or ""))
                for cell in column_cells
            )
            worksheet.column_dimensions[
                column_cells[0].column_letter
            ].width = min(max(max_length + 2, 12), 40)

    return buffer.getvalue()


def make_template():
    template = pd.DataFrame({
        "NOPOL": ["B-1234-CC", "AB-123-BB"],
        "NO_RANGKA": [
            "MHXXXXXXXXXXXX10869",
            "MHXXXXXXXXXXXX12345",
        ],
    })
    return make_excel(template)


# =========================================================
# TAMPILAN
# =========================================================

st.title("🚘 Signal Ranmor Checker")
st.write(
    "Pemeriksaan kendaraan secara batch menggunakan file Excel. "
    "Hasil dapat ditinjau di aplikasi dan diunduh kembali."
)

with st.sidebar:
    st.header("📘 Panduan penggunaan")

    st.markdown("""
**1. Siapkan Excel**
- Kolom nopol: misalnya `NOPOL`
- Kolom nomor rangka: misalnya `NO_RANGKA`
- Nomor rangka boleh lengkap.

**2. Upload file**
- Format file harus `.xlsx`.
- Baris pertama berisi header.
- Nopol harus disimpan sebagai teks.

**3. Pilih kolom**
Pilih kolom nopol dan nomor rangka sesuai file lo.

**4. Mulai pemeriksaan**
Tekan tombol mulai dan tunggu sampai selesai.

**5. Unduh hasil**
Periksa tabel, lalu unduh hasil Excel.

---

**Catatan penting**
- Aplikasi otomatis mengambil 5 karakter terakhir nomor rangka.
- Format nopol dinormalisasi sebelum dikirim ke API.
- Tanggal STNK hanya tampil jika disediakan oleh API.
- Status API bukan jaminan hukum bahwa dokumen masih berlaku.
- Gunakan hanya data kendaraan yang boleh lo akses.
- Hindari permintaan berulang yang berlebihan.
""")

    st.download_button(
        "📥 Download template Excel",
        data=make_template(),
        file_name="template_ranmor.xlsx",
        mime=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        use_container_width=True,
    )


# =========================================================
# CEK KESIAPAN
# =========================================================

if not SCRIPT.exists():
    st.error(
        f"Script tidak ditemukan: {SCRIPT}\n\n"
        "Pastikan app.py berada di folder utama repository."
    )
    st.stop()

if shutil.which(NPM_RUNNER) is None:
    st.error(
        "Node.js/npm tidak ditemukan. Pastikan Node.js sudah terpasang "
        "dan perintah npm dapat dijalankan dari CMD."
    )
    st.stop()


# =========================================================
# UPLOAD EXCEL
# =========================================================

st.subheader("1. Upload data kendaraan")

uploaded = st.file_uploader(
    "Pilih file Excel (.xlsx)",
    type=["xlsx"],
    help="File asli tidak diubah.",
)

if uploaded is None:
    st.info(
        "Upload file Excel untuk memulai. "
        "Lo juga bisa mengunduh template dari sidebar."
    )
    st.stop()

try:
    df = pd.read_excel(uploaded, dtype=str).fillna("")
except Exception as exc:
    st.error(f"File Excel gagal dibaca: {exc}")
    st.stop()

if df.empty:
    st.warning("File Excel tidak berisi data.")
    st.stop()

if len(df.columns) == 0:
    st.error("Header Excel tidak ditemukan.")
    st.stop()

st.caption(f"Total baris data: {len(df):,}")
st.dataframe(df.head(10), use_container_width=True)

st.subheader("2. Atur kolom")

columns = list(df.columns)

def find_default(candidates, fallback=0):
    for candidate in candidates:
        for col in columns:
            if str(col).strip().upper() == candidate:
                return columns.index(col)
    return min(fallback, len(columns) - 1)

c1, c2 = st.columns(2)

with c1:
    plate_col = st.selectbox(
        "Kolom nomor polisi",
        columns,
        index=find_default(["NOPOL", "NO_POLISI", "NOMOR_POLISI"]),
    )

with c2:
    chassis_col = st.selectbox(
        "Kolom nomor rangka",
        columns,
        index=find_default(
            ["NO_RANGKA", "NORANGKA", "NOMOR_RANGKA", "CHASSIS"],
            fallback=1,
        ),
    )

if plate_col == chassis_col:
    st.warning("Pilih kolom berbeda untuk nopol dan nomor rangka.")
    st.stop()

st.subheader("3. Pengaturan pemeriksaan")

c3, c4 = st.columns(2)

with c3:
    max_rows = st.number_input(
        "Jumlah baris yang diproses (0 = semua)",
        min_value=0,
        max_value=len(df),
        value=0,
        step=1,
    )

with c4:
    delay = st.number_input(
        "Jeda antarpermintaan (detik)",
        min_value=1.0,
        max_value=10.0,
        value=1.0,
        step=0.5,
    )

st.caption(
    "Disarankan tes 1–2 kendaraan terlebih dahulu sebelum memproses "
    "seluruh file."
)

if st.button(
    "🚀 Mulai pemeriksaan",
    type="primary",
    use_container_width=True,
):
    data = df.copy()

    if max_rows > 0:
        data = data.head(int(max_rows))

    results = []
    progress = st.progress(0)
    status_text = st.empty()
    result_area = st.empty()

    for i, (_, row) in enumerate(data.iterrows()):
        plate_original = str(row[plate_col]).strip()
        chassis_original = str(row[chassis_col]).strip()

        result = {
            "NOPOL_NORMALIZED": "",
            "CHASSIS_LAST5": "",
            "API_CODE": "",
            "API_MESSAGE": "",
            "STNK_DATE": "",
            "STATUS_STNK": "",
            "STATUS_PKB": "",
            "STATUS_SWDKLLJ": "",
            "RESULT": "",
            "RESULT_DESC": "",
            "ERROR": "",
        }

        plate = normalize_plate(plate_original)
        chassis = chassis_last5(chassis_original)

        result["NOPOL_NORMALIZED"] = plate or ""
        result["CHASSIS_LAST5"] = chassis or ""

        if not plate:
            result["ERROR"] = "Format nopol tidak dikenali."
        elif not chassis:
            result["ERROR"] = (
                "Nomor rangka kosong atau kurang dari 5 karakter."
            )
        else:
            status_text.write(
                f"Memeriksa {i + 1}/{len(data)} — {plate_original}"
            )
            result.update(run_check(plate, chassis))

        results.append(result)
        progress.progress((i + 1) / len(data))

        result_area.caption(
            f"Selesai: {i + 1} dari {len(data)} kendaraan"
        )

        if i < len(data) - 1:
            time.sleep(delay)

    result_df = pd.DataFrame(results).reset_index(drop=True)
    original_df = data.reset_index(drop=True)

    final_df = pd.concat(
        [original_df, result_df],
        axis=1,
    )

    st.session_state["ranmor_result"] = final_df
    st.session_state["ranmor_filename"] = "hasil_cek_ranmor.xlsx"

if "ranmor_result" in st.session_state:
    final_df = st.session_state["ranmor_result"]

    st.divider()
    st.subheader("4. Ringkasan hasil")

    total = len(final_df)
    errors = (
        final_df["ERROR"].fillna("").astype(str).str.strip().ne("")
    ).sum()

    dates = (
        final_df["STNK_DATE"].fillna("").astype(str).str.strip()
        .ne("")
    ).sum()

    a, b, c = st.columns(3)
    a.metric("Total diproses", f"{total:,}")
    b.metric("Memiliki nilai STNK_DATE", f"{dates:,}")
    c.metric("Baris error", f"{errors:,}")

    st.caption(
        "Nilai STNK_DATE yang berisi '-' tetap dihitung sebagai nilai "
        "yang dikembalikan API; itu bukan tanggal yang valid."
    )

    st.subheader("5. Detail hasil")
    st.dataframe(final_df, use_container_width=True)

    st.download_button(
        "📥 Download hasil Excel",
        data=make_excel(final_df),
        file_name="hasil_cek_ranmor.xlsx",
        mime=(
            "application/vnd.openxmlformats-officedocument."
            "spreadsheetml.sheet"
        ),
        type="primary",
        use_container_width=True,
    )
