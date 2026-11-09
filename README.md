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

## Deploy (Vercel)
1. Buat akun Walrus Memory di https://memory.walrus.xyz → catat **delegate private key** dan **account object ID**.
   Isi akun dengan sedikit SUI Mainnet.
2. Buat API key gratis di https://dashboard.tatum.io.
3. Push folder ini ke repo GitHub publik, import ke Vercel.
4. Isi Environment Variables sesuai `.env.example`, lalu deploy.
5. Cek `POST /api/memory` dengan body `{"action":"health"}` → harus `{"walrus":true,"tatum":true}`.

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
