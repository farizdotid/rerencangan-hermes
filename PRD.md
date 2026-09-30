# Rerencangan Hermes: PRD dan Instruksi Kerja untuk Claude Code

Dokumen ini adalah source of truth untuk membangun **Rerencangan Hermes** ("rerencangan" berarti teman-teman dalam bahasa Sunda), sebuah kantor virtual 3D (Three.js) yang menampilkan status agent Hermes secara real-time. Repo ini **private dulu** dan baru dipublikasikan setelah owner menyetujui. Karena seluruh history commit ikut terbuka saat repo dipublikasikan, ikuti bagian 6A dengan ketat sejak commit pertama.

Baca seluruh dokumen sebelum menulis kode apa pun.

---

## 0. Aturan kerja (wajib diikuti)

1. **Satu fase per giliran.** Kerjakan fase di bagian 7 secara berurutan. Setelah satu fase selesai, **berhenti** dan laporkan: file yang diubah, cara menjalankan, cara memverifikasi, dan pertanyaan yang tersisa. Jangan lanjut ke fase berikutnya sebelum owner menyetujui.
2. **Rencana dulu, kode kemudian.** Di awal tiap fase, tulis rencana singkat (maksimal 10 baris) lalu kerjakan.
3. **Tanya kalau ada yang ambigu**, sekali dalam satu batch, sebelum mulai. Jangan menebak keputusan produk. Kalau keputusannya ada di bagian 9, pakai default yang tertulis.
4. **Kode original.** Jangan fork, salin, atau meniru kode dari proyek "VirtOffice" atau repo lain. Konsepnya boleh terinspirasi, implementasinya ditulis sendiri.
5. **Dependensi sedikit.** Sebutkan daftar dependensi sebelum install. Pin versi persis di `package.json`. Tanpa telemetry, tanpa analytics, tanpa CDN saat runtime (semua aset lokal).
6. **Jujur soal verifikasi.** Jangan bilang "sudah jalan" kalau belum dijalankan. Jalankan `npm run build`, `npm run typecheck`, dan test sebelum melapor selesai. Tulis apa yang belum bisa diverifikasi.
7. **Commit kecil** dengan pesan jelas, satu perubahan logis per commit.
8. **Keamanan data** (lihat bagian 6) tidak bisa ditawar. Kalau sebuah fitur butuh melanggarnya, berhenti dan tanya.
9. **Siap publik sejak awal.** Repo private sekarang, tapi saat dipublikasikan seluruh history ikut terbuka. Anggap semua yang di-commit akan dibaca publik, dan ikuti bagian 6A sebelum commit apa pun. **Jangan pernah mengubah visibility repo.** Keputusan go-public hanya di tangan owner.

---

## 1. Latar belakang dan masalah

Owner menjalankan beberapa agent Hermes di sebuah VPS (beberapa profile dalam satu gateway), termasuk agent dengan job terjadwal yang berjalan otomatis tiap malam. Untuk mengetahui kondisinya, owner harus menjalankan beberapa perintah CLI dan membaca log satu per satu. Tidak ada tampilan ringkas yang enak dilihat.

**Masalah:** status agent tersebar di banyak perintah dan kurang menyenangkan untuk dipantau.

**Ide:** kantor virtual 3D di mana tiap agent adalah karakter. Yang sedang bekerja duduk mengetik, yang menganggur bersantai, yang error memunculkan tanda bahaya. Sekali lihat, langsung paham.

## 2. Pengguna dan tujuan

- **Pengguna:** developer yang menjalankan Hermes Agent sendiri (awalnya owner), mengakses lewat SSH tunnel ke VPS atau menjalankan di laptop. Tidak ada multi-user dalam satu instalasi.
- **Tujuan produk:**
  1. Melihat status semua agent dalam sekali pandang.
  2. Tampilan menarik dan layak dijadikan bahan konten (screen recording).
  3. Aman: hanya membaca, tidak pernah mengubah apa pun di Hermes.

## 3. Core user journey

1. Owner membuka `http://localhost:<port>` (lewat SSH tunnel).
2. Melihat kantor 3D dengan satu karakter per agent dan satu rak server.
3. Status berubah otomatis tanpa refresh: karakter mulai mengetik saat job cron berjalan, merayakan saat selesai, panik saat error.
4. Klik karakter untuk melihat panel info (nama, status, job terakhir, jadwal berikutnya).
5. Kalau gateway mati, lampu rak server merah dan semua karakter tampak offline.

## 4. Fitur

### Core (MVP)
- Scene kantor isometrik (kamera orthographic) dengan lantai, dua dinding cutaway, meja per agent, rak server, area kopi.
- Avatar dari bentuk primitif (capsule, sphere, box), animasi procedural, tanpa file model.
- State machine per agent: `idle`, `working`, `error`, `celebrating`, `offline`.
- Data layer: endpoint snapshot + SSE, dengan **mode demo** (data palsu) dan **mode real** (collector).
- Collector read-only yang membaca status Hermes lewat CLI.
- Panel info saat avatar diklik.

### Nice to have (setelah MVP)
- Zona tambahan: ruang meeting dengan whiteboard, lounge, phone booth.
- Efek partikel dan suara opsional.
- Adapter tambahan: REST API dashboard Hermes.
- File service systemd untuk collector.

## 5. Non-goals (jangan dikerjakan)

- Tidak ada tombol untuk menjalankan, menghentikan, atau mengubah agent, job, atau konfigurasi Hermes.
- Tidak ada chat, tidak ada editor prompt.
- Tidak menampilkan isi prompt, isi sesi, atau potongan log di browser.
- Tidak ada autentikasi multi-user, database, atau penyimpanan permanen.
- Tidak mengimpor model 3D (GLB/FBX) di MVP.
- Tidak di-host publik. Tidak ada deploy ke cloud.
- Tidak mobile-first (responsive dasar cukup).

## 6. Keamanan dan privasi (tidak bisa ditawar)

- Collector **read-only**. Tidak pernah menulis ke `~/.hermes/` atau menjalankan perintah Hermes yang mengubah state.
- **Allowlist perintah.** Hanya perintah yang terdaftar di `sources/allowlist.ts`, dipanggil lewat `execFile` (tanpa shell), dengan timeout dan batas ukuran output. Awalnya: `hermes cron status`, `hermes cron list`, `hermes sessions list`. Untuk profile lain pakai flag `-p <nama>`. **Verifikasi flag dan sintaks lewat `--help` di mesin target**, jangan menebak.
- **Jangan pernah membaca atau menampilkan** `~/.hermes/.env`, `config.yaml`, kredensial, key SSH, atau isi `state.db` di MVP.
- Collector dan server **bind ke `127.0.0.1`** secara default. Akses jarak jauh hanya lewat SSH tunnel.
- Browser hanya menerima **status dan angka** (state, nama job, waktu, jumlah). Tidak ada teks bebas dari log atau sesi.
- Semua output CLI diperlakukan sebagai **data tidak tepercaya**: di-parse defensif, di-escape sebelum dirender, dan tidak pernah dijalankan atau di-eval.
- Fase 0 sampai 3 dikerjakan **tanpa menyentuh Hermes sama sekali** (pakai data demo).

## 6A. Siap publik sejak awal (wajib)

Repo ini private dulu, tapi akan dipublikasikan nanti. Mengubah visibility dari private ke publik membuka **seluruh history commit**, termasuk file yang sudah dihapus. Karena itu aturan di bawah berlaku sejak commit pertama, bukan baru saat go-public. Perlakukan setiap file, commit, dan isi history seolah sudah publik.

- **Jangan pernah di-commit:** file `.env`, token, key SSH, alamat IP atau hostname VPS, path pribadi, nama domain pribadi, isi log atau sesi Hermes. Siapkan `.gitignore` sejak Fase 0 (minimal: `.env`, `.env.*` kecuali `.env.example`, `config.local.json`, `node_modules`, `dist`, `*.log`).
- **Konfigurasi pribadi dipisah dari kode.** Daftar profile, nama tampilan, dan port dibaca dari `config.local.json` (di-ignore git). Yang di-commit hanya `config.example.json` dengan nilai generik (contoh: `default`, `writer`, `research`). Jangan menulis nama profile, nama job, atau nama proyek pribadi owner di dalam kode, test, atau dokumentasi.
- **Fixture harus disanitasi.** Output Hermes nyata berisi PID, ID job, ID eksekusi, nama job, dan nama profile. Ganti semuanya dengan nilai generik sebelum disimpan sebagai fixture. Lampiran A sudah disanitasi. Fixture baru dari mesin nyata wajib disanitasi juga sebelum di-commit.
- **Bukan proyek resmi.** README harus menyatakan jelas bahwa proyek ini tidak resmi dan tidak berafiliasi dengan Nous Research atau pembuat Hermes Agent. Nama "Hermes" di sini hanya merujuk ke agent yang dipantau.
- **Lisensi MIT** (`LICENSE`), dengan nama owner sebagai pemegang hak cipta. Jangan memakai aset (font, tekstur, suara, model) yang lisensinya tidak jelas. Semua aset dibuat sendiri atau berlisensi bebas dan dicatat di `ASSETS.md`.
- **Dokumentasi keamanan.** `SECURITY.md` singkat berisi cara melapor celah secara privat, dan peringatan bahwa aplikasi hanya boleh diakses lewat `127.0.0.1` atau SSH tunnel, tidak boleh diekspos ke internet. README menjelaskan model keamanannya (read-only, allowlist, hanya status dan angka).
- **Jangan menyertakan isi log, sesi, atau tangkapan layar yang memuat data nyata** di README, issue template, atau contoh.
- **Cek berkala:** sebelum melapor selesai tiap fase, pastikan tidak ada secret atau data pribadi yang ikut ter-commit.

### Checklist go-public (dijalankan sebelum owner mengubah visibility)

Claude Code menyiapkan laporannya, owner yang memutuskan dan mengubah visibility.

- [ ] Pindai **seluruh history**, bukan hanya file terbaru, untuk secret dan data pribadi (misalnya gitleaks atau pencarian manual). Laporkan hasilnya.
- [ ] Kalau ada secret yang pernah ter-commit, **cabut dan buat ulang (rotate) dulu**, lalu bersihkan history atau buat repo baru tanpa history. Menghapus file di commit berikutnya tidak cukup.
- [ ] Tidak ada IP, hostname, nama profile/job pribadi, atau isi log nyata di kode, fixture, test, dokumentasi, maupun tangkapan layar.
- [ ] `README.md` (termasuk pernyataan tidak resmi dan model keamanan), `LICENSE`, `SECURITY.md`, dan `ASSETS.md` lengkap. Lisensi semua aset jelas.
- [ ] Cara menjalankan di README sudah dicoba dari repo bersih (clone baru, ikuti README, berhasil jalan).
- [ ] Owner sudah membaca ulang seluruh repo sebagai orang asing dan menyetujui.

---

## 7. Rencana eksekusi per fase

Setiap fase punya kriteria selesai. Berhenti dan minta review setelah tiap fase.

### Fase 0: Scaffold
- Vite + TypeScript (strict) + Three.js. Skrip: `dev`, `build`, `typecheck`, `test`. Setup Vitest.
- Struktur folder sesuai bagian 8. README singkat berisi cara menjalankan, model keamanan, dan pernyataan bahwa proyek ini tidak resmi.
- File siap-publik: `.gitignore`, `LICENSE` (MIT), `SECURITY.md`, `ASSETS.md`, `.env.example`, `config.example.json` (lihat bagian 6A).
- **Selesai jika:** `npm run dev` menampilkan halaman dengan kubus berputar, `npm run build` dan `typecheck` lolos, dan tidak ada file pribadi atau secret di repo.

### Fase 1: Kantor statis
- Kamera orthographic isometrik + OrbitControls (rotasi terbatas, zoom terbatas, pan dimatikan atau dibatasi).
- Lantai, dua dinding cutaway, pencahayaan (ambient + directional), bayangan terbatas.
- Satu meja dengan monitor dan kursi. Rak server dengan LED kedip (warna bisa diatur lewat kode).
- Layout memakai konfigurasi (daftar slot meja), bukan posisi yang ditulis mati.
- **Selesai jika:** scene tampil rapi di 60 FPS pada laptop biasa, tanpa error console, resize bekerja.

### Fase 2: Avatar dan state machine (data demo)
- `AgentAvatar`: kepala, badan, tangan dari primitif, warna berbeda per agent, label nama.
- State machine dengan transisi yang mulus: `idle`, `working` (mengetik, layar monitor menyala), `error` (lampu merah di atas kepala, gemetar), `celebrating` (melompat), `offline` (redup, ikon "zzz").
- Kontrol dev: tombol keyboard `1` sampai `5` memaksa state untuk menguji animasi.
- Generator data demo yang mengganti state secara acak tiap beberapa detik.
- **Selesai jika:** semua state terlihat jelas berbeda, transisi tidak patah, tidak ada memory leak saat state berganti berulang kali.

### Fase 3: Data layer dan mock server
- Kontrak data (bagian 8) dengan tipe TypeScript dan validasi runtime.
- Server Node kecil (modul `http` bawaan): `GET /api/agents` (snapshot) dan `GET /events` (SSE, heartbeat tiap 15 detik). Mode demo menghasilkan data palsu dari server.
- Klien memakai `EventSource`, reconnect otomatis, dan indikator koneksi ("terhubung", "menyambung ulang").
- **Selesai jika:** frontend bergerak murni dari data server demo, dan tetap pulih setelah server di-restart.

### Fase 4: Collector nyata (CLI adapter)
- Parser untuk output `hermes cron status`, `hermes cron list`, `hermes sessions list`, dibuat **defensif**: field tidak dikenal diabaikan, format tak terduga menghasilkan `state: "idle"` dengan flag `unknown: true`, tidak pernah crash.
- Uji parser dengan **fixture** dari Lampiran A dan fixture tambahan yang diminta dari owner. Minta owner menempelkan output nyata `hermes cron list` dan `hermes sessions list` untuk tiap profile sebelum menulis parser sesi.
- Aturan pemetaan status di bagian 8.
- Polling dengan interval 5 sampai 10 detik, dengan cache dan tanpa tumpang tindih.
- Jalankan terhadap Hermes nyata **hanya setelah owner menyetujui**, dan hanya perintah di allowlist.
- **Selesai jika:** test parser lolos, dan collector di mesin target menghasilkan status yang sesuai dengan output CLI yang dicek manual.

### Fase 5: Multi-agent, panel info, polish
- Satu avatar per profile. Penempatan meja dari konfigurasi.
- Panel info HTML saat avatar diklik: nama, state, job terakhir (status + waktu), jadwal berikutnya.
- Rak server mencerminkan kesehatan gateway (LED hijau atau merah).
- Efek saat job selesai atau error. Zona tambahan (nice to have) hanya jika waktu ada.
- Dokumentasi: README cara menjalankan di laptop, di VPS (bind `127.0.0.1`), dan cara SSH tunnel. Contoh file systemd sebagai opsi.
- **Selesai jika:** semua kriteria keberhasilan di bagian 10 terpenuhi.

---

## 8. Spesifikasi teknis

### Stack
- **Frontend:** Vite, TypeScript strict, Three.js. Tanpa framework UI. Panel info dengan HTML/CSS biasa.
- **Collector dan server:** Node.js (versi minimal 22.12), TypeScript, modul bawaan (`node:http`, `node:child_process`). Tanpa framework web.
- **Test:** Vitest.

### Struktur folder yang diusulkan
```
rerencangan-hermes/
├── PRD.md                      # dokumen ini
├── CLAUDE.md                   # pointer singkat ke PRD.md dan aturan kerja
├── README.md                   # cara jalan, model keamanan, disclaimer tidak resmi
├── LICENSE                     # MIT
├── SECURITY.md
├── ASSETS.md                   # daftar aset dan lisensinya
├── .gitignore
├── .env.example
├── config.example.json         # contoh generik; config.local.json di-ignore git
├── package.json
├── src/                        # frontend
│   ├── main.ts
│   ├── scene/                  # kamera, cahaya, kantor, meja, rak server
│   ├── avatar/                 # AgentAvatar, state machine, animasi
│   ├── data/                   # klien SSE, tipe, validasi
│   └── ui/                     # panel info, indikator koneksi
├── server/
│   ├── index.ts                # http + SSE
│   ├── demo.ts                 # generator data demo
│   └── sources/
│       ├── allowlist.ts        # daftar perintah yang boleh
│       ├── hermesCli.ts        # eksekusi aman (execFile, timeout)
│       ├── parse/              # parser per perintah
│       └── fixtures/           # sample output untuk test
└── tests/
```

### Kontrak data
```ts
type AgentState = 'idle' | 'working' | 'error' | 'celebrating' | 'offline';

interface AgentStatus {
  id: string;              // nama profile, mis. "writer"
  displayName: string;
  state: AgentState;
  unknown?: boolean;       // true jika output tidak bisa dipahami
  currentTask?: string;    // nama job saja, tanpa prompt
  lastRun?: { status: 'success' | 'failed'; at: string };  // ISO 8601
  nextRunAt?: string;      // ISO 8601
  activeJobs: number;
}

interface Snapshot {
  generatedAt: string;
  gateway: { running: boolean; heartbeatAgeSeconds?: number };
  agents: AgentStatus[];
}
```

### Aturan pemetaan status (prioritas dari atas)
1. Gateway tidak berjalan → semua agent `offline`.
2. Ada kegagalan job yang baru (dalam 30 menit terakhir) → `error`.
3. Job dengan eksekusi `running` atau ada sesi aktif → `working`.
4. Job baru selesai sukses (dalam 2 menit terakhir) → `celebrating`.
5. Selain itu → `idle`.

Nilai ambang (30 menit, 2 menit) dijadikan konstanta yang mudah diubah.

### Visual
- Kamera orthographic isometrik, palet warna lembut dan konsisten, gaya low-poly.
- Avatar dari primitif dengan proporsi lucu. Animasi procedural (napas, langkah, gerak tangan mengetik).
- Performa: batasi pixel ratio maksimal 2, pakai `InstancedMesh` untuk objek berulang, bayangan terbatas, hentikan render saat tab tidak terlihat, bersihkan geometry dan material (`dispose`) saat tidak dipakai.
- Teks label lewat sprite atau overlay HTML, bukan geometri teks berat.

---

## 9. Keputusan yang perlu diisi owner (default tertulis)

| Keputusan | Default |
|-----------|---------|
| Nama proyek | Rerencangan Hermes (nama paket: `rerencangan-hermes`) |
| Profile yang ditampilkan | dibaca dari `config.local.json` (contoh generik di `config.example.json`: `default`, `writer`, `research`) |
| Nama tampilan per agent | sama dengan nama profile, bisa diganti di config |
| Palet warna | lembut, terang, aksen biru |
| Port server | 9600 |
| Visibility repo | private dulu, dipublikasikan setelah checklist go-public (bagian 6A) selesai |
| Sumber data real | CLI adapter (REST API dashboard ditunda) |
| Lokasi menjalankan | dev di laptop, real di VPS lewat SSH tunnel |

## 10. Kriteria keberhasilan MVP

- [ ] Kantor 3D tampil stabil (sekitar 60 FPS) di laptop biasa.
- [ ] Lima state terlihat jelas berbeda dan transisinya mulus.
- [ ] Status berubah otomatis dari data server tanpa refresh halaman.
- [ ] Collector membaca Hermes nyata secara read-only dan statusnya sesuai kenyataan.
- [ ] Gateway mati menghasilkan tampilan offline, bukan crash.
- [ ] Tidak ada isi prompt, sesi, atau log yang sampai ke browser.
- [ ] Server dan collector hanya bind ke `127.0.0.1`.
- [ ] `build`, `typecheck`, dan test lolos.
- [ ] Tidak ada secret, IP, hostname, nama profile/job pribadi, atau isi log nyata di kode, fixture, dokumentasi, dan history git (repo tetap siap publik kapan saja).
- [ ] README memuat disclaimer tidak resmi, model keamanan, dan cara SSH tunnel; `LICENSE`, `SECURITY.md`, dan `ASSETS.md` ada.
- [ ] README menjelaskan cara menjalankan dan SSH tunnel.

---

## Lampiran A: Fixture output Hermes (untuk test parser)

Output dari Hermes, **sudah disanitasi** untuk repo publik (PID, ID, nama job, dan nama profile diganti dengan nilai generik). Simpan sebagai fixture. Fixture tambahan dari mesin nyata wajib disanitasi dengan cara yang sama sebelum di-commit.

`hermes cron status`:
```
  Scheduler host: the host gateway (PID 12345) serving profiles default, writer, research
✓ Gateway is running — cron jobs will fire automatically
  PID: 12345
  Ticker heartbeat: 9s ago

  1 active job(s)
  Next run: 2026-10-01T23:00:00+07:00
```

`hermes cron list`:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Scheduled Jobs (profile: default)               │
└─────────────────────────────────────────────────────────────────────────┘

  a1b2c3d4e5f6 [active]
    Name:      Daily article job
    Schedule:  every day at 23:00
    Repeat:    ∞
    Next run:  2026-10-01T23:00:00+07:00
    Deliver:   local
    Dispatch:  on time (scheduled 2026-09-30T23:00:00+07:00)
    Execution: running  0123456789abcdef0123456789abcdef
```

Catatan: format ini bisa berubah antar versi Hermes. Parser harus toleran, dan fixture untuk kondisi lain (job selesai, job gagal, gateway mati, OVERDUE) perlu diminta dari owner sebelum parser dianggap lengkap.
