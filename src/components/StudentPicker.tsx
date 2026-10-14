import { useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import type { StudentRow } from "../lib/types";

/**
 * Pilih siswa dengan mengetik NIS atau nama (autocomplete dari config/students).
 * `multiple` -> beberapa siswa sekaligus (chip); selain itu hanya satu.
 */
export default function StudentPicker({ students, value, onChange, multiple = false, placeholder = "Ketik NIS atau nama siswa..." }: {
  students: StudentRow[]; value: string[]; onChange: (nis: string[]) => void; multiple?: boolean; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [aktif, setAktif] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const byNis = useMemo(() => new Map(students.map((s) => [s.nis, s])), [students]);

  const hasil = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return [];
    return students.filter((s) => !value.includes(s.nis) && (s.nis.includes(qq) || s.nama.toLowerCase().includes(qq))).slice(0, 8);
  }, [q, students, value]);

  const pilih = (s: StudentRow) => {
    onChange(multiple ? [...value, s.nis] : [s.nis]);
    setQ(""); setOpen(false); setAktif(0);
    if (multiple) inputRef.current?.focus();
  };

  const terpilih = value.map((n) => byNis.get(n)).filter((s): s is StudentRow => Boolean(s));
  const sembunyiInput = !multiple && terpilih.length > 0;

  return (
    <div className="picker">
      {terpilih.length > 0 && (
        <div className="picker-chips">
          {terpilih.map((s) => (
            <span className="picker-chip" key={s.nis}>
              <span><b>{s.nama}</b><small>{s.nis} · {s.kelas}</small></span>
              <button type="button" aria-label={`Hapus ${s.nama}`} onClick={() => onChange(value.filter((n) => n !== s.nis))}><Icon name="x" size={14} /></button>
            </span>
          ))}
        </div>
      )}
      {!sembunyiInput && (
        <div className="picker-box">
          <input ref={inputRef} className="text-input" value={q} placeholder={placeholder} autoComplete="off"
            onChange={(e) => { setQ(e.target.value); setOpen(true); setAktif(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setAktif((a) => Math.min(a + 1, hasil.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAktif((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && open && hasil[aktif]) { e.preventDefault(); pilih(hasil[aktif]); }
            }} />
          {open && q.trim() && (
            <ul className="picker-list" role="listbox">
              {hasil.length === 0 ? <li className="picker-empty">Siswa tidak ditemukan</li> : hasil.map((s, i) => (
                <li key={s.nis} role="option" aria-selected={i === aktif} className={i === aktif ? "active" : ""}
                  onMouseDown={(e) => { e.preventDefault(); pilih(s); }}>
                  <b>{s.nama}</b><small>{s.nis} · {s.kelas}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
