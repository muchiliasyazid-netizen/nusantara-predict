# Nusantara Predict — Total Recall (Tatum x Walrus), Track 1

Aplikasi prediksi olahraga yang belajar dari rekam jejak pemainnya.

## Cara kerja memori
1. **Kunci pick** — saat pick disimpan, `/api/memory` (server) memverifikasi pertandingan ke TheSportsDB (belum mulai),
   membaca checkpoint Sui Mainnet lewat gateway GraphQL Tatum, lalu menulis `NUSA_PICK` ke Walrus Memory.
2. **Hasil** — setelah pertandingan selesai, server memverifikasi skor akhir sendiri (klien tidak bisa memalsukan menang/kalah)
   lalu menulis `NUSA_OUTCOME`.
3. **Kredibilitas** — `profile` me-recall semua `NUSA_OUTCOME`, menghitung akurasi vs rata-rata keyakinan per liga.
4. **Memori mengubah produk** — keyakinan awal di modal prediksi disetel dari akurasi Anda di liga itu,
   dan Sari AI memberi saran berdasarkan rekam jejak yang sama.

Namespace Walrus per pengguna: `nusa-<username>`. Kunci delegasi hanya ada di env var server.

## Deploy (frontend di GitHub Pages, backend di Vercel)
GitHub Pages hanya menyajikan file statis, jadi `api/memory.js` perlu dijalankan di layanan serverless.
Kunci Walrus tidak boleh ada di frontend.
1. Buat akun Walrus Memory di https://memory.walrus.xyz → catat **delegate private key** dan **account object ID**.
   Isi akun dengan sedikit SUI Mainnet. Buat API key Tatum di https://dashboard.tatum.io.
2. Push folder ini ke repo GitHub **publik** (wajib untuk hackathon). Aktifkan Pages: Settings → Pages → Deploy from branch → `main` / root.
3. Di https://vercel.com masuk dengan akun GitHub → Add New Project → pilih repo yang sama → Deploy.
   (Tidak perlu CLI; Vercel otomatis mengenali folder `api/`.)
4. Vercel → Project Settings → Environment Variables: isi seperti `.env.example` lalu Redeploy.
   Isi `ALLOWED_ORIGIN` dengan `https://<username>.github.io` agar hanya situs Anda yang boleh memanggil.
5. Uji: `curl -X POST https://<proyek>.vercel.app/api/memory -H 'content-type: application/json' -d '{"action":"health"}'`
   → harus `{"walrus":true,"tatum":true}`.
6. Hubungkan frontend: di `index.html` ubah `window.NUSA_API = localStorage.getItem('nusa_api') || ''` menjadi
   `|| 'https://<proyek>.vercel.app'`, commit, tunggu Pages ter-update.
   (Untuk uji cepat tanpa commit: buka konsol browser, jalankan `localStorage.setItem('nusa_api','https://<proyek>.vercel.app')`, refresh.)
Alternatif tanpa Pages: pakai URL Vercel dari langkah 3 sebagai situs utama; `NUSA_API` boleh dibiarkan kosong.

## Bagian yang belum teruji
Dibuat tanpa akses internet, jadi hanya logika server yang diuji dengan data tiruan. Sebelum mengirim, buktikan sendiri:
SDK `@mysten-incubation/memwal` terpasang, tulisan muncul di Mainnet, dan panel "Memori Walrus" terisi.
Bentuk respons `recall` ditangani defensif (`results`/`memories`/`matches`), cek bila kosong.

## Daftar kirim (form: https://recall-tatum-walrus.vercel.app, batas 10 Nov 2026 17:00 UTC)
- [ ] 10+ tulisan Walrus Memory di Mainnet (tiap pick = 1 tulisan, tiap hasil = 1 tulisan)
- [ ] Tatum dipakai (checkpoint Sui di panel memori)
- [ ] Blog post: apa yang dilakukan, cara pakai Tatum + Walrus, bagaimana aplikasi belajar
- [ ] Video demo 2–3 menit, repo GitHub publik
- [ ] Isian form: email, Discord, LinkedIn, Tatum ID, alamat SUI, Account ID (SUI), MEMWAL_AGENT_ID, deskripsi

## Keamanan
- Rotasi API key Gemini yang sebelumnya tertanam di `index.html` (sudah terekspos), dan pindahkan ke server.
- `/api/memory` belum memverifikasi login (login aplikasi ini sisi klien). Ia hanya menerima data yang bisa
  diverifikasi sumbernya, tapi pasang Firebase Auth bila dipakai produksi.
