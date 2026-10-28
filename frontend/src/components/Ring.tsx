export function Ring({ percent, size = 76 }: { percent: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3e9f5" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#12b783" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-extrabold text-navy-900">{percent}%</span>
    </div>
  );
}
