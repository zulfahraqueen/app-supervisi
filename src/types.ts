export type UserRole =
  | 'Admin'
  | 'Pengawas Sekolah'
  | 'Kepala Sekolah'
  | 'Pengawas Supervisi'
  | 'Guru';

export type StatusBerkas = 'Belum Dicek' | 'Disetujui' | 'Ditolak';
export type KelengkapanBerkas = 'Ada' | 'Belum Ada';
export type StatusPoinBerkas = 'Ada' | 'Tidak Ada';
export type TahapSupervisi = 'Persiapan' | 'Pelaksanaan' | 'Evaluasi';
export type TipePenilaianAspek = 'skor' | 'teks';
export type TargetMapelAspek = 'Umum' | 'BK';

export interface PoinBerkasItem {
  id: string;
  nama: string;
  deskripsi: string;
  orderIndex?: number;
}

export const DEFAULT_POIN_BERKAS: PoinBerkasItem[] = [
  {
    id: 'PB1',
    nama: 'RPP',
    deskripsi: 'Rencana Pelaksanaan Pembelajaran sesuai fase/kelas yang diampu.',
    orderIndex: 1,
  },
  {
    id: 'PB2',
    nama: 'Modul Ajar',
    deskripsi: 'Modul Ajar Kurikulum Merdeka lengkap dengan tujuan dan langkah pembelajaran.',
    orderIndex: 2,
  },
  {
    id: 'PB3',
    nama: 'Alur Tujuan Pembelajaran (ATP)',
    deskripsi: 'Dokumen CP, TP, dan Alur Tujuan Pembelajaran semester berjalan.',
    orderIndex: 3,
  },
  {
    id: 'PB4',
    nama: 'LKPD & Bahan Ajar',
    deskripsi: 'Lembar Kerja Peserta Didik dan bahan bacaan kontekstual.',
    orderIndex: 4,
  },
  {
    id: 'PB5',
    nama: 'Instrumen & Rubrik Asesmen',
    deskripsi: 'Instrumen asesmen awal, formatif, sumatif, beserta rubrik penilaian.',
    orderIndex: 5,
  },
];

export interface UserAccount {
  id?: string;
  uid?: string;
  email?: string;
  username: string;
  password: string;
  nama: string;
  role: UserRole;
  nip: string;
}

export interface GuruRecord {
  id: string;
  nip: string;
  namaGuru: string;
  mataPelajaran: string;
  tanggalPelaksanaan: string;
  supervisor: string;
  nipSupervisor: string;
  statusBerkas: StatusBerkas;
  kelengkapanBerkas: KelengkapanBerkas;
  linkDriveBerkas: string;
  catatanKepsek: string;
  cekBerkas?: Record<string, StatusPoinBerkas>;
  guruEmail?: string;
  supervisorEmail?: string;
  kepsekEmail?: string;
  pengawasEmail?: string;
}

export interface AspekItem {
  id: string;
  kelompok: string;
  aspek: string;
  kategoriDeskripsi: string;
  tipePenilaian?: TipePenilaianAspek;
  targetMapel?: TargetMapelAspek;
  orderIndex?: number;
}

export interface PenilaianItem {
  id?: string;
  guruId?: string;
  nipGuru: string;
  idAspek: string;
  tahap: TahapSupervisi;
  skor: 1 | 2 | 3 | 4 | null;
  teksRefleksi?: string;
  catatan: string;
  penilai: string;
}

export interface CatatanTahap {
  id?: string;
  guruId?: string;
  nipGuru: string;
  tahap: TahapSupervisi;
  masalah: string;
  pemecahan: string;
  rencanaTL: string;
  penilai: string;
  updatedAt: string;
}

export interface PengaturanSekolah {
  namaSekolah: string;
  dinasPendidikan: string;
  pemerintahDaerah: string;
  alamatSekolah: string;
  tahunPelajaran: string;
  semester: string;
  namaKepalaSekolah: string;
  nipKepalaSekolah: string;
  namaPengawasSekolah: string;
  nipPengawas: string;
  tanggalPelaksanaanUmum: string;
  tempatTanggalCetak: string;
  logoKiri?: string;
  logoKanan?: string;
}

export interface TahapSummary {
  jumlahAspek: number;
  terisi: number;
  totalSkor: number;
  skorMaksimal: number;
  nilai: number | null;
  predikat: string;
  mode: 'skor' | 'teks' | 'campuran';
}

export interface RekapGuru {
  guru: GuruRecord;
  persiapan: TahapSummary;
  pelaksanaan: TahapSummary;
  evaluasi: TahapSummary;
  nilaiRata: number | null;
  predikatAkhir: string;
  sudahLengkap: boolean;
}

export interface AppDatabasePayload {
  users: UserAccount[];
  guru: GuruRecord[];
  poinBerkas: PoinBerkasItem[];
  aspekPersiapan: AspekItem[];
  aspekPelaksanaan: AspekItem[];
  aspekEvaluasi: AspekItem[];
  penilaian: PenilaianItem[];
  catatanTahap: CatatanTahap[];
  pengaturan: PengaturanSekolah;
  rekap: RekapGuru[];
}

export const SKALA_RUBRIK: Array<{ skor: 1 | 2 | 3 | 4; label: string; ringkas: string }> = [
  { skor: 1, label: 'Kurang', ringkas: 'Belum memenuhi standar atau tidak tersedia' },
  { skor: 2, label: 'Cukup', ringkas: 'Sebagian terpenuhi, perlu pendampingan' },
  { skor: 3, label: 'Baik', ringkas: 'Memenuhi standar Kurikulum Merdeka' },
  { skor: 4, label: 'Amat Baik', ringkas: 'Sangat lengkap, kontekstual, dan inovatif' },
];

export function hitungPredikat(nilai: number | null): string {
  if (nilai === null || Number.isNaN(nilai)) return 'Belum Dinilai';
  if (nilai >= 86) return 'Amat Baik';
  if (nilai >= 71) return 'Baik';
  if (nilai >= 56) return 'Cukup';
  return 'Kurang';
}

export function isGuruBK(mataPelajaran?: string): boolean {
  const normalized = (mataPelajaran || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    /\bb\.?k\.?\b/.test(normalized) ||
    (normalized.includes('bimbingan') && normalized.includes('konseling')) ||
    normalized === 'konseling'
  );
}

export function resolveAspekTargetMapel(
  item: Pick<AspekItem, 'id' | 'targetMapel'>
): TargetMapelAspek {
  if (item.targetMapel === 'BK' || item.id.startsWith('BK_')) {
    return 'BK';
  }
  return 'Umum';
}

export const DEFAULT_BK_ASPEK_PERSIAPAN: AspekItem[] = [
  {
    id: 'BK_P1',
    kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
    aspek: 'Asesmen Kebutuhan (Analisis AKPD/AUM)',
    kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen asesmen kebutuhan peserta didik (AKPD/AUM).',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 101,
  },
  {
    id: 'BK_P2',
    kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
    aspek: 'Program Tahunan',
    kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen Program Tahunan layanan BK.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 102,
  },
  {
    id: 'BK_P3',
    kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
    aspek: 'Program Semesteran (Promes)',
    kategoriDeskripsi: 'Ketersediaan dan kelengkapan dokumen Program Semesteran (Promes) layanan BK.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 103,
  },
  {
    id: 'BK_P4',
    kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
    aspek: 'Rencana Pelaksanaan Layanan (RPL)',
    kategoriDeskripsi: 'Ketersediaan dan kelengkapan Rencana Pelaksanaan Layanan (RPL) Bimbingan dan Konseling.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 104,
  },
  {
    id: 'BK_P5',
    kelompok: 'I. ADMINISTRASI PERENCANAAN (PROGRAM)',
    aspek: 'Silabus/Peta Materi BK',
    kategoriDeskripsi: 'Ketersediaan dan kelengkapan Silabus atau Peta Materi layanan BK.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 105,
  },
];

export const DEFAULT_BK_ASPEK_PELAKSANAAN: AspekItem[] = [
  {
    id: 'BK_L1',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Jurnal/Buku Harian Guru BK',
    kategoriDeskripsi: 'Pencatatan kegiatan layanan harian Guru BK secara tertib dan berkala.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 101,
  },
  {
    id: 'BK_L2',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Buku Klasifikasi Masalah',
    kategoriDeskripsi: 'Pemetaan dan klasifikasi permasalahan peserta didik (pribadi, sosial, belajar, karier).',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 102,
  },
  {
    id: 'BK_L3',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Dokumentasi Konseling Perorangan',
    kategoriDeskripsi: 'Kelengkapan catatan dan dokumentasi pelaksanaan layanan konseling perorangan.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 103,
  },
  {
    id: 'BK_L4',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Dokumentasi Konseling Kelompok',
    kategoriDeskripsi: 'Kelengkapan catatan dan dokumentasi pelaksanaan layanan konseling kelompok.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 104,
  },
  {
    id: 'BK_L5',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Dokumentasi Bimbingan Klasikal',
    kategoriDeskripsi: 'Kelengkapan daftar hadir, materi, dan dokumentasi layanan bimbingan klasikal.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 105,
  },
  {
    id: 'BK_L6',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Catatan Home Visit',
    kategoriDeskripsi: 'Dokumentasi kunjungan rumah (home visit) beserta tindak lanjut penanganan kasus.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 106,
  },
  {
    id: 'BK_L7',
    kelompok: 'II. ADMINISTRASI PELAKSANAAN LAYANAN',
    aspek: 'Buku Referal (Alih Tangan Kasus)',
    kategoriDeskripsi: 'Pencatatan dan dokumentasi alih tangan kasus (referal) kepada pihak terkait.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 107,
  },
];

export const DEFAULT_BK_ASPEK_EVALUASI: AspekItem[] = [
  {
    id: 'BK_E1',
    kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
    aspek: 'Evaluasi Proses',
    kategoriDeskripsi: 'Pelaksanaan dan dokumentasi evaluasi proses layanan bimbingan dan konseling.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 101,
  },
  {
    id: 'BK_E2',
    kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
    aspek: 'Evaluasi Hasil (Laiseg, Laijapen, Laijapang)',
    kategoriDeskripsi: 'Pelaksanaan penilaian segera (Laiseg), jangka pendek (Laijapen), dan jangka panjang (Laijapang).',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 102,
  },
  {
    id: 'BK_E3',
    kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
    aspek: 'Laporan Bulanan/Semesteran',
    kategoriDeskripsi: 'Penyusunan laporan pelaksanaan program BK secara bulanan dan semesteran.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 103,
  },
  {
    id: 'BK_E4',
    kelompok: 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT',
    aspek: 'Analisis Tindak Lanjut',
    kategoriDeskripsi: 'Analisis hasil evaluasi layanan dan penyusunan rencana tindak lanjut perbaikan.',
    tipePenilaian: 'skor',
    targetMapel: 'BK',
    orderIndex: 104,
  },
  {
    id: 'BK_E5',
    kelompok: 'IV. SARANA PRASARANA PENUNJANG',
    aspek: 'Ruang Konseling (Privat)',
    kategoriDeskripsi: 'Kondisi fasilitas: Layak / Tidak (isikan kelayakan dan kondisi ruang konseling privat).',
    tipePenilaian: 'teks',
    targetMapel: 'BK',
    orderIndex: 105,
  },
  {
    id: 'BK_E6',
    kelompok: 'IV. SARANA PRASARANA PENUNJANG',
    aspek: 'Kotak Masalah / Papan Bimbingan',
    kategoriDeskripsi: 'Kondisi fasilitas: Ada / Tidak (isikan ketersediaan kotak masalah atau papan bimbingan).',
    tipePenilaian: 'teks',
    targetMapel: 'BK',
    orderIndex: 106,
  },
  {
    id: 'BK_E7',
    kelompok: 'IV. SARANA PRASARANA PENUNJANG',
    aspek: 'Lemari Arsip (Terkunci/Rahasia)',
    kategoriDeskripsi: 'Kondisi fasilitas: Ada / Tidak (isikan ketersediaan lemari arsip terkunci untuk kerahasiaan data).',
    tipePenilaian: 'teks',
    targetMapel: 'BK',
    orderIndex: 107,
  },
];

export function getDefaultBkAspekByTahap(tahap: TahapSupervisi): AspekItem[] {
  if (tahap === 'Persiapan') return DEFAULT_BK_ASPEK_PERSIAPAN.map((a) => ({ ...a }));
  if (tahap === 'Pelaksanaan') return DEFAULT_BK_ASPEK_PELAKSANAAN.map((a) => ({ ...a }));
  return DEFAULT_BK_ASPEK_EVALUASI.map((a) => ({ ...a }));
}

export function getAspekForGuru(
  aspekList: AspekItem[],
  tahap: TahapSupervisi,
  mataPelajaran?: string
): AspekItem[] {
  if (isGuruBK(mataPelajaran)) {
    const dbBk = aspekList.filter((a) => resolveAspekTargetMapel(a) === 'BK');
    return dbBk.length > 0 ? dbBk : getDefaultBkAspekByTahap(tahap);
  }
  return aspekList.filter((a) => resolveAspekTargetMapel(a) !== 'BK');
}

