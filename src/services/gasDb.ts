import type {
  AppDatabasePayload,
  AspekItem,
  GuruRecord,
  KelengkapanBerkas,
  PengaturanSekolah,
  PoinBerkasItem,
  StatusBerkas,
  StatusPoinBerkas,
  TahapSupervisi,
  UserAccount,
  UserRole,
} from '../types';

const GAS_URL_STORAGE_KEY = 'sadig_gas_web_app_url_v1';
const ENV_GAS_URL = (import.meta.env.VITE_GAS_WEB_APP_URL as string | undefined)?.trim() || '';

export function isValidGasUrl(rawUrl: string): boolean {
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'script.google.com' ||
        parsed.hostname.endsWith('.googleusercontent.com'))
    );
  } catch {
    return false;
  }
}

export function getGasWebAppUrl(): string {
  try {
    const stored = localStorage.getItem(GAS_URL_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // ignore storage errors
  }
  return ENV_GAS_URL;
}

export function setGasWebAppUrl(url: string): void {
  const trimmed = url.trim();
  try {
    if (!trimmed) {
      localStorage.removeItem(GAS_URL_STORAGE_KEY);
    } else {
      localStorage.setItem(GAS_URL_STORAGE_KEY, trimmed);
    }
  } catch {
    // ignore storage errors
  }
}

export function isGasConfigured(): boolean {
  return isValidGasUrl(getGasWebAppUrl());
}

interface GasApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  user?: UserAccount;
  count?: number;
  namaSekolah?: string;
  spreadsheetName?: string;
}

async function callGasGet<T>(action: string, overrideUrl?: string): Promise<GasApiResponse<T>> {
  const baseUrl = (overrideUrl ?? getGasWebAppUrl()).trim();
  if (!isValidGasUrl(baseUrl)) {
    throw new Error('URL Web App Google Apps Script tidak valid.');
  }

  const target = new URL(baseUrl);
  target.searchParams.set('action', action);

  try {
    const res = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
    });
    const text = await res.text();
    return parseGasJson<T>(text);
  } catch (err) {
    // Fallback via backend proxy if direct browser request is blocked
    const proxyRes = await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: target.toString(), method: 'GET' }),
    }).catch(() => null);

    if (proxyRes && proxyRes.ok) {
      const text = await proxyRes.text();
      return parseGasJson<T>(text);
    }
    throw err instanceof Error ? err : new Error('Gagal terhubung ke Web App Google Apps Script.');
  }
}

async function callGasPost<T>(
  action: string,
  data: Record<string, unknown> = {},
  overrideUrl?: string
): Promise<GasApiResponse<T>> {
  const baseUrl = (overrideUrl ?? getGasWebAppUrl()).trim();
  if (!isValidGasUrl(baseUrl)) {
    throw new Error('URL Web App Google Apps Script tidak valid.');
  }

  const payload = JSON.stringify({ action, data });

  try {
    // Use text/plain to avoid CORS preflight OPTIONS requests rejected by Google Apps Script
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload,
      redirect: 'follow',
    });
    const text = await res.text();
    return parseGasJson<T>(text);
  } catch (err) {
    const proxyRes = await fetch('/api/gas-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, method: 'POST', payload: { action, data } }),
    }).catch(() => null);

    if (proxyRes && proxyRes.ok) {
      const text = await proxyRes.text();
      return parseGasJson<T>(text);
    }
    throw err instanceof Error ? err : new Error('Gagal mengirim data ke Google Apps Script.');
  }
}

function parseGasJson<T>(text: string): GasApiResponse<T> {
  const trimmed = text.trim();
  if (trimmed.startsWith('<')) {
    throw new Error(
      'Web App Apps Script mengembalikan HTML (kemungkinan akses belum disetel ke "Siapa saja / Anyone" atau perlu login Google).'
    );
  }
  try {
    return JSON.parse(trimmed) as GasApiResponse<T>;
  } catch {
    throw new Error('Respons dari Google Apps Script bukan JSON yang valid.');
  }
}

export async function testGasConnection(
  url: string
): Promise<{ success: boolean; message: string; namaSekolah?: string; spreadsheetName?: string }> {
  if (!isValidGasUrl(url)) {
    return {
      success: false,
      message: 'URL harus diawali https://script.google.com/macros/s/.../exec',
    };
  }
  const res = await callGasGet('ping', url);
  if (!res.success) {
    return {
      success: false,
      message: res.message || 'Gagal terhubung ke Web App Apps Script.',
    };
  }
  return {
    success: true,
    message: res.message || 'Terhubung ke Google Sheets via Apps Script.',
    namaSekolah: res.namaSekolah,
    spreadsheetName: res.spreadsheetName,
  };
}

export async function fetchGasState(): Promise<AppDatabasePayload> {
  const res = await callGasGet<AppDatabasePayload>('state');
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal memuat data dari Google Apps Script.');
  }
  return res.data;
}

export async function loginWithGas(
  identifier: string,
  password: string
): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
  const res = await callGasPost('login', { identifier, password });
  return {
    success: res.success,
    user: res.user,
    message: res.message,
  };
}

export async function quickLoginGas(
  role: UserRole
): Promise<{ success: boolean; user?: UserAccount; message?: string }> {
  const res = await callGasPost('quickLogin', { role });
  return {
    success: res.success,
    user: res.user,
    message: res.message,
  };
}

export async function saveGuruGas(input: Partial<GuruRecord>): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('saveGuru', input as Record<string, unknown>);
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan data guru ke Spreadsheet.');
  }
  return res.data;
}

export async function bulkImportGuruGas(
  items: Array<Partial<GuruRecord>>,
  defaultDate: string
): Promise<{ data: AppDatabasePayload; count?: number }> {
  const res = await callGasPost<AppDatabasePayload>('bulkImportGuru', { items, defaultDate });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal mengimpor CSV guru ke Spreadsheet.');
  }
  return { data: res.data, count: res.count };
}

export async function deleteGuruGas(id: string): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('deleteGuru', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menghapus guru dari Spreadsheet.');
  }
  return res.data;
}

export async function uploadBerkasGuruGas(
  idGuru: string,
  linkDriveBerkas: string
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('uploadBerkasGuru', {
    idGuru,
    linkDriveBerkas,
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan tautan berkas ke Spreadsheet.');
  }
  return res.data;
}

export async function verifikasiKepsekGas(
  idGuru: string,
  kelengkapanBerkas: KelengkapanBerkas,
  statusBerkas: StatusBerkas,
  catatanKepsek: string,
  cekBerkas?: Record<string, StatusPoinBerkas>
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('verifikasiKepsek', {
    idGuru,
    kelengkapanBerkas,
    statusBerkas,
    catatanKepsek,
    cekBerkas: cekBerkas || {},
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal memperbarui verifikasi Kepala Sekolah.');
  }
  return res.data;
}

export async function savePoinBerkasGas(
  input: Partial<PoinBerkasItem>
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>(
    'savePoinBerkas',
    input as Record<string, unknown>
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan poin berkas ke Spreadsheet.');
  }
  return res.data;
}

export async function deletePoinBerkasGas(id: string): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('deletePoinBerkas', { id });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menghapus poin berkas dari Spreadsheet.');
  }
  return res.data;
}

export async function savePenilaianGas(params: {
  guru: GuruRecord;
  tahap: TahapSupervisi;
  items: Array<{
    idAspek: string;
    skor: 1 | 2 | 3 | 4 | null;
    teksRefleksi?: string;
    catatan: string;
  }>;
  masalah: string;
  pemecahan: string;
  rencanaTL: string;
  penilai: string;
}): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('savePenilaian', {
    guru: params.guru,
    guruId: params.guru.id,
    nipGuru: params.guru.nip,
    tahap: params.tahap,
    items: params.items,
    masalah: params.masalah,
    pemecahan: params.pemecahan,
    rencanaTL: params.rencanaTL,
    penilai: params.penilai,
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan penilaian ke Spreadsheet.');
  }
  return res.data;
}

export async function saveAspekGas(
  tahap: TahapSupervisi,
  input: Partial<AspekItem>
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('saveAspek', {
    ...input,
    tahap,
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan aspek ke Spreadsheet.');
  }
  return res.data;
}

export async function seedBkAspekGas(): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('seedBkAspek', {});
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal memuat template instrumen BK ke Spreadsheet.');
  }
  return res.data;
}

export async function deleteAspekGas(
  tahap: TahapSupervisi,
  id: string
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('deleteAspek', { tahap, id });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menghapus aspek dari Spreadsheet.');
  }
  return res.data;
}

export async function saveDirectoryUserGas(
  input: Partial<UserAccount> & { oldUsername?: string }
): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('saveUser', input as Record<string, unknown>);
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan pengguna ke Spreadsheet.');
  }
  return res.data;
}

export async function deleteDirectoryUserGas(user: UserAccount): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>('deleteUser', {
    username: user.username,
    id: user.id || '',
  });
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menghapus pengguna dari Spreadsheet.');
  }
  return res.data;
}

export async function savePengaturanGas(input: PengaturanSekolah): Promise<AppDatabasePayload> {
  const res = await callGasPost<AppDatabasePayload>(
    'savePengaturan',
    input as unknown as Record<string, unknown>
  );
  if (!res.success || !res.data) {
    throw new Error(res.message || 'Gagal menyimpan pengaturan ke Spreadsheet.');
  }
  return res.data;
}
