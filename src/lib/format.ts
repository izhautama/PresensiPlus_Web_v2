export const fmtBytes = (n?: number) => (n == null ? "-" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export const fmtUptime = (s?: number) => {
  if (s == null) return "-";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d} hr ${h} j` : h ? `${h} j ${m} m` : `${m} menit`;
};
