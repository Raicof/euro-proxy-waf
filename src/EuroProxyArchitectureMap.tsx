import React, { useMemo, useState } from "react";
import {
    Shield,
    Globe,
    KeyRound,
    Lock,
    AlertTriangle,
    ChevronRight,
    BadgeCheck,
    Ban,
    Link2,
} from "lucide-react";

/**
 * DIY Euro-Proxy Mentor — Animated Traffic Flow Map (Readable)
 *
 * Goals implemented:
 * - Black background
 * - Full-width diagram (no max-width constraint)
 * - Explicit color map (legend) with visible swatches
 * - 4 anchor points (ports) per box (top/right/bottom/left)
 * - Flows connect ONLY to ports and route via "bus lanes" to avoid cutting through boxes
 * - Extra viewBox padding + SVG overflow visible to prevent box shadows being clipped
 */

// ------------------------
// Types + geometry helpers
// ------------------------
type Pt = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number }; // x,y = top-left

type Side = "top" | "right" | "bottom" | "left";

export function buildLinePath(from: Pt, to: Pt) {
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}

export function midpoint(from: Pt, to: Pt) {
    return { x: from.x + (to.x - from.x) * 0.5, y: from.y + (to.y - from.y) * 0.5 };
}

export function rectCenter(r: Rect): Pt {
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectEdges(r: Rect) {
    return {
        left: r.x,
        right: r.x + r.w,
        top: r.y,
        bottom: r.y + r.h,
    };
}

export function anchorPoint(r: Rect, side: Side): Pt {
    const c = rectCenter(r);
    const e = rectEdges(r);
    switch (side) {
        case "top":
            return { x: c.x, y: e.top };
        case "right":
            return { x: e.right, y: c.y };
        case "bottom":
            return { x: c.x, y: e.bottom };
        case "left":
            return { x: e.left, y: c.y };
        default:
            return c;
    }
}

export function standoff(p: Pt, side: Side, d: number): Pt {
    switch (side) {
        case "top":
            return { x: p.x, y: p.y - d };
        case "right":
            return { x: p.x + d, y: p.y };
        case "bottom":
            return { x: p.x, y: p.y + d };
        case "left":
            return { x: p.x - d, y: p.y };
        default:
            return p;
    }
}

export function buildPolylinePath(points: Pt[]) {
    if (points.length < 2) return "";
    const [first, ...rest] = points;
    return `M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y}`).join(" ");
}

// ------------------------
// UI primitives
// ------------------------
const Pill = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950/40 px-2.5 py-1 text-xs font-medium text-slate-200 shadow-sm backdrop-blur">
        {children}
    </span>
);

const StepChip = ({
    n,
    label,
    active,
    onClick,
}: {
    n: number;
    label: string;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={
            "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition " +
            (active
                ? "border-slate-200 bg-slate-100 text-slate-900"
                : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-600")
        }
    >
        <span
            className={
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] transition " +
                (active ? "bg-slate-900/10" : "bg-slate-800 text-slate-200 group-hover:bg-slate-700")
            }
        >
            {n}
        </span>
        <span className="whitespace-nowrap">{label}</span>
    </button>
);

const Toggle = ({
    label,
    active,
    onClick,
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={
            "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition " +
            (active
                ? "border-slate-200 bg-slate-100 text-slate-900"
                : "border-slate-700 bg-slate-950/40 text-slate-200 hover:border-slate-600")
        }
    >
        <span className={"inline-block h-2 w-2 rounded-full " + (active ? "bg-slate-900" : "bg-slate-500")} />
        <span>{label}</span>
    </button>
);

function ArrowLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-full border border-slate-700 bg-slate-950/75 px-3 py-1 text-xs text-slate-200 shadow-sm backdrop-blur">
            {children}
        </div>
    );
}

// ------------------------
// SVG: ports + flows
// ------------------------
function PortDots({ rect }: { rect: Rect }) {
    const ports: Array<{ side: Side; p: Pt }> = [
        { side: "top", p: anchorPoint(rect, "top") },
        { side: "right", p: anchorPoint(rect, "right") },
        { side: "bottom", p: anchorPoint(rect, "bottom") },
        { side: "left", p: anchorPoint(rect, "left") },
    ];

    return (
        <>
            {ports.map(({ side, p }) => (
                <g key={side}>
                    <circle cx={p.x} cy={p.y} r={6} fill="rgba(148,163,184,0.14)" />
                    <circle cx={p.x} cy={p.y} r={3} fill="rgba(226,232,240,0.92)" />
                </g>
            ))}
        </>
    );
}

function Flow({
    id,
    points,
    label,
    labelPos,
    stroke,
    packetFill,
    dashed = true,
    show = true,
    bidirectional = false,
    packets = 2,
    durationSec = 3,
    markerEnd,
}: {
    id: string;
    points: Pt[];
    label: React.ReactNode;
    labelPos: Pt;
    stroke: string;
    packetFill: string;
    dashed?: boolean;
    show?: boolean;
    bidirectional?: boolean;
    packets?: number;
    durationSec?: number;
    markerEnd?: string;
}) {
    if (!show) return null;

    const d = buildPolylinePath(points);
    const rev = buildPolylinePath(points.slice().reverse());

    const makePackets = (path: string, key: string, extraDelay: number) =>
        Array.from({ length: packets }).map((_, i) => {
            const begin = extraDelay + (i * durationSec) / packets;
            const beginStr = `${begin.toFixed(2)}s`;
            const durStr = `${durationSec.toFixed(2)}s`;
            return (
                <circle key={`${id}-${key}-${i}`} r={5} fill={packetFill} opacity={0.95}>
                    <animateMotion dur={durStr} repeatCount="indefinite" begin={beginStr} path={path} />
                    <animate attributeName="opacity" values="0;1;1;0" dur={durStr} repeatCount="indefinite" begin={beginStr} />
                </circle>
            );
        });

    return (
        <>
            <path
                id={id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray={dashed ? "10 10" : undefined}
                markerEnd={markerEnd}
            >
                {dashed ? <animate attributeName="stroke-dashoffset" values="40;0" dur="1.1s" repeatCount="indefinite" /> : null}
                <animate attributeName="opacity" values="0.55;1;0.55" dur="2.2s" repeatCount="indefinite" />
            </path>

            {makePackets(d, "fwd", 0)}
            {bidirectional ? makePackets(rev, "rev", durationSec * 0.35) : null}

            <foreignObject x={labelPos.x - 120} y={labelPos.y - 18} width={240} height={36}>
                <div className="flex items-center justify-center">{label}</div>
            </foreignObject>
        </>
    );
}

// ------------------------
// Main component
// ------------------------
export default function EuroProxyArchitectureMap() {
    const [focus, setFocus] = useState<1 | 2 | 3 | 4 | 5 | 6>(6);
    const [overviewMode, setOverviewMode] = useState(true);

    const steps = useMemo(
        () => [
            { n: 1 as const, label: "Hardening" },
            { n: 2 as const, label: "WireGuard tunnel" },
            { n: 3 as const, label: "Lock the Vault" },
            { n: 4 as const, label: "Custom DNS" },
            { n: 5 as const, label: "Proxy + WAF" },
            { n: 6 as const, label: "CrowdSec" },
        ],
        []
    );

    const focusCopy: Record<number, { title: string; body: string }> = {
        1: {
            title: "Phase 1: Procurement & Hardening",
            body: "We lock down SSH and firewalls first. The Bouncer is the only public-facing door, so it must be hardened. The Vault is stricter: no public web traffic, only private tunnel traffic.",
        },
        2: {
            title: "Phase 2: The Secret Tunnel",
            body: "WireGuard is the private hallway between the Bouncer and the Vault. They speak over an encrypted channel using internal IPs like 10.0.0.1 and 10.0.0.2.",
        },
        3: {
            title: "Phase 3: Locking The Vault",
            body: "The Vault becomes unreachable from the public Internet. Its firewall drops public inbound web traffic. Only the Bouncer can reach it through WireGuard.",
        },
        4: {
            title: "Phase 4: Custom Nameservers",
            body: "We publish glue records so the world can reach ns1/ns2.securelounge.co.uk. Then we run authoritative DNS on Node A.",
        },
        5: {
            title: "Phase 5: Reverse Proxy & WAF",
            body: "BunkerWeb is the bouncer at the door: it receives HTTPS, filters traffic, and forwards clean requests through the tunnel to the Vault.",
        },
        6: {
            title: "Phase 6: Active Defense",
            body: "CrowdSec watches Node A logs, detects hostile behavior, and bans attackers. Node A stays the only visible public surface.",
        },
    };

    // Wider canvas (prevents clipping)
    const view = { w: 1600, h: 780 };

    // Box layout (more spacing; nothing near edges)
    const internet: Rect = { x: 90, y: 160, w: 340, h: 210 };
    const bouncer: Rect = { x: 480, y: 350, w: 540, h: 320 };
    const vault: Rect = { x: 1060, y: 350, w: 540, h: 320 };
    const ca: Rect = { x: 1180, y: 70, w: 360, h: 160 };

    const show = {
        hardening: overviewMode || focus >= 1,
        wireguard: overviewMode || focus >= 2,
        lockVault: overviewMode || focus >= 3,
        dns: overviewMode || focus >= 4,
        waf: overviewMode || focus >= 5,
        crowdsec: overviewMode || focus >= 6,
    };

    const colors = {
        dns: { label: "DNS (53)", swatch: "bg-blue-500", stroke: "rgba(59,130,246,0.95)", fill: "rgba(59,130,246,0.95)", marker: "url(#arrowBlue)" },
        https: { label: "HTTPS (443)", swatch: "bg-slate-200", stroke: "rgba(226,232,240,0.92)", fill: "rgba(226,232,240,0.92)", marker: "url(#arrowNeutral)" },
        wg: { label: "WireGuard", swatch: "bg-emerald-500", stroke: "rgba(34,197,94,0.95)", fill: "rgba(34,197,94,0.95)", marker: "url(#arrowGreen)" },
        acme: { label: "ACME", swatch: "bg-violet-500", stroke: "rgba(139,92,246,0.95)", fill: "rgba(139,92,246,0.95)", marker: "url(#arrowViolet)" },
        blocked: { label: "Blocked", swatch: "bg-rose-500", stroke: "rgba(244,63,94,0.95)", fill: "rgba(244,63,94,0.95)", marker: "url(#arrowRose)" },
        crowd: { label: "CrowdSec", swatch: "bg-amber-400", stroke: "rgba(251,191,36,0.95)", fill: "rgba(251,191,36,0.95)", marker: "url(#arrowAmber)" },
    };

    const legend = [colors.dns, colors.https, colors.wg, colors.acme, colors.blocked, colors.crowd];

    // Bus lanes (routing) to keep paths off the boxes
    const topBusY = 45;
    const midLaneY = 280;
    const bottomBusY = 740;

    // Helper: build a routed flow between two boxes using ports only
    const routed = (
        startRect: Rect,
        startSide: Side,
        endRect: Rect,
        endSide: Side,
        via: Pt[]
    ): Pt[] => {
        const start = anchorPoint(startRect, startSide);
        const end = anchorPoint(endRect, endSide);
        const startOut = standoff(start, startSide, 28);
        const endOut = standoff(end, endSide, 28);
        return [start, startOut, ...via, endOut, end];
    };

    // Flows (clean routing)
    const dnsPts = routed(
        internet,
        "top",
        bouncer,
        "top",
        [
            { x: anchorPoint(internet, "top").x, y: topBusY },
            { x: anchorPoint(bouncer, "top").x, y: topBusY },
        ]
    );

    const httpsPts = routed(
        internet,
        "right",
        bouncer,
        "left",
        [
            { x: 430, y: midLaneY },
            { x: anchorPoint(bouncer, "left").x - 35, y: midLaneY },
        ]
    );

    const wgPts = routed(bouncer, "right", vault, "left", []);

    const acmePts = routed(
        bouncer,
        "top",
        ca,
        "left",
        [
            { x: anchorPoint(bouncer, "top").x, y: topBusY },
            { x: anchorPoint(ca, "left").x - 35, y: topBusY },
            { x: anchorPoint(ca, "left").x - 35, y: anchorPoint(ca, "left").y },
        ]
    );

    const blockedPts = routed(
        internet,
        "bottom",
        vault,
        "bottom",
        [
            { x: anchorPoint(internet, "bottom").x, y: bottomBusY },
            { x: anchorPoint(vault, "bottom").x, y: bottomBusY },
        ]
    );

    // CrowdSec loop below Node A (kept away from other labels)
    const crowdLoopD =
        "M 610 700 C 700 640, 820 640, 910 700 C 960 730, 960 770, 910 800 C 820 850, 700 850, 610 800 C 560 770, 560 730, 610 700";

    return (
        <div className="min-h-screen bg-black p-6 text-slate-100">
            {/* full-width container */}
            <div className="mx-auto w-full max-w-none">
                <div className="flex flex-col gap-4">
                    <header className="flex flex-col gap-2">
                        <div className="text-sm font-semibold text-slate-100">DIY Euro-Proxy Mentor</div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Animated traffic-flow schema</h1>
                        <p className="max-w-5xl text-sm leading-6 text-slate-300">
                            Each box has four ports. Flows connect to ports only, then route via bus lanes. This avoids overlaps and makes traffic direction easy to read.
                        </p>
                    </header>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            {steps.map((s) => (
                                <StepChip key={s.n} n={s.n} label={s.label} active={focus === s.n} onClick={() => setFocus(s.n)} />
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Toggle label="Overview" active={overviewMode} onClick={() => setOverviewMode(true)} />
                            <Toggle label="Phase mode" active={!overviewMode} onClick={() => setOverviewMode(false)} />
                        </div>
                    </div>

                    <section className="w-full rounded-2xl border border-slate-700 bg-slate-950/40 p-4 shadow-sm backdrop-blur">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-slate-100">Traffic flows</div>
                            <div className="flex flex-wrap gap-2">
                                <Pill>ns1/ns2.securelounge.co.uk</Pill>
                                <Pill>Origin IP hidden</Pill>
                            </div>
                        </div>

                        {/* Color map (legend) */}
                        <div className="mt-3 flex flex-wrap gap-2">
                            {legend.map((l) => (
                                <span
                                    key={l.label}
                                    className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/40 px-3 py-1 text-xs text-slate-300 shadow-sm"
                                >
                                    <span className={`inline-block h-2 w-8 rounded-full ${l.swatch}`} />
                                    <span>{l.label}</span>
                                </span>
                            ))}
                        </div>

                        {/* Diagram wrapper */}
                        <div className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950/60 p-2">
                            <svg
                                viewBox={`0 0 ${view.w} ${view.h}`}
                                className="h-[640px] md:h-[760px] w-full"
                                preserveAspectRatio="xMidYMid meet"
                                style={{ overflow: "visible" }}
                            >
                                <defs>
                                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.10)" strokeWidth="1" />
                                    </pattern>

                                    <marker id="arrowNeutral" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.https.stroke} />
                                    </marker>
                                    <marker id="arrowBlue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.dns.stroke} />
                                    </marker>
                                    <marker id="arrowGreen" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.wg.stroke} />
                                    </marker>
                                    <marker id="arrowViolet" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.acme.stroke} />
                                    </marker>
                                    <marker id="arrowRose" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.blocked.stroke} />
                                    </marker>
                                    <marker id="arrowAmber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M 0 0 L 10 5 L 0 10 z" fill={colors.crowd.stroke} />
                                    </marker>
                                </defs>

                                <rect x="0" y="0" width={view.w} height={view.h} fill="url(#grid)" />

                                {/* Boxes */}
                                <g>
                                    <foreignObject x={internet.x} y={internet.y} width={internet.w} height={internet.h}>
                                        <div className="h-full rounded-2xl border border-slate-700 bg-slate-950/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.10),0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 shadow-sm">
                                                    <Globe className="h-5 w-5 text-slate-100" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-100">Public Internet</div>
                                                    <div className="text-xs text-slate-400">Users, bots, scanners</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Pill>DNS lookup</Pill>
                                                <Pill>HTTPS request</Pill>
                                                <Pill>Attacks</Pill>
                                            </div>
                                        </div>
                                    </foreignObject>
                                    <PortDots rect={internet} />
                                </g>

                                <g>
                                    <foreignObject x={bouncer.x} y={bouncer.y} width={bouncer.w} height={bouncer.h}>
                                        <div className="h-full rounded-2xl border border-slate-700 bg-slate-950/40 p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.10),0_10px_30px_rgba(0,0,0,0.35)]">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 shadow-sm">
                                                        <Shield className="h-5 w-5 text-slate-100" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-100">Node A (The Bouncer)</div>
                                                        <div className="mt-0.5 text-xs text-slate-400">Public IP lives here (EU VPS)</div>
                                                    </div>
                                                </div>
                                                <Pill>Only public door</Pill>
                                            </div>

                                            <div className="mt-4 grid grid-cols-2 gap-2">
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">Authoritative DNS</div>
                                                    <div className="mt-1 text-xs text-slate-400">ns1/ns2, zone records</div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <Pill>53/udp</Pill>
                                                        <Pill>53/tcp</Pill>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">BunkerWeb</div>
                                                    <div className="mt-1 text-xs text-slate-400">Reverse proxy + WAF</div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <Pill>443/tcp</Pill>
                                                        <Pill>80/tcp</Pill>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">WireGuard</div>
                                                    <div className="mt-1 text-xs text-slate-400">Private hallway endpoint</div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <Pill>10.0.0.1</Pill>
                                                        <Pill>51820/udp</Pill>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">CrowdSec</div>
                                                    <div className="mt-1 text-xs text-slate-400">Detect + ban attackers</div>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        <Pill>decisions</Pill>
                                                        <Pill>bouncers</Pill>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                                                <KeyRound className="h-4 w-4" />
                                                <span>All clean traffic is forwarded to the Vault through WireGuard</span>
                                            </div>
                                        </div>
                                    </foreignObject>
                                    <PortDots rect={bouncer} />
                                </g>

                                <g>
                                    <foreignObject x={vault.x} y={vault.y} width={vault.w} height={vault.h}>
                                        <div className="h-full rounded-2xl border border-slate-700 bg-slate-950/40 p-5 shadow-[0_0_0_1px_rgba(148,163,184,0.10),0_10px_30px_rgba(0,0,0,0.35)]">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 shadow-sm">
                                                        <Lock className="h-5 w-5 text-emerald-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-slate-100">Node B (The Vault)</div>
                                                        <div className="mt-0.5 text-xs text-slate-400">Backend stays secret (origin IP hidden)</div>
                                                    </div>
                                                </div>
                                                <Pill>Firewall locked</Pill>
                                            </div>

                                            <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-xs font-semibold text-slate-200">Apps</div>
                                                    <Pill>Internal only</Pill>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    <Pill>Websites</Pill>
                                                    <Pill>APIs</Pill>
                                                    <Pill>Admin</Pill>
                                                    <Pill>DB</Pill>
                                                </div>
                                            </div>

                                            <div className="mt-3 grid grid-cols-2 gap-2">
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">WireGuard peer</div>
                                                    <div className="mt-1 text-xs text-slate-400">Accepts from Node A only</div>
                                                    <div className="mt-2">
                                                        <Pill>10.0.0.2</Pill>
                                                    </div>
                                                </div>
                                                <div className="rounded-xl border border-slate-700 bg-slate-950/30 p-3">
                                                    <div className="text-xs font-semibold text-slate-200">Firewall rule</div>
                                                    <div className="mt-1 text-xs text-slate-400">Drop public inbound web</div>
                                                    <div className="mt-2">
                                                        <Pill>allow 10.0.0.1</Pill>
                                                    </div>
                                                </div>
                                            </div>

                                            {show.lockVault ? (
                                                <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span>Never publish the Vault’s public IP in DNS or headers.</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </foreignObject>
                                    <PortDots rect={vault} />
                                </g>

                                <g>
                                    <foreignObject x={ca.x} y={ca.y} width={ca.w} height={ca.h}>
                                        <div className="h-full rounded-2xl border border-slate-700 bg-slate-950/60 p-4 shadow-[0_0_0_1px_rgba(148,163,184,0.10),0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur">
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 shadow-sm">
                                                    <BadgeCheck className="h-5 w-5 text-violet-400" />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-slate-100">Certificate Authority</div>
                                                    <div className="text-xs text-slate-400">ACME (Let’s Encrypt)</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <Pill>Issue/renew certs</Pill>
                                                <Pill>Domain validation</Pill>
                                            </div>
                                        </div>
                                    </foreignObject>
                                    <PortDots rect={ca} />
                                </g>

                                {/* Flows: connect to ports only */}
                                <Flow
                                    id="dns"
                                    points={dnsPts}
                                    label={<ArrowLabel>DNS query/answer (53)</ArrowLabel>}
                                    labelPos={{ x: 520, y: topBusY + 18 }}
                                    stroke={colors.dns.stroke}
                                    packetFill={colors.dns.fill}
                                    dashed
                                    show={show.dns}
                                    bidirectional
                                    packets={2}
                                    durationSec={3.2}
                                    markerEnd={colors.dns.marker}
                                />

                                <Flow
                                    id="https"
                                    points={httpsPts}
                                    label={<ArrowLabel>HTTPS request/response (443)</ArrowLabel>}
                                    labelPos={{ x: 440, y: midLaneY - 18 }}
                                    stroke={colors.https.stroke}
                                    packetFill={colors.https.fill}
                                    dashed
                                    show={show.waf}
                                    bidirectional
                                    packets={3}
                                    durationSec={2.8}
                                    markerEnd={colors.https.marker}
                                />

                                <Flow
                                    id="wg"
                                    points={wgPts}
                                    label={<ArrowLabel>WireGuard tunnel (10.0.0.1 ↔ 10.0.0.2)</ArrowLabel>}
                                    labelPos={{ x: 1040, y: 510 }}
                                    stroke={colors.wg.stroke}
                                    packetFill={colors.wg.fill}
                                    dashed
                                    show={show.wireguard}
                                    bidirectional
                                    packets={3}
                                    durationSec={2.6}
                                    markerEnd={colors.wg.marker}
                                />

                                <Flow
                                    id="acme"
                                    points={acmePts}
                                    label={<ArrowLabel>ACME validation/renewal</ArrowLabel>}
                                    labelPos={{ x: 1020, y: topBusY + 18 }}
                                    stroke={colors.acme.stroke}
                                    packetFill={colors.acme.fill}
                                    dashed
                                    show={show.waf}
                                    bidirectional
                                    packets={2}
                                    durationSec={3.6}
                                    markerEnd={colors.acme.marker}
                                />

                                <Flow
                                    id="blocked"
                                    points={blockedPts}
                                    label={<ArrowLabel>Blocked by Vault firewall</ArrowLabel>}
                                    labelPos={{ x: 980, y: bottomBusY - 18 }}
                                    stroke={colors.blocked.stroke}
                                    packetFill={colors.blocked.fill}
                                    dashed
                                    show={show.lockVault}
                                    bidirectional={false}
                                    packets={1}
                                    durationSec={3.0}
                                    markerEnd={colors.blocked.marker}
                                />

                                {/* CrowdSec loop */}
                                {show.crowdsec ? (
                                    <>
                                        <path d={crowdLoopD} fill="none" stroke={colors.crowd.stroke} strokeWidth={2} strokeDasharray="8 10">
                                            <animate attributeName="stroke-dashoffset" values="32;0" dur="1.2s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.45;0.9;0.45" dur="2.0s" repeatCount="indefinite" />
                                        </path>
                                        <circle r={5} fill={colors.crowd.fill} opacity={0.95}>
                                            <animateMotion dur="2.9s" repeatCount="indefinite" path={crowdLoopD} />
                                            <animate attributeName="opacity" values="0;1;1;0" dur="2.9s" repeatCount="indefinite" />
                                        </circle>
                                        <foreignObject x={720} y={700} width={300} height={40}>
                                            <div className="flex items-center justify-center">
                                                <ArrowLabel>
                                                    <span className="inline-flex items-center gap-2">
                                                        <Ban className="h-3.5 w-3.5 text-amber-200" />
                                                        CrowdSec detects → bans
                                                    </span>
                                                </ArrowLabel>
                                            </div>
                                        </foreignObject>
                                    </>
                                ) : null}

                                {/* Footer note */}
                                <foreignObject x={380} y={730} width={900} height={44}>
                                    <div className="flex items-center justify-center">
                                        <div className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1 text-xs text-slate-300 shadow-sm backdrop-blur">
                                            <span className="inline-flex items-center gap-2">
                                                <Link2 className="h-3.5 w-3.5" />
                                                Public points only to Node A; Node B is reachable only through WireGuard
                                            </span>
                                        </div>
                                    </div>
                                </foreignObject>
                            </svg>
                        </div>
                    </section>

                    {/* Explanation below */}
                    <section className="w-full rounded-2xl border border-slate-700 bg-slate-950/40 p-5 shadow-sm backdrop-blur">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-100">{focusCopy[focus].title}</div>
                                <p className="mt-2 text-sm leading-6 text-slate-300">{focusCopy[focus].body}</p>
                                <div className="mt-3 text-xs text-slate-400">
                                    Overview mode shows the full system. Phase mode hides future flows so you can explain it step-by-step.
                                </div>
                            </div>
                            <div className="hidden md:flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/30 shadow-sm">
                                <ChevronRight className="h-5 w-5 text-slate-300" />
                            </div>
                        </div>

                        <div className="mt-4 text-xs text-slate-500">
                            Note: The traveling packets are native SVG ({"<animateMotion>"}), so they’re lightweight and GitHub Pages-friendly.
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}

// ------------------------
// Lightweight tests
// ------------------------
// These tests only run if a test runner provides describe/it/expect.
// IMPORTANT: Use globalThis lookups so TypeScript doesn't require jest/mocha type defs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __g: any = globalThis as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __maybeDescribe: any = typeof __g.describe === "function" ? __g.describe : null;

if (__maybeDescribe) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const __maybeIt: any = typeof __g.it === "function" ? __g.it : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const __maybeExpect: any = typeof __g.expect === "function" ? __g.expect : null;

    __maybeDescribe("geometry helpers", () => {
        if (!__maybeIt || !__maybeExpect) return;

        __maybeIt("buildLinePath returns an SVG move+line path", () => {
            __maybeExpect(buildLinePath({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe("M 1 2 L 3 4");
        });

        __maybeIt("midpoint returns the center point", () => {
            __maybeExpect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
        });

        __maybeIt("anchorPoint returns correct top/left", () => {
            const r: Rect = { x: 100, y: 50, w: 200, h: 100 };
            __maybeExpect(anchorPoint(r, "top")).toEqual({ x: 200, y: 50 });
            __maybeExpect(anchorPoint(r, "left")).toEqual({ x: 100, y: 100 });
        });
    });
}
