"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/i18n/client";

const BRAND = "#187a6b";
const ACCENT = "#f59e0b";
const SERIES = [BRAND, ACCENT, "#6366f1", "#e11d48", "#0ea5e9"];

export function TrendChart({ data, series, height = 240 }: { data: Record<string, string | number>[]; series: { key: string; label: string }[]; height?: number }) {
  const { num, locale } = useI18n();
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[i]} stopOpacity={0.25} />
                <stop offset="100%" stopColor={SERIES[i]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#eef0f3" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={24}
            tickFormatter={(d: string) => new Date(d).toLocaleDateString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-SA", { day: "numeric", month: "short" })} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => num(v, 0)} />
          <Tooltip formatter={(v) => num(Number(v))} labelFormatter={(d) => new Date(String(d)).toLocaleDateString(locale === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-SA")} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={SERIES[i]} fill={`url(#g-${s.key})`} strokeWidth={2} isAnimationActive={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, x, series, height = 260, money }: { data: Record<string, unknown>[]; x: string; series: { key: string; label: string }[]; height?: number; money?: boolean }) {
  const { num, money: m } = useI18n();
  const fmt = (v: number) => (money ? m(v, true) : num(v, 1));
  return (
    <div style={{ height }} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eef0f3" vertical={false} />
          <XAxis dataKey={x} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} />
          <Tooltip formatter={(v) => fmt(Number(v))} />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal bar list rendered with plain HTML (RTL-friendly, no chart library). */
export function BarList({ items, format }: { items: { label: string; value: number; sub?: string }[]; format?: "money" | "number" }) {
  const { num, money } = useI18n();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{it.label}</span>
            <span className="tnum shrink-0 font-medium text-slate-900">{format === "money" ? money(it.value) : num(it.value)}{it.sub ? <span className="ms-1 text-xs font-normal text-slate-500">{it.sub}</span> : null}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${(it.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
