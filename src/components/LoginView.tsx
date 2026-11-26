import React, { useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Compass,
  Eye,
  EyeOff,
  GraduationCap,
} from 'lucide-react';
import { loginWithCredentials, type PublicBranding } from '../services/sadigClient';
import type { UserAccount } from '../types';
import { PemdaCrestSvg, TutWuriCrestSvg } from './SchoolCrest';
import uploadedSchoolBg from '../assets/images/uploaded_school_photo.png';

interface LoginViewProps {
  branding?: PublicBranding | null;
  onLoginSuccess: (user: UserAccount) => void;
  onNotify?: (type: 'success' | 'error', title: string, message: string) => void;
}

export function LoginView({
  branding,
  onLoginSuccess,
  onNotify,
}: LoginViewProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bgError, setBgError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await loginWithCredentials(identifier, password);
      if (!data.success || !data.user) {
        const msg = data.message || 'Username/NIP atau kata sandi tidak sesuai.';
        setError(msg);
        onNotify?.('error', 'Login Gagal', msg);
      } else {
        onLoginSuccess(data.user);
      }
    } catch {
      const msg = 'Terjadi gangguan koneksi saat masuk.';
      setError(msg);
      onNotify?.('error', 'Login Gagal', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-slate-100 text-slate-900 flex flex-col justify-center">
      {/* Latar Belakang Foto Sekolah Permanen */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {!bgError ? (
          <img
            src={uploadedSchoolBg}
            alt="Foto lingkungan sekolah"
            referrerPolicy="no-referrer"
            onError={() => setBgError(true)}
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-100 via-white to-emerald-50" />
        )}

        {/* Luminous Frosted Overlay untuk keterbacaan teks tetap tinggi */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/80 to-white/60 sm:from-white/92 sm:via-white/78 sm:to-white/52" />

        {/* Aksen garis arsitektural tipis */}
        <div
          className="absolute inset-0 opacity-[0.3] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.14) 1px, transparent 1px)',
            backgroundSize: '80px 80px',
          }}
        />
      </div>

      {/* Konten Utama 2 Kolom sesuai Tangkapan Layar SADIG */}
      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center px-6 py-10 sm:px-10 lg:flex-row lg:items-center lg:justify-between lg:gap-16">
        {/* Kolom Kiri: Identitas SADIG, Deskripsi & Alur Kerja */}
        <section className="mb-10 max-w-xl lg:mb-0">
          {/* Dua Logo Instansi di Bagian Atas */}
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-sm">
              {branding?.logoKiri ? (
                <img
                  src={branding.logoKiri}
                  alt="Logo Pemerintah Daerah"
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <PemdaCrestSvg className="h-10 w-10" />
              )}
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200/90 bg-white/95 p-1.5 shadow-sm">
              {branding?.logoKanan ? (
                <img
                  src={branding.logoKanan}
                  alt="Logo Sekolah"
                  referrerPolicy="no-referrer"
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <TutWuriCrestSvg className="h-10 w-10" />
              )}
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
            KURIKULUM MERDEKA
          </p>

          <h1 className="mt-1.5 font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-[2.75rem]">
            SADIG
          </h1>

          <h2 className="mt-1 font-display text-xl font-semibold text-slate-800 sm:text-2xl">
            Supervisi Akademik Digital Guru
          </h2>

          {branding?.namaSekolah && (
            <p className="mt-1.5 text-sm font-semibold text-emerald-700">
              {branding.namaSekolah}
            </p>
          )}

          <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-slate-600">
            Platform terintegrasi Google Sheets untuk pengelolaan berkas persiapan guru,
            persetujuan Kepala Sekolah, penilaian 3 tahap (Persiapan, Pelaksanaan, dan
            Evaluasi Dialog Refleksi), serta rekapitulasi resmi berstandar SUPAK.
          </p>

          {/* Elemen Ikonik Pendidikan Minimalis */}
          <div className="mt-5 flex flex-wrap items-center gap-5 text-xs font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
              <span>Standar SUPAK</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
              <span>Perangkat Ajar</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Compass className="h-4 w-4 text-emerald-700" strokeWidth={1.75} />
              <span>Dialog Refleksi</span>
            </span>
          </div>

          <div className="mt-6 border-t border-slate-300/80 pt-5">
            <h3 className="text-sm font-bold text-slate-800">
              Alur Kerja Terkunci Otomatis:
            </h3>
            <ol className="mt-2.5 space-y-1.5 text-sm text-slate-600">
              <li>1. Guru mengunggah tautan Google Drive perangkat ajar.</li>
              <li>2. Kepala Sekolah memeriksa &amp; menyetujui kelengkapan berkas.</li>
              <li>3. Pengawas Supervisi menilai Persiapan, Pelaksanaan, &amp; Evaluasi.</li>
            </ol>
          </div>
        </section>

        {/* Kolom Kanan: Kartu Login Sistem */}
        <section
          aria-label="Formulir Login Sistem"
          className="w-full max-w-[440px] self-center lg:self-auto"
        >
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 p-7 shadow-xl backdrop-blur-md sm:p-9">
            <div className="mb-6">
              <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">
                SILAHKAN LOGIN SISTEM
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Gunakan Username yang sudah di daftarkan oleh Admin.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-identifier"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Username
                </label>
                <input
                  id="login-identifier"
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username"
                  required
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-sm font-semibold text-slate-700"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password"
                    required
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-4 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-colors focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'
                    }
                    className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 min-h-[46px] w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
              >
                {loading ? 'Memverifikasi...' : 'Masuk Aplikasi'}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
