'use client';

/**
 * Small presentational building blocks shared across the side panel.
 */

import { Badge } from '@/components/ui/badge';
import type { Hypothesis } from '@/lib/science/types';

export function MicroLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#8A837B]">{children}</div>;
}

export function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <MicroLabel>{label}</MicroLabel>
      <div className="mt-0.5 font-mono text-[13px] tabular-nums text-[#1C1A17]">{value}</div>
    </div>
  );
}

export function DataClassBadge({ dataClass, mode }: { dataClass: 'real' | 'synthetic' | 'derived'; mode: 'quantitative' | 'evidence' }) {
  if (dataClass === 'synthetic') {
    return (
      <span className="inline-flex items-center rounded-full border border-[#B0714E] bg-[#F7EBE2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8F4A2B]">
        Synthetic fixture
      </span>
    );
  }
  if (mode === 'evidence') {
    return (
      <span className="inline-flex items-center rounded-full border border-[#B08D57] bg-[#F7F2E7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#7A6438]">
        Real · evidence mode
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-[#2C5F58] bg-[#EDF4F1] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#2C5F58]">
      Real measurement
    </span>
  );
}

const STATUS_STYLES: Record<Hypothesis['status'], { cls: string; label: string }> = {
  supported: { cls: 'border-[#2C5F58] bg-[#2C5F58] text-white', label: 'supported' },
  consistent: { cls: 'border-[#4C7A5A] text-[#4C7A5A]', label: 'consistent' },
  plausible: { cls: 'border-[#B08D57] text-[#7A6438]', label: 'plausible' },
  'insufficient-evidence': { cls: 'border-[#8A837B] text-[#6F6862]', label: 'insufficient evidence' },
  'not-supported': { cls: 'border-[#9E3B2C] text-[#9E3B2C]', label: 'not supported' },
};

export function HypothesisStatusBadge({ status }: { status: Hypothesis['status'] }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function fmtDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 16).replace('T', ' ') + ' UTC';
}

export function fmtMm(m: number | undefined, digits = 1): string {
  if (m === undefined || Number.isNaN(m)) return '—';
  return `${(m * 1000).toFixed(digits)} mm`;
}

export function fmtKm2(k: number | undefined, digits = 0): string {
  if (k === undefined || Number.isNaN(k)) return '—';
  return `${k.toFixed(digits)} km²`;
}

export { Badge };
