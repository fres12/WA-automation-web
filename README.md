# 📲 WA Blast Automation — Web Dashboard

> Platform otomatisasi pengiriman pesan WhatsApp secara terjadwal melalui file Excel (SharePoint/OneDrive), dengan dashboard berbasis web dan scheduler harian otomatis.

---

## 🧩 Gambaran Umum Sistem

Sistem ini terdiri dari **dua repository terpisah** yang bekerja bersama:

```
┌─────────────────────────────────────┐       ┌────────────────────────────────────────┐
│   WA automation  (repo ini)         │       │   WA automation server  (repo terpisah)│
│                                     │       │                                        │
│  ✅ Node.js + Express               │       │  ✅ Python + Playwright (opsional)      │
│  ✅ Frontend: Vite + Tailwind CSS   │  ←──→ │  ✅ Eksekutor blast WA harian          │
│  ✅ Supabase (database & auth)      │       │  ✅ Windows Task Scheduler             │
│  ✅ Baileys (WA session)            │       │  ✅ Baca Excel via SharePoint/OneDrive │
│  ✅ Form input automation           │       │  ✅ Kirim pesan ke grup WA             │
└─────────────────────────────────────┘       └────────────────────────────────────────┘
                           ↕ keduanya membaca & menulis ke
                     ┌─────────────────────┐
                     │   Supabase Database │
                     │  (form_request,     │
                     │   wa_accounts,      │
                     │   wa_groups, dsb.)  │
                     └─────────────────────┘
```

### Alur Kerja Lengkap

1. **User membuka dashboard** → login via Supabase Auth
2. **User mengisi form automation**: link file Excel (SharePoint/OneDrive), pilih sheet, range sel, grup WA tujuan, jam & tanggal blast
3. **Data disimpan ke Supabase** (`form_request`, `request_sheets`, `request_groups`)
4. **WA Automation Server** (repo terpisah) — dijalankan oleh **Windows Task Scheduler setiap jam** — mengecek database, lalu mengeksekusi blast WA ke grup yang sudah dijadwalkan sesuai jam & tanggal yang ditentukan
5. Pesan terkirim otomatis setiap hari tanpa intervensi manual ✅

---

## 🛠️ Tech Stack

| Lapisan | Teknologi | Keterangan |
|--------|-----------|------------|
| **Backend API** | Node.js + Express | Server utama, REST API, proxy Supabase |
| **Frontend** | Vite + Tailwind CSS | Dashboard SPA multi-halaman |
| **Auth & Database** | [Supabase](https://supabase.com) | Auth, PostgreSQL, Realtime |
| **WA Session** | [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) | Koneksi WhatsApp Web via QR code |
| **Excel Reader** | PowerShell COM (Excel.Application) | Baca sheet names dari SharePoint/OneDrive |
| **Automation Executor** | Python + Playwright *(di repo server)* | Baca isi sel Excel, kirim pesan WA |
| **Scheduler** | Windows Task Scheduler | Trigger otomatis setiap jam |



---

## 📋 Prasyarat

Sebelum instalasi, pastikan sudah terinstall:

- **Node.js** `>= 18` → [nodejs.org](https://nodejs.org)
- **npm** (sudah bundled dengan Node.js)
- **Microsoft Excel** (terinstall di Windows, untuk preview sheet SharePoint)
- Akun **Supabase** (gratis) → [supabase.com](https://supabase.com)
- Login akun Microsoft/Office di komputer (untuk akses file SharePoint/OneDrive)

---

## ⚙️ Konfigurasi Environment (`.env`)

Salin file contoh dan isi nilainya:

```bash
cp .env.example .env
```

Lalu edit `.env`:

```env
# URL project Supabase kamu
# Contoh: https://xyzxyzxyz.supabase.co
SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co

# Ambil dari: Supabase Dashboard > Project Settings > API > anon public
SUPABASE_ANON_KEY=eyJhbGci...

# Ambil dari: Supabase Dashboard > Project Settings > API > service_role secret
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...

# Port Express server (default 3000)
# Sesuaikan jika pakai reverse proxy Nginx/Apache
PORT=3000

## 🚀 Instalasasi

### 1. Clone & Install Backend

```bash
# Clone repo ini
git clone <URL_REPO_INI>
cd "WA automation"

# Install dependencies backend
npm install
```

### 2. Konfigurasi `.env`

Ikuti langkah di atas untuk mengisi `.env`.

### 3. Install & Build Frontend

Frontend berada di folder `frontend/` dan menggunakan **Vite + Tailwind CSS**.

```bash
# Masuk ke folder frontend
cd frontend

# Install dependencies frontend
npm install

# Build untuk production (output ke frontend/dist/)
npm run build
```

### 4. Jalankan Backend Server

Kembali ke root project, lalu jalankan:

```bash
# Di root folder "WA automation"

# Mode production
npm start

# Mode development (auto-restart saat file berubah)
npm run dev
```

Server berjalan di `http://localhost:3000` (atau port sesuai `.env`).

---

## 🗂️ Struktur Folder

```
WA automation/
├── frontend/               # Frontend Vite (SPA multi-halaman)
│   ├── dashboard.html      # Halaman daftar automation
│   ├── form.html           # Form buat/edit automation
│   ├── detail.html         # Detail automation
│   ├── account.html        # Manajemen akun WA
│   ├── wa-status.html      # Status koneksi WA & QR scan
│   ├── login.html          # Halaman login
│   ├── style.css           # Tailwind CSS
│   ├── tailwind.config.js
│   ├── vite.config.js      # Build config (proxy /api → localhost:3000)
│   └── package.json
├── middleware/
│   └── auth.js             # Middleware autentikasi JWT Supabase
├── scripts/
│   ├── read-sheets.ps1     # PowerShell: baca sheet names dari SharePoint/OneDrive
│   ├── add-tanggal-blast.sql
│   └── submit-form-request.sql
├── data/
│   └── baileys-auth/       # Sesi WhatsApp tersimpan (auto-generated, jangan dihapus)
├── public/                 # Aset statis (font, gambar)
├── server.js               # Entry point Express + semua API routes
├── wa-client.js            # Wrapper Baileys (koneksi WA, QR, grup)
├── .env                    # Konfigurasi lokal (tidak di-commit)
├── .env.example            # Template env
└── package.json
```

---

## 🔗 Keterkaitan dengan WA Automation Server

> **Lihat repo**: `C:\Users\fresn\OneDrive\Documents\INSP-Project\WA automation server`

Repo ini (web dashboard) **hanya menerima input** dari user dan menyimpannya ke Supabase.
**Eksekusi blast WA yang sesungguhnya** dilakukan oleh **WA Automation Server** di repo terpisah.

### Cara Kerja WA Automation Server

```
Windows Task Scheduler
     │
     │  Trigger: setiap jam (misalnya 06:00, 07:00, 08:00, ...)
     ▼
Python Script (wa_automation_server)
     │
     ├─ 1. Query Supabase: cari form_request yang:
     │       - status = 'active'
     │       - jam_blast = jam sekarang
     │       - tanggal_blast mengandung tanggal hari ini
     │       - last_run_date ≠ hari ini (belum dijalankan hari ini)
     │
     ├─ 2. Untuk setiap job ditemukan:
     │       - Buka file Excel dari SharePoint (via Playwright/COM)
     │       - Baca range sel yang ditentukan di request_sheets
     │       - Format pesan (dengan caption jika ada)
     │       - Kirim ke semua grup WA di request_groups
     │       - Update last_run_date = hari ini
     │
     └─ 3. Selesai — tunggu trigger berikutnya
```

### Setup Windows Task Scheduler

Di repo **WA Automation Server**, tersedia script untuk mendaftarkan Task Scheduler. Ikuti README di repo tersebut untuk setup.

Contoh konfigurasi task:
- **Trigger**: Daily, repeat every 1 hour
- **Action**: `python wa_runner.py`
- **Start in**: `C:\path\to\wa-automation-server`

---

## 🗄️ Schema Database (Supabase)

Tabel-tabel utama yang digunakan:

| Tabel | Keterangan |
|-------|-----------|
| `profiles` | Data user (email, username, role admin/user) |
| `wa_accounts` | Akun WhatsApp per user (session, status, QR) |
| `wa_groups` | Cache daftar grup WA yang tersimpan |
| `form_request` | Data automation: nama, link Excel, jam, tanggal blast |
| `request_sheets` | Sheet Excel yang dipilih per automation |
| `sheet_tables` | Range sel per sheet (contoh: `C1:E9`) |
| `request_groups` | Grup WA tujuan per automation |

---

## 🔄 Development Workflow

```bash
# Terminal 1 — Backend (root project)
npm run dev
# Berjalan di http://localhost:3000

# Terminal 2 — Frontend (folder frontend/)
cd frontend
npm run dev
# Berjalan di http://localhost:5173
# /api otomatis di-proxy ke localhost:3000
```

Setelah development selesai, build frontend:

```bash
cd frontend
npm run build
# Output: frontend/dist/ → otomatis di-serve oleh Express via /public
```