import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  Search,
  Check,
  X,
} from 'lucide-react';
import type {
  AppDatabasePayload,
  GuruRecord,
  KelengkapanBerkas,
  StatusPoinBerkas,
} from '../types';
import { DEFAULT_POIN_BERKAS } from '../types';
import { verifikasiKepsekClient } from '../services/sadigClient';

interface ApprovalKepsekViewProps {
  mode: 'kepsek' | 'pengawas';
  data: AppDatabasePayload;
  onActionSuccess: (updated: AppDatabasePayload | null, message: string) => Promise<void>;
  onError: (message: string) => void;
}

export function ApprovalKepsekView({
  mode,
  data,
  onActionSuccess,
  onError,
}: ApprovalKepsekViewProps) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'Semua' | 'Belum Dicek' | 'Disetujui' | 'Ditolak'>(
    'Semua'
  );
  const [editingRow, setEditingRow] = useState<GuruRecord | null>(null);
  const [checklist, setChecklist] = useState<Record<string, StatusPoinBerkas>>({});
  const [catatan, setCatatan] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const poinList = useMemo(
    () =>
      [...(data.poinBerkas && data.poinBerkas.length > 0 ? data.poinBerkas : DEFAULT_POIN_BERKAS)].sort(
        (a, b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0)
      ),
    [data.poinBerkas]
  );

  const filtered = data.guru.filter((g) => {
    const q = search.trim().toLowerCase();
    const matchText =
      !q ||
      g.namaGuru.toLowerCase().includes(q) ||
      g.nip.toLowerCase().includes(q) ||
      g.mataPelajaran.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'Semua' || g.statusBerkas === filterStatus;
    return matchText && matchStatus;
  });

  function openVerify(g: GuruRecord) {
    const nextChecklist: Record<string, StatusPoinBerkas> = {};
    if (g.cekBerkas && Object.keys(g.cekBerkas).length > 0) {
      poinList.forEach((p) => {
        const st = g.cekBerkas?.[p.id];
        if (st === 'Ada' || st === 'Tidak Ada') {
          nextChecklist[p.id] = st;
        }
      });
    } else if (g.statusBerkas === 'Disetujui') {
      poinList.forEach((p) => {
        nextChecklist[p.id] = 'Ada';
      });
    }
    setChecklist(nextChecklist);
    setEditingRow(g);
    setCatatan(g.catatanKepsek || '');
  }

  function setPoinStatus(poinId: string, status: StatusPoinBerkas) {
    setChecklist((prev) => ({ ...prev, [poinId]: status }));
  }

  const allAda = poinList.length > 0 && poinList.every((p) => checklist[p.id] === 'Ada');
  const hasTidakAda = poinList.some((p) => checklist[p.id] === 'Tidak Ada');
  const showCatatan = allAda || hasTidakAda;
  const adaCount = poinList.filter((p) => checklist[p.id] === 'Ada').length;

  async function submitDecision(statusBerkas: 'Disetujui' | 'Ditolak') {
    if (!editingRow) return;
    if (statusBerkas === 'Disetujui' && !allAda) {
      onError('Seluruh poin pemeriksaan harus ditandai "Ada" sebelum menyetujui berkas.');
      return;
    }
    if (statusBerkas === 'Ditolak' && !hasTidakAda) {
      onError('Penolakan hanya tersedia jika ada minimal satu poin yang ditandai "Tidak Ada".');
      return;
    }

    const computedKelengkapan: KelengkapanBerkas = allAda ? 'Ada' : 'Belum Ada';
    const cleanedChecklist: Record<string, StatusPoinBerkas> = {};
    poinList.forEach((p) => {
      const val = checklist[p.id];
      if (val === 'Ada' || val === 'Tidak Ada') {
        cleanedChecklist[p.id] = val;
      }
    });

    setSubmitting(true);
    try {
      const updated = await verifikasiKepsekClient(
        editingRow.id,
        computedKelengkapan,
        statusBerkas,
        catatan,
        cleanedChecklist
      );
      const nama = editingRow.namaGuru;
      setEditingRow(null);
      await onActionSuccess(
        updated,
        `Status berkas ${nama} diperbarui menjadi "${statusBerkas}".`
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan keputusan verifikasi.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            {mode === 'kepsek'
              ? 'Persetujuan Kesiapan Berkas Guru'
              : 'Monitoring Berkas Kesiapan Guru'}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {mode === 'kepsek'
              ? 'Periksa tautan Google Drive guru per poin instrumen kelengkapan, lalu setujui atau tolak berkas agar Pengawas Supervisi dapat menilai.'
              : 'Pemantauan tautan perangkat ajar Google Drive guru beserta status validasi Kepala Sekolah.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, NIP, mapel..."
              className="pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(['Semua', 'Belum Dicek', 'Disetujui', 'Ditolak'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  filterStatus === st
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Guru & NIP</th>
                <th className="py-3 px-4">Mata Pelajaran</th>
                <th className="py-3 px-4">Tautan Google Drive</th>
                <th className="py-3 px-4">Kelengkapan</th>
                <th className="py-3 px-4">Status Validasi</th>
                <th className="py-3 px-4">Catatan Kepala Sekolah</th>
                {mode === 'kepsek' && <th className="py-3 px-4 text-right">Verifikasi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={mode === 'kepsek' ? 7 : 6} className="py-8 px-4 text-center text-slate-500">
                    Tidak ada data berkas yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filtered.map((g) => {
                  const checkedMap = g.cekBerkas || {};
                  const checkedAda = poinList.filter((p) => checkedMap[p.id] === 'Ada').length;
                  const missingNames = poinList
                    .filter((p) => checkedMap[p.id] === 'Tidak Ada')
                    .map((p) => p.nama);
                  const hasAnyChecked = Object.keys(checkedMap).length > 0;

                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{g.namaGuru}</div>
                        <div className="text-xs text-slate-500 font-mono-tabular">{g.nip}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">{g.mataPelajaran}</td>
                      <td className="py-3 px-4">
                        {g.linkDriveBerkas ? (
                          <a
                            href={g.linkDriveBerkas}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span>Buka Berkas Drive</span>
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">Belum diunggah</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-medium text-slate-800">{g.kelengkapanBerkas}</div>
                        {hasAnyChecked && poinList.length > 0 && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {checkedAda}/{poinList.length} poin ada
                            {missingNames.length > 0 && (
                              <span className="text-red-600 block">
                                Kurang: {missingNames.join(', ')}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {g.statusBerkas === 'Disetujui' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            Disetujui
                          </span>
                        )}
                        {g.statusBerkas === 'Belum Dicek' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            Belum Dicek
                          </span>
                        )}
                        {g.statusBerkas === 'Ditolak' && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            Ditolak
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        {g.catatanKepsek || '-'}
                      </td>
                      {mode === 'kepsek' && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openVerify(g)}
                            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 whitespace-nowrap"
                          >
                            Periksa & Putuskan
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verification Modal */}
      {editingRow && mode === 'kepsek' && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 shrink-0">
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Verifikasi Kesiapan Berkas
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editingRow.namaGuru} · {editingRow.mataPelajaran}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-1">
                  Tautan Google Drive Guru
                </div>
                {editingRow.linkDriveBerkas ? (
                  <a
                    href={editingRow.linkDriveBerkas}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline break-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    <span>{editingRow.linkDriveBerkas}</span>
                  </a>
                ) : (
                  <p className="text-xs text-red-600">Guru belum mengunggah tautan Google Drive.</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Pemeriksaan Poin Kelengkapan Berkas
                  </label>
                  <span className="text-[11px] font-mono-tabular text-slate-500">
                    {adaCount}/{poinList.length} Ada
                  </span>
                </div>

                {poinList.length === 0 ? (
                  <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-800">
                    Belum ada poin pemeriksaan berkas. Tambahkan terlebih dahulu melalui menu{' '}
                    <strong>Poin Periksa Berkas</strong> pada peran Admin.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {poinList.map((poin, idx) => {
                      const status = checklist[poin.id];
                      return (
                        <div
                          key={poin.id}
                          className="p-3 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-900">
                              {idx + 1}. {poin.nama}
                            </div>
                            {poin.deskripsi && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {poin.deskripsi}
                              </div>
                            )}
                          </div>
                          <div className="inline-flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPoinStatus(poin.id, 'Ada')}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                status === 'Ada'
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              Ada
                            </button>
                            <button
                              type="button"
                              onClick={() => setPoinStatus(poin.id, 'Tidak Ada')}
                              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                                status === 'Tidak Ada'
                                  ? 'bg-red-600 text-white border-red-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                              }`}
                            >
                              Tidak Ada
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {!showCatatan && poinList.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Pilih <strong>Ada</strong> atau <strong>Tidak Ada</strong> pada poin pemeriksaan di
                  atas. Jika semua poin <strong>Ada</strong>, tombol <strong>Setujui Berkas</strong>{' '}
                  dan <strong>Catatan Kepala Sekolah</strong> akan muncul. Jika salah satu poin{' '}
                  <strong>Tidak Ada</strong>, tombol <strong>Tolak Berkas</strong> dan{' '}
                  <strong>Catatan Kepala Sekolah</strong> akan muncul.
                </div>
              )}

              {showCatatan && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    {allAda
                      ? 'Catatan Kepala Sekolah (Opsional)'
                      : 'Catatan Kepala Sekolah (Alasan Penolakan / Berkas yang Perlu Dilengkapi)'}
                  </label>
                  <textarea
                    rows={3}
                    value={catatan}
                    onChange={(e) => setCatatan(e.target.value)}
                    placeholder={
                      allAda
                        ? 'Tuliskan catatan persetujuan berkas...'
                        : 'Tuliskan berkas yang belum tersedia agar guru dapat melengkapi...'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50/60 rounded-b-xl">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Batal
              </button>
              {hasTidakAda && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitDecision('Ditolak')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Tolak Berkas</span>
                </button>
              )}
              {allAda && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => submitDecision('Disetujui')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Setujui Berkas</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
