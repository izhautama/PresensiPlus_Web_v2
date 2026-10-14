export type Student = { nis: string; nama: string; kelas: string };
export type StudentRow = Student & { uid: string };

export type Jenis = "Masuk" | "Terlambat" | "Pulang";
export type ScheduleRow = { kelas: string; hari: string; jenis: Jenis; mulai: string; selesai: string };

/** Keterangan harian. Dispensasi = siswa mewakili sekolah (lomba, dsb.) dan DIHITUNG HADIR dalam persentase. */
export type KetHarian = "Izin" | "Sakit" | "Dispensasi";

/** /attendance/{nis}/{tanggal} */
export type DayRecord = {
  masuk?: string;
  status?: "Hadir" | "Terlambat";
  pulang?: string;
  ket?: KetHarian;
  catatan?: string;
};

/** /log/{tanggal}/{UID}_{M|P} */
export type LogEntry = { jam: string; nis: string; nama?: string; kelas?: string; status: string };

export type DeviceStatus = {
  lastSeen?: number;
  ip?: string;
  rssi?: number;
  ssid?: string;
  heap?: number;
  heapMin?: number;
  antrian?: number;
  dead?: number;
  ditolak?: number;
  kartu?: number;
  jadwal?: number;
  versiData?: number;
  firmware?: string;
  uptime?: number;
  ntp?: boolean;
  rfid?: boolean;
  flashUsed?: number;
  flashTotal?: number;
  lastSync?: number;
};

export type CommandName = "restart" | "sync" | "buzzer" | "lcd" | "diagnostik";
export type Ack = { ok: boolean; hasil?: string; detail?: Record<string, unknown>; ts?: number };
export type DeviceEvent = { ts: number; jenis: string; detail?: string };

/** Kategori kehadiran 1 siswa pada 1 hari */
export type Kategori = "Hadir" | "Terlambat" | "Izin" | "Sakit" | "Dispensasi" | "Alpha" | "Belum Tap" | "Libur" | "Mendatang";
