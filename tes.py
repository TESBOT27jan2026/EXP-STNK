import poplib
import email
from email.header import decode_header, make_header
import zipfile
import io
import pandas as pd
import streamlit as st

# =========================================================
# KONFIGURASI EMAIL
# =========================================================
POP_SERVER = "mailbox.tunasgroup.com"
POP_PORT = 995
EMAIL_USER = "disposal.ss@intra.tunasgroup.com"
EMAIL_PASS = "P@ssw0rd18062026"  # <-- Isi password kamu

def get_clean_header(msg, header_name):
    raw_header = msg.get(header_name, "")
    if not raw_header:
        return ""
    try:
        return str(make_header(decode_header(raw_header))).strip()
    except Exception:
        return str(raw_header).strip()

# =========================================================
# STREAMLIT UI
# =========================================================
st.set_page_config(page_title="Preview Excel Pengajuan Disposal", layout="wide")
st.title("🔍 Preview Data Excel - Pengajuan Disposal")

if "email_list" not in st.session_state:
    st.session_state["email_list"] = []

if st.button("🔍 Scan List Email 'Pengajuan Disposal'"):
    with st.spinner("Memindai header email dari server..."):
        try:
            mailbox = poplib.POP3_SSL(POP_SERVER, POP_PORT)
            mailbox.user(EMAIL_USER)
            mailbox.pass_(EMAIL_PASS)

            # Cek jumlah email yang benar-benar ADA di server saat ini
            num_messages = len(mailbox.list()[1])
            st.info(f"📊 Total email yang tersisa di Server POP3 saat ini: **{num_messages} email**")

            if num_messages == 0:
                st.warning("⚠️ Server POP3 kosong! Email di server sudah terhapus oleh Windows Live Mail. Pastikan opsi 'Leave a copy of messages on server' sudah dicentang di Windows Live Mail, lalu coba kirim email tes baru.")
            
            matching_emails = []
            debug_subjects = []

            # Cek hingga 50 email paling baru
            limit = max(0, num_messages - 50)
            for i in range(num_messages, limit, -1):
                _, lines, _ = mailbox.top(i, 0)
                msg_content = b"\r\n".join(lines)
                msg = email.message_from_bytes(msg_content)

                subject = get_clean_header(msg, "Subject")
                sender = get_clean_header(msg, "From")
                date_str = get_clean_header(msg, "Date")

                debug_subjects.append(f"#{i} | {subject}")

                if "pengajuan disposal" in subject.lower():
                    matching_emails.append({
                        "msg_num": i,
                        "subject": subject,
                        "sender": sender,
                        "date": date_str,
                        "label": f"{subject} | {date_str}"
                    })

            mailbox.quit()
            st.session_state["email_list"] = matching_emails
            
            with st.expander("🛠️ Debug: Lihat List Subjek Email Yang Terbaca Python"):
                st.write(debug_subjects)

            if matching_emails:
                st.success(f"Berhasil menemukan {len(matching_emails)} email 'Pengajuan Disposal'!")

        except Exception as e:
            st.error(f"Gagal terhubung ke server POP3: {e}")

# TAMPILKAN DROPDOWN DAN PREVIEW DATA
if st.session_state["email_list"]:
    st.markdown("---")
    selected_email = st.selectbox(
        "Pilih Email yang Mau Dilihat Isinya:",
        options=st.session_state["email_list"],
        format_func=lambda x: x["label"]
    )

    if selected_email and st.button("📥 Buka File ZIP & Preview Excel"):
        with st.spinner("Mendownload ZIP & membaca file Excel..."):
            try:
                mailbox = poplib.POP3_SSL(POP_SERVER, POP_PORT)
                mailbox.user(EMAIL_USER)
                mailbox.pass_(EMAIL_PASS)

                _, lines, _ = mailbox.retr(selected_email["msg_num"])
                msg_content = b"\r\n".join(lines)
                msg = email.message_from_bytes(msg_content)

                zip_found = False

                for part in msg.walk():
                    filename = part.get_filename()

                    if filename and filename.lower().endswith(".zip"):
                        zip_found = True
                        st.write(f"📦 **File ZIP:** `{filename}`")

                        zip_bytes = part.get_payload(decode=True)

                        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
                            excel_files = [f for f in z.namelist() if f.lower().endswith(('.xlsx', '.xls'))]

                            if not excel_files:
                                st.warning("File ZIP ditemukan, tetapi tidak ada file Excel di dalamnya.")
                            else:
                                for excel_name in excel_files:
                                    st.markdown("---")
                                    st.subheader(f"📊 File Excel: `{excel_name}`")
                                    
                                    with z.open(excel_name) as f_excel:
                                        excel_reader = pd.ExcelFile(f_excel)
                                        for sheet_name in excel_reader.sheet_names:
                                            df = pd.read_excel(excel_reader, sheet_name=sheet_name)
                                            st.markdown(f"**Sheet:** `{sheet_name}` | **Total:** {len(df)} baris x {len(df.columns)} kolom")
                                            
                                            with st.expander("📋 Lihat List Nama Kolom"):
                                                st.write(list(df.columns))

                                            st.dataframe(df, use_container_width=True)

                mailbox.quit()

                if not zip_found:
                    st.warning("Email ini tidak memiliki lampiran .zip.")

            except Exception as e:
                st.error(f"Terjadi kesalahan saat mengunduh isi email: {e}")