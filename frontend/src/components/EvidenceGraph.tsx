import { useMemo, useState } from "react";
import { Building2, FileText, GitBranch, ScrollText, Scale, UserCheck } from "lucide-react";
import type { GraphEdge, GraphNode } from "../lib/types";

const LAYER: Record<GraphNode["kind"], number> = {
  institution: 0, application: 1, document: 2, field: 3, rule: 4, finding: 5,
};
const LAYER_LABELS = ["Institution", "Application", "Document", "Field", "Rule", "Finding"];
const KIND_ICON = { institution: Building2, application: ScrollText, document: FileText, field: GitBranch, rule: Scale, finding: UserCheck };
const STATUS_COLOR: Record<GraphNode["status"], string> = {
  neutral: "#608afa", pass: "#12b783", warning: "#f59e0b", critical: "#ef4444",
};

export function EvidenceGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const byLayer: GraphNode[][] = [[], [], [], [], [], []];
    nodes.forEach((n) => byLayer[LAYER[n.kind]].push(n));
    const colW = 220, rowH = 64, padX = 20, padY = 30;
    const maxRows = Math.max(1, ...byLayer.map((l) => l.length));
    const pos: Record<string, { x: number; y: number }> = {};
    byLayer.forEach((layerNodes, li) => {
      const offset = (maxRows - layerNodes.length) / 2;
      layerNodes.forEach((n, ri) => { pos[n.id] = { x: padX + li * colW, y: padY + (ri + offset) * rowH }; });
    });
    return { pos, width: padX * 2 + 5 * colW + 160, height: padY * 2 + maxRows * rowH, byLayer };
  }, [nodes]);

  const connected = useMemo(() => {
    if (!hover) return null;
    const set = new Set<string>([hover]);
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((e) => {
        if (set.has(e.from) && !set.has(e.to)) { set.add(e.to); changed = true; }
        if (set.has(e.to) && !set.has(e.from)) { set.add(e.from); changed = true; }
      });
    }
    return set;
  }, [hover, edges]);

  if (!nodes.length) return <p className="text-sm text-navy-400">No evidence relationships to display.</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-navy-500">
        {LAYER_LABELS.map((l, i) => <span key={l} className="flex items-center gap-1"><span className="font-bold text-navy-400">{i + 1}.</span>{l}</span>)}
      </div>
      <div className="overflow-auto rounded-2xl border border-navy-100 bg-navy-50/40 p-2">
        <svg width={layout.width} height={layout.height} className="min-w-full" role="img" aria-label="Evidence relationship graph">
          {edges.map((e, i) => {
            const a = layout.pos[e.from], b = layout.pos[e.to];
            if (!a || !b) return null;
            const active = !connected || (connected.has(e.from) && connected.has(e.to));
            const x1 = a.x + 170, x2 = b.x;
            return (
              <path key={i} d={`M ${x1} ${a.y + 18} C ${x1 + 26} ${a.y + 18}, ${x2 - 26} ${b.y + 18}, ${x2} ${b.y + 18}`}
                fill="none" stroke={active ? "#9fb4d8" : "#e3e9f5"} strokeWidth={active ? 1.6 : 1} opacity={active ? 0.9 : 0.4} />
            );
          })}
          {nodes.map((n) => {
            const p = layout.pos[n.id];
            const Icon = KIND_ICON[n.kind];
            const color = STATUS_COLOR[n.status];
            const dim = connected && !connected.has(n.id);
            return (
              <g key={n.id} transform={`translate(${p.x}, ${p.y})`} opacity={dim ? 0.35 : 1}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <rect width={170} height={36} rx={10} fill="white" stroke={color} strokeWidth={n.status === "neutral" ? 1 : 2} />
                <rect width={4} height={36} rx={2} fill={color} />
                <foreignObject x={10} y={4} width={156} height={30}>
                  <div className="flex h-full items-center gap-1.5">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <span className="truncate text-[11px] font-semibold text-navy-800" title={n.label}>{n.label}</span>
                  </div>
                </foreignObject>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-xs text-navy-400">Hover a node to trace its connected evidence path. Red = critical rule, amber = warning, green = pass.</p>
    </div>
  );
}
