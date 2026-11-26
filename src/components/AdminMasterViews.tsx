import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
  Save,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Image as ImageIcon,
  RotateCcw,
  Database,
  Link2,
  Unlink,
  Copy,
} from 'lucide-react';
import type {
  AppDatabasePayload,
  AspekItem,
  GuruRecord,
  PengaturanSekolah,
  PoinBerkasItem,
  TahapSupervisi,
  TargetMapelAspek,
  TipePenilaianAspek,
  UserAccount,
  UserRole,
} from '../types';
import {
  DEFAULT_BK_ASPEK_EVALUASI,
  DEFAULT_BK_ASPEK_PELAKSANAAN,
  DEFAULT_BK_ASPEK_PERSIAPAN,
  DEFAULT_POIN_BERKAS,
  resolveAspekTargetMapel,
} from '../types';
import { PemdaCrestSvg, TutWuriCrestSvg } from './SchoolCrest';
import {
  bulkImportGuruClient,
  deleteAspekClient,
  deleteDirectoryUserClient,
  deleteGuruClient,
  deletePoinBerkasClient,
  saveAspekClient,
  saveDirectoryUserClient,
  saveGuruClient,
  savePengaturanClient,
  savePoinBerkasClient,
  seedBkTemplateClient,
} from '../services/sadigClient';
import {
  getGasWebAppUrl,
  isGasConfigured,
  setGasWebAppUrl,
  testGasConnection,
} from '../services/gasDb';
import fixedKodeGs from '../../gas/Kode.gs?raw';

interface AdminMasterProps {
  section: 'guru' | 'aspek' | 'poinBerkas' | 'users' | 'settings';
  data: AppDatabasePayload;
  ownerUid: string;
  onActionSuccess: (updated: AppDatabasePayload | null, message: string) => Promise<void>;
  onError: (message: string) => void;
}

export function AdminMasterViews({
  section,
  data,
  ownerUid,
  onActionSuccess,
  onError,
}: AdminMasterProps) {
  // === DATA GURU STATE ===
  const [guruModal, setGuruModal] = useState(false);
  const [guruForm, setGuruForm] = useState<Partial<GuruRecord>>({});
  const csvInputRef = useRef<HTMLInputElement>(null);

  // === DATA ASPEK STATE ===
  const [aspekMapelFilter, setAspekMapelFilter] = useState<TargetMapelAspek>('Umum');
  const [aspekTab, setAspekTab] = useState<TahapSupervisi>('Persiapan');
  const [aspekModal, setAspekModal] = useState(false);
  const [aspekForm, setAspekForm] = useState<Partial<AspekItem>>({});

  // === POIN PERIKSA BERKAS STATE ===
  const [poinModal, setPoinModal] = useState(false);
  const [poinForm, setPoinForm] = useState<Partial<PoinBerkasItem>>({});

  // === USERS STATE ===
  const [userModal, setUserModal] = useState(false);
  const [userForm, setUserForm] = useState<Partial<UserAccount> & { oldUsername?: string }>({});

  // === PENGATURAN STATE ===
  const [settingsForm, setSettingsForm] = useState<PengaturanSekolah>(data.pengaturan);
  const [gasUrlInput, setGasUrlInput] = useState(() => getGasWebAppUrl());
  const [gasConnected, setGasConnected] = useState(() => isGasConfigured());
  const [gasBusy, setGasBusy] = useState(false);
  const [gasStatus, setGasStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSettingsForm(data.pengaturan);
  }, [data.pengaturan]);

  const supervisorOptions = data.users.filter(
    (u) => u.role === 'Pengawas Supervisi' || u.role === 'Admin'
  );

  // --- GURU HANDLERS ---
  function openGuruModal(g?: GuruRecord) {
    if (g) {
      setGuruForm({ ...g });
    } else {
      setGuruForm({
        namaGuru: '',
        nip: '',
        mataPelajaran: '',
        tanggalPelaksanaan: data.pengaturan.tanggalPelaksanaanUmum,
        supervisor: supervisorOptions[0]?.nama || '',
        guruEmail: '',
      });
    }
    setGuruModal(true);
  }

  async function submitGuru(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await saveGuruClient(guruForm, data.users, data.guru, ownerUid);
      setGuruModal(false);
      await onActionSuccess(
        updated,
        guruForm.id ? 'Data guru berhasil diperbarui.' : 'Data guru baru berhasil ditambahkan.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan data guru.');
    } finally {
      setBusy(false);
    }
  }

  async function removeGuru(id: string) {
    setBusy(true);
    try {
      const updated = await deleteGuruClient(id);
      await onActionSuccess(updated, 'Data guru berhasil dihapus.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menghapus data guru.');
    } finally {
      setBusy(false);
    }
  }

  function downloadCsvTemplate() {
    const csv =
      'Nama Guru,NIP,Mata Pelajaran,Tanggal Pelaksanaan,Supervisor\n' +
      'Budi Santoso,19860412 201101 1 005,Matematika,2026-11-20,Dra. Hj. Ratna Dewi\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Template_Data_Guru_SADIG.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = String(ev.target?.result || '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const items = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
          namaGuru: cols[0] || '',
          nip: cols[1] || '',
          mataPelajaran: cols[2] || '',
          tanggalPelaksanaan: cols[3] || '',
          supervisor: cols[4] || '',
        };
      });
      setBusy(true);
      try {
        const res = await bulkImportGuruClient(
          items,
          data.users,
          data.guru,
          data.pengaturan.tanggalPelaksanaanUmum,
          ownerUid
        );
        await onActionSuccess(res.data, 'Data guru CSV berhasil diimpor.');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Gagal mengimpor data guru CSV.');
      } finally {
        setBusy(false);
        if (csvInputRef.current) csvInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  // --- ASPEK HANDLERS ---
  const activeAspekList =
    aspekTab === 'Persiapan'
      ? data.aspekPersiapan
      : aspekTab === 'Pelaksanaan'
      ? data.aspekPelaksanaan
      : data.aspekEvaluasi;

  const hasDbBkAspects =
    data.aspekPersiapan.some((a) => resolveAspekTargetMapel(a) === 'BK') ||
    data.aspekPelaksanaan.some((a) => resolveAspekTargetMapel(a) === 'BK') ||
    data.aspekEvaluasi.some((a) => resolveAspekTargetMapel(a) === 'BK');

  const filteredAspekList = activeAspekList.filter(
    (a) => resolveAspekTargetMapel(a) === aspekMapelFilter
  );

  const displayAspekList =
    aspekMapelFilter === 'BK' && filteredAspekList.length === 0
      ? aspekTab === 'Persiapan'
        ? DEFAULT_BK_ASPEK_PERSIAPAN
        : aspekTab === 'Pelaksanaan'
        ? DEFAULT_BK_ASPEK_PELAKSANAAN
        : DEFAULT_BK_ASPEK_EVALUASI
      : filteredAspekList;

  const isPreviewDefaultBk = aspekMapelFilter === 'BK' && filteredAspekList.length === 0;

  function openAspekModal(item?: AspekItem) {
    if (item) {
      setAspekForm({
        ...item,
        targetMapel: resolveAspekTargetMapel(item),
        tipePenilaian: item.tipePenilaian || (aspekTab === 'Evaluasi' ? 'teks' : 'skor'),
      });
    } else {
      const defaultKelompok =
        aspekMapelFilter === 'BK'
          ? aspekTab === 'Persiapan'
            ? 'I. ADMINISTRASI PERENCANAAN (PROGRAM)'
            : aspekTab === 'Pelaksanaan'
            ? 'II. ADMINISTRASI PELAKSANAAN LAYANAN'
            : 'III. ADMINISTRASI EVALUASI & TINDAK LANJUT'
          : displayAspekList[0]?.kelompok || 'I. IDENTITAS & PERENCANAAN';
      const defaultTipe: TipePenilaianAspek =
        aspekMapelFilter === 'BK' ? 'skor' : aspekTab === 'Evaluasi' ? 'teks' : 'skor';
      setAspekForm({
        kelompok: defaultKelompok,
        aspek: '',
        kategoriDeskripsi: '',
        tipePenilaian: defaultTipe,
        targetMapel: aspekMapelFilter,
      });
    }
    setAspekModal(true);
  }

  async function submitAspek(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await saveAspekClient(aspekTab, aspekForm, activeAspekList, ownerUid);
      setAspekModal(false);
      await onActionSuccess(updated, `Aspek ${aspekTab} berhasil disimpan.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan aspek.');
    } finally {
      setBusy(false);
    }
  }

  async function removeAspek(id: string) {
    setBusy(true);
    try {
      const updated = await deleteAspekClient(aspekTab, id);
      await onActionSuccess(updated, 'Aspek penilaian berhasil dihapus.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menghapus aspek.');
    } finally {
      setBusy(false);
    }
  }

  async function loadBkTemplate() {
    setBusy(true);
    try {
      const allIds = [
        ...data.aspekPersiapan.map((a) => a.id),
        ...data.aspekPelaksanaan.map((a) => a.id),
        ...data.aspekEvaluasi.map((a) => a.id),
      ];
      const updated = await seedBkTemplateClient(allIds, ownerUid);
      await onActionSuccess(
        updated,
        'Template Instrumen Administrasi BK berhasil dimuat ke database.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal memuat template instrumen BK.');
    } finally {
      setBusy(false);
    }
  }

  // --- POIN PERIKSA BERKAS HANDLERS ---
  const poinBerkasList = [
    ...(data.poinBerkas && data.poinBerkas.length > 0 ? data.poinBerkas : DEFAULT_POIN_BERKAS),
  ].sort((a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0));

  function openPoinModal(item?: PoinBerkasItem) {
    if (item) {
      setPoinForm({ ...item });
    } else {
      const nextOrder =
        poinBerkasList.reduce((m, p) => Math.max(m, Number(p.orderIndex ?? 0)), 0) + 1;
      setPoinForm({
        nama: '',
        deskripsi: '',
        orderIndex: nextOrder,
      });
    }
    setPoinModal(true);
  }

  async function submitPoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await savePoinBerkasClient(poinForm, poinBerkasList, ownerUid);
      setPoinModal(false);
      await onActionSuccess(
        updated,
        poinForm.id
          ? 'Poin pemeriksaan berkas berhasil diperbarui.'
          : 'Poin pemeriksaan berkas berhasil ditambahkan.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan poin pemeriksaan berkas.');
    } finally {
      setBusy(false);
    }
  }

  async function removePoin(id: string) {
    setBusy(true);
    try {
      const updated = await deletePoinBerkasClient(id, ownerUid);
      await onActionSuccess(updated, 'Poin pemeriksaan berkas berhasil dihapus.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menghapus poin pemeriksaan berkas.');
    } finally {
      setBusy(false);
    }
  }

  // --- USERS HANDLERS ---
  function openUserModal(u?: UserAccount) {
    if (u) {
      setUserForm({ ...u, oldUsername: u.username });
    } else {
      setUserForm({
        username: '',
        password: '123',
        email: '',
        nama: '',
        role: 'Pengawas Supervisi',
        nip: '',
      });
    }
    setUserModal(true);
  }

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await saveDirectoryUserClient(userForm, data.users, ownerUid);
      setUserModal(false);
      await onActionSuccess(updated, 'Data pengguna dan hak akses berhasil disimpan.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan pengguna.');
    } finally {
      setBusy(false);
    }
  }

  async function removeUser(u: UserAccount) {
    setBusy(true);
    try {
      const updated = await deleteDirectoryUserClient(u);
      await onActionSuccess(updated, 'Akun pengguna berhasil dihapus.');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menghapus pengguna.');
    } finally {
      setBusy(false);
    }
  }

  // --- PENGATURAN HANDLER (Canvas resize <= 260px so logos stay compact) ---
  function handleLogoUpload(side: 'logoKiri' | 'logoKanan', e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('Pilih berkas gambar yang valid (PNG, JPG, WebP, atau SVG).');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      onError('Ukuran gambar logo maksimal 3 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxDim = 260;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressed = canvas.toDataURL('image/png');
          setSettingsForm((prev) => ({
            ...prev,
            [side]: compressed.length <= 340000 ? compressed : canvas.toDataURL('image/webp', 0.85),
          }));
        } else {
          setSettingsForm((prev) => ({ ...prev, [side]: rawUrl.slice(0, 340000) }));
        }
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function submitSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await savePengaturanClient(settingsForm, ownerUid);
      await onActionSuccess(
        updated,
        'Pengaturan identitas sekolah dan logo Kop berhasil disimpan.'
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConnectGas(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = gasUrlInput.trim();
    if (!cleaned) {
      onError('Masukkan URL Web App Google Apps Script terlebih dahulu.');
      return;
    }
    setGasBusy(true);
    setGasStatus('');
    try {
      const check = await testGasConnection(cleaned);
      if (!check.success) {
        setGasStatus(check.message);
        onError(check.message);
        return;
      }
      setGasWebAppUrl(cleaned);
      setGasConnected(true);
      const label = check.spreadsheetName || check.namaSekolah || 'Google Sheets';
      const msg = `Terhubung ke Spreadsheet (${label}).`;
      setGasStatus(msg);
      await onActionSuccess(null, msg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal terhubung ke Google Apps Script.';
      setGasStatus(msg);
      onError(msg);
    } finally {
      setGasBusy(false);
    }
  }

  async function handleDisconnectGas() {
    setGasWebAppUrl('');
    setGasUrlInput('');
    setGasConnected(false);
    setGasStatus('Koneksi Google Apps Script diputuskan.');
    await onActionSuccess(null, 'Koneksi Google Sheets diputuskan.');
  }

  function handleCopyKodeGs() {
    navigator.clipboard
      .writeText(fixedKodeGs)
      .then(() => {
        onActionSuccess(data, 'Kode.gs yang sudah diperbaiki disalin ke clipboard.');
      })
      .catch(() => {
        onError('Gagal menyalin ke clipboard. Gunakan tombol Unduh Kode.gs.');
      });
  }

  function handleDownloadKodeGs() {
    const blob = new Blob([fixedKodeGs], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Kode.gs';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ================= RENDER SECTIONS =================
  if (section === 'guru') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Kelola Data Guru</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tambah, edit, hapus, atau impor data guru dan alokasi Pengawas Supervisi
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Template CSV</span>
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvFile}
              className="hidden"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => csvInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Impor CSV</span>
            </button>
            <button
              type="button"
              onClick={() => openGuruModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Guru</span>
            </button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Nama Guru</th>
                  <th className="py-3 px-4">NIP</th>
                  <th className="py-3 px-4">Mata Pelajaran</th>
                  <th className="py-3 px-4">Tanggal Pelaksanaan</th>
                  <th className="py-3 px-4">Supervisor</th>
                  <th className="py-3 px-4">Status Berkas</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {data.guru.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900">{g.namaGuru}</td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">{g.nip}</td>
                    <td className="py-3 px-4 text-slate-700">{g.mataPelajaran}</td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-slate-700">
                      {g.tanggalPelaksanaan}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{g.supervisor || '-'}</td>
                    <td className="py-3 px-4">
                      {g.statusBerkas === 'Disetujui' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Disetujui
                        </span>
                      )}
                      {g.statusBerkas === 'Belum Dicek' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <Clock className="w-3.5 h-3.5" /> Belum Dicek
                        </span>
                      )}
                      {g.statusBerkas === 'Ditolak' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700">
                          <XCircle className="w-3.5 h-3.5" /> Ditolak
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openGuruModal(g)}
                          aria-label={`Edit ${g.namaGuru}`}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeGuru(g.id)}
                          aria-label={`Hapus ${g.namaGuru}`}
                          className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Guru Modal */}
        {guruModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <h4 className="text-base font-bold text-slate-900">
                  {guruForm.id ? 'Edit Data Guru' : 'Tambah Data Guru'}
                </h4>
                <button
                  type="button"
                  onClick={() => setGuruModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submitGuru} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Guru
                  </label>
                  <input
                    type="text"
                    required
                    value={guruForm.namaGuru || ''}
                    onChange={(e) => setGuruForm({ ...guruForm, namaGuru: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NIP</label>
                  <input
                    type="text"
                    required
                    value={guruForm.nip || ''}
                    onChange={(e) => setGuruForm({ ...guruForm, nip: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mata Pelajaran
                  </label>
                  <input
                    type="text"
                    required
                    list="mapel-suggestions"
                    value={guruForm.mataPelajaran || ''}
                    onChange={(e) =>
                      setGuruForm({ ...guruForm, mataPelajaran: e.target.value })
                    }
                    placeholder="Contoh: Matematika atau Bimbingan dan Konseling (BK)"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                  <datalist id="mapel-suggestions">
                    <option value="Bimbingan dan Konseling (BK)" />
                    <option value="BK" />
                    <option value="Matematika" />
                    <option value="Bahasa Indonesia" />
                    <option value="Bahasa Inggris" />
                    <option value="IPA Terpadu" />
                    <option value="IPS" />
                    <option value="PPKn" />
                    <option value="Informatika" />
                    <option value="PJOK" />
                  </datalist>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Isikan <strong>Bimbingan dan Konseling (BK)</strong> atau <strong>BK</strong>{' '}
                    agar supervisor otomatis menerima instrumen Administrasi BK.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tanggal Pelaksanaan
                  </label>
                  <input
                    type="date"
                    required
                    value={guruForm.tanggalPelaksanaan || ''}
                    onChange={(e) =>
                      setGuruForm({ ...guruForm, tanggalPelaksanaan: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pengawas Supervisi (Supervisor)
                  </label>
                  <select
                    value={guruForm.supervisor || ''}
                    onChange={(e) => setGuruForm({ ...guruForm, supervisor: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="">-- Pilih Supervisor --</option>
                    {supervisorOptions.map((spv) => (
                      <option key={spv.username} value={spv.nama}>
                        {spv.nama} ({spv.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Google Guru (Opsional — untuk Login Google)
                  </label>
                  <input
                    type="email"
                    value={guruForm.guruEmail || ''}
                    onChange={(e) => setGuruForm({ ...guruForm, guruEmail: e.target.value })}
                    placeholder="nama@guru.smp.belajar.id"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setGuruModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {busy ? 'Menyimpan...' : 'Simpan Data'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'aspek') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Data Aspek Instrumen Kurikulum Merdeka
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Atur indikator penilaian sesuai role mata pelajaran (Guru Mapel Umum vs Guru BK).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { id: 'Umum', label: 'Mapel Umum' },
                    { id: 'BK', label: 'Guru BK' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAspekMapelFilter(m.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      aspekMapelFilter === m.id
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(['Persiapan', 'Pelaksanaan', 'Evaluasi'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAspekTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      aspekTab === t
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Aspek {t}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => openAspekModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Aspek</span>
              </button>
            </div>
          </div>

          {aspekMapelFilter === 'BK' && !hasDbBkAspects && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-emerald-900">
                <strong>Template Instrumen Administrasi BK Aktif Otomatis.</strong> Untuk mengubah
                atau menambah indikator BK secara permanen di database, klik tombol di samping.
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={loadBkTemplate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{busy ? 'Memuat...' : 'Simpan Template BK ke Database'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-24">ID</th>
                  <th className="py-3 px-4 w-52">Kelompok Elemen</th>
                  <th className="py-3 px-4">Aspek Penilaian</th>
                  <th className="py-3 px-4">Kategori / Deskripsi</th>
                  <th className="py-3 px-4 w-48">Mode Penilaian</th>
                  <th className="py-3 px-4 text-right w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {displayAspekList.map((a) => {
                  const isText = a.tipePenilaian === 'teks';
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-700">
                        {a.id}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold text-emerald-700">
                        {a.kelompok}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{a.aspek}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{a.kategoriDeskripsi}</td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        {isText ? (
                          <span className="text-sky-700">
                            {aspekMapelFilter === 'BK'
                              ? 'Kondisi Fasilitas (Layak/Ada)'
                              : 'Manual Teks (Dialog Refleksi)'}
                          </span>
                        ) : (
                          <span className="text-slate-700">Skala Skor (1–4)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPreviewDefaultBk ? (
                          <span className="text-[11px] text-slate-400">Bawaan</span>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openAspekModal(a)}
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => removeAspek(a.id)}
                              className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {aspekModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <h4 className="text-base font-bold text-slate-900">
                  {aspekForm.id ? `Edit Aspek ${aspekTab}` : `Tambah Aspek ${aspekTab}`}
                </h4>
                <button
                  type="button"
                  onClick={() => setAspekModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submitAspek} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peruntukan Role Mata Pelajaran
                  </label>
                  <select
                    disabled={Boolean(aspekForm.id)}
                    value={aspekForm.targetMapel || aspekMapelFilter}
                    onChange={(e) =>
                      setAspekForm({
                        ...aspekForm,
                        targetMapel: e.target.value as TargetMapelAspek,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                  >
                    <option value="Umum">Mapel Umum (Semua Guru Mata Pelajaran)</option>
                    <option value="BK">Khusus Guru BK (Bimbingan dan Konseling)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelompok / Bagian
                  </label>
                  <input
                    type="text"
                    required
                    value={aspekForm.kelompok || ''}
                    onChange={(e) => setAspekForm({ ...aspekForm, kelompok: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Aspek Penilaian
                  </label>
                  <input
                    type="text"
                    required
                    value={aspekForm.aspek || ''}
                    onChange={(e) => setAspekForm({ ...aspekForm, aspek: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori / Deskripsi Indikator
                  </label>
                  <textarea
                    rows={3}
                    value={aspekForm.kategoriDeskripsi || ''}
                    onChange={(e) =>
                      setAspekForm({ ...aspekForm, kategoriDeskripsi: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mode Penilaian oleh Pengawas Supervisi
                  </label>
                  <select
                    value={aspekForm.tipePenilaian || (aspekTab === 'Evaluasi' ? 'teks' : 'skor')}
                    onChange={(e) =>
                      setAspekForm({
                        ...aspekForm,
                        tipePenilaian: e.target.value as TipePenilaianAspek,
                      })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="skor">Skala Skor (1–4)</option>
                    <option value="teks">
                      Manual Teks (Kondisi Fasilitas / Dialog Refleksi)
                    </option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pilih &ldquo;Manual Teks&rdquo; untuk isian naratif kondisi sarpras BK atau
                    hasil dialog refleksi.
                  </p>
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setAspekModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Simpan Aspek
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'poinBerkas') {
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Poin Pemeriksaan Berkas (Kepala Sekolah)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Kelola daftar poin dokumen (seperti RPP, Modul Ajar, ATP, LKPD) yang diperiksa Kepala
              Sekolah pada tahap Periksa &amp; Putuskan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openPoinModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Poin Berkas</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-20">Urutan</th>
                  <th className="py-3 px-4 w-24">ID</th>
                  <th className="py-3 px-4">Nama Poin Berkas</th>
                  <th className="py-3 px-4">Keterangan / Deskripsi</th>
                  <th className="py-3 px-4 text-right w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {poinBerkasList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 px-4 text-center text-slate-500">
                      Belum ada poin pemeriksaan berkas. Klik &ldquo;Tambah Poin Berkas&rdquo; untuk
                      membuat daftar periksa.
                    </td>
                  </tr>
                ) : (
                  poinBerkasList.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-slate-600">
                        {p.orderIndex ?? idx + 1}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-emerald-700">
                        {p.id}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{p.nama}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{p.deskripsi || '-'}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openPoinModal(p)}
                            aria-label={`Edit ${p.nama}`}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removePoin(p.id)}
                            aria-label={`Hapus ${p.nama}`}
                            className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {poinModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <h4 className="text-base font-bold text-slate-900">
                  {poinForm.id ? 'Edit Poin Pemeriksaan Berkas' : 'Tambah Poin Pemeriksaan Berkas'}
                </h4>
                <button
                  type="button"
                  onClick={() => setPoinModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submitPoin} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Urutan Tampil
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={poinForm.orderIndex ?? 1}
                    onChange={(e) =>
                      setPoinForm({ ...poinForm, orderIndex: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Poin Berkas
                  </label>
                  <input
                    type="text"
                    required
                    value={poinForm.nama || ''}
                    onChange={(e) => setPoinForm({ ...poinForm, nama: e.target.value })}
                    placeholder="Contoh: RPP, Modul Ajar, ATP, LKPD"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Keterangan / Deskripsi (Opsional)
                  </label>
                  <textarea
                    rows={3}
                    value={poinForm.deskripsi || ''}
                    onChange={(e) => setPoinForm({ ...poinForm, deskripsi: e.target.value })}
                    placeholder="Penjelasan singkat kelengkapan dokumen yang diperiksa Kepala Sekolah..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setPoinModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {busy ? 'Menyimpan...' : 'Simpan Poin'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'users') {
    const roles: UserRole[] = [
      'Admin',
      'Pengawas Sekolah',
      'Kepala Sekolah',
      'Pengawas Supervisi',
      'Guru',
    ];
    return (
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Kelola User Pengguna</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur akun dan hak akses (Role-Based Access Control) untuk seluruh 5 peran sekolah
            </p>
          </div>
          <button
            type="button"
            onClick={() => openUserModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Pengguna</span>
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Username</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Email Google</th>
                  <th className="py-3 px-4">NIP</th>
                  <th className="py-3 px-4">Role / Hak Akses</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {data.users.map((u) => (
                  <tr key={u.id || u.username} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-900">
                      {u.username}
                    </td>
                    <td className="py-3 px-4 text-slate-800">{u.nama}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{u.email || '-'}</td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">
                      {u.nip || '-'}
                    </td>
                    <td className="py-3 px-4 font-medium text-emerald-700 text-xs">{u.role}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openUserModal(u)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {u.username !== 'admin' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeUser(u)}
                            className="p-1.5 rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {userModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
                <h4 className="text-base font-bold text-slate-900">
                  {userForm.oldUsername ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}
                </h4>
                <button
                  type="button"
                  onClick={() => setUserModal(false)}
                  className="text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submitUser} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    required
                    disabled={userForm.oldUsername === 'admin'}
                    value={userForm.username || ''}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.password || ''}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Google (Untuk Login &amp; Sinkron Role Otomatis)
                  </label>
                  <input
                    type="email"
                    value={userForm.email || ''}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="contoh@guru.smp.belajar.id"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.nama || ''}
                    onChange={(e) => setUserForm({ ...userForm, nama: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">NIP</label>
                  <input
                    type="text"
                    value={userForm.nip || ''}
                    onChange={(e) => setUserForm({ ...userForm, nip: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Hak Akses (Role)
                  </label>
                  <select
                    disabled={userForm.oldUsername === 'admin'}
                    value={userForm.role || 'Pengawas Supervisi'}
                    onChange={(e) =>
                      setUserForm({ ...userForm, role: e.target.value as UserRole })
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:bg-slate-100"
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setUserModal(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Simpan Pengguna
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PENGATURAN SEKOLAH
  return (
    <div className="max-w-3xl">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="border-b border-slate-200 pb-4 mb-5">
          <h3 className="text-base font-bold text-slate-900">Pengaturan Identitas Sekolah</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Perubahan data di bawah otomatis memperbarui Kop Surat dan blok tanda tangan pada
            lembar Nilai Persiapan, Pelaksanaan, Evaluasi, dan Rekapitulasi.
          </p>
        </div>

        <form onSubmit={submitSettings} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pemerintah Daerah (Baris Kop 1)
              </label>
              <input
                type="text"
                required
                value={settingsForm.pemerintahDaerah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, pemerintahDaerah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Dinas Pendidikan (Baris Kop 2)
              </label>
              <input
                type="text"
                required
                value={settingsForm.dinasPendidikan}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, dinasPendidikan: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Sekolah (Baris Kop 3)
              </label>
              <input
                type="text"
                required
                value={settingsForm.namaSekolah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, namaSekolah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Alamat Sekolah
              </label>
              <input
                type="text"
                required
                value={settingsForm.alamatSekolah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, alamatSekolah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tahun Pelajaran
              </label>
              <input
                type="text"
                required
                value={settingsForm.tahunPelajaran}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, tahunPelajaran: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Semester</label>
              <input
                type="text"
                required
                value={settingsForm.semester}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, semester: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Kepala Sekolah
              </label>
              <input
                type="text"
                required
                value={settingsForm.namaKepalaSekolah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, namaKepalaSekolah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NIP Kepala Sekolah
              </label>
              <input
                type="text"
                required
                value={settingsForm.nipKepalaSekolah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, nipKepalaSekolah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Pengawas Sekolah
              </label>
              <input
                type="text"
                required
                value={settingsForm.namaPengawasSekolah}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, namaPengawasSekolah: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                NIP Pengawas Sekolah
              </label>
              <input
                type="text"
                required
                value={settingsForm.nipPengawas}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, nipPengawas: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tanggal Pelaksanaan Umum
              </label>
              <input
                type="date"
                required
                value={settingsForm.tanggalPelaksanaanUmum}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, tanggalPelaksanaanUmum: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tempat & Tanggal Cetak
              </label>
              <input
                type="text"
                required
                value={settingsForm.tempatTanggalCetak}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, tempatTanggalCetak: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* UPLOAD LOGO KIRI & KANAN KOP */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Logo Kop Surat (Kiri &amp; Kanan)</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Logo yang diunggah akan tampil pada Kop lembar Nilai Persiapan, Nilai Pelaksanaan,
                Nilai Evaluasi, Rekapitulasi Hasil, serta dokumen PDF yang diunduh.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Logo Kiri */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Logo Kiri Kop Surat</span>
                  {settingsForm.logoKiri && (
                    <button
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, logoKiri: '' })}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-red-600"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Bawaan</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center p-1.5 shrink-0">
                    {settingsForm.logoKiri ? (
                      <img
                        src={settingsForm.logoKiri}
                        alt="Pratinjau Logo Kiri"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <PemdaCrestSvg className="w-12 h-12" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-[11px] text-slate-500">
                      {settingsForm.logoKiri
                        ? 'Logo kustom aktif'
                        : 'Menggunakan logo daerah/instansi bawaan'}
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Pilih Logo Kiri</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload('logoKiri', e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Logo Kanan */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Logo Kanan Kop Surat</span>
                  {settingsForm.logoKanan && (
                    <button
                      type="button"
                      onClick={() => setSettingsForm({ ...settingsForm, logoKanan: '' })}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-red-600"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset Bawaan</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-white flex items-center justify-center p-1.5 shrink-0">
                    {settingsForm.logoKanan ? (
                      <img
                        src={settingsForm.logoKanan}
                        alt="Pratinjau Logo Kanan"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <TutWuriCrestSvg className="w-12 h-12" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="text-[11px] text-slate-500">
                      {settingsForm.logoKanan
                        ? 'Logo kustom aktif'
                        : 'Menggunakan logo sekolah bawaan'}
                    </div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Pilih Logo Kanan</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleLogoUpload('logoKanan', e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{busy ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* KONEKSI GOOGLE APPS SCRIPT (GOOGLE SHEETS) */}
      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h3 className="text-base font-bold text-slate-900">
                Koneksi Database Google Sheets (Apps Script)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Hubungkan aplikasi ini langsung ke Google Spreadsheet melalui URL Web App{' '}
              <span className="font-mono-tabular text-slate-700">Kode.gs</span> yang sudah diperbaiki.
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              gasConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            {gasConnected ? 'Terhubung ke Google Sheets' : 'Mode Lokal / Server'}
          </span>
        </div>

        <form onSubmit={handleConnectGas} className="space-y-3">
          <div>
            <label
              htmlFor="admin-gas-url"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              URL Web App Google Apps Script
            </label>
            <input
              id="admin-gas-url"
              type="url"
              value={gasUrlInput}
              onChange={(e) => setGasUrlInput(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {gasStatus && (
            <div className="text-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
              {gasStatus}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyKodeGs}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Salin Kode.gs (Fix)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadKodeGs}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Kode.gs</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {gasConnected && (
                <button
                  type="button"
                  disabled={gasBusy}
                  onClick={handleDisconnectGas}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-xs font-semibold text-red-700 disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Putuskan</span>
                </button>
              )}
              <button
                type="submit"
                disabled={gasBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>{gasBusy ? 'Menguji Koneksi...' : 'Uji & Hubungkan'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
