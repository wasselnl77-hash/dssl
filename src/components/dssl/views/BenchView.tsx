"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* The benchmark measures the engine while the engine styles the page.
 * Three lanes, one question each:
 *   CSS     — a real <style> tag, the platform baseline
 *   DSSL    — the live engine, ambient reactivity on
 *   DSSL ❄  — the engine frozen right after first paint (v0.7 freeze())
 * Metrics: first paint (build + full style application, median of 3) and
 * restyle-all (one knob flipped, every node changes color).
 * Honest by construction: synthetic nodes, one machine, your browser.
 * The frozen lane's restyle is an explicit developer action (signal), not
 * ambient churn — that is the whole point of freeze, and the note says so. */

declare global {
  interface Window {
    DSSL?: any;
  }
}

const BENCH_SRC = `
.bench-stage-item {
  padding: 5 10
  border-bottom: 1 solid color.line
  background: color.card
  color: color.ink
  font-size: 13
}
@signal benchStorm {
  .bench-stage-item { background: #dbe7ff; color: #14243f }
}
`;

const CSS_SRC = `
.bench-stage-item { padding: 5px 10px; border-bottom: 1px solid var(--dssl-color-line); background: var(--dssl-color-card); color: var(--dssl-color-ink); font-size: 13px; }
.bench-stage.on .bench-stage-item { background: #dbe7ff; color: #14243f; }
`;

const SIZES = [100, 1000, 10000];
const LANES = [
  { id: "css", label: "CSS <style>" },
  { id: "live", label: "DSSL live" },
  { id: "frozen", label: "DSSL frozen" },
] as const;

type LaneId = (typeof LANES)[number]["id"];
type Row = { count: number; lane: LaneId; paint: number; restyle: number };

const settle = () =>
  new Promise<void>((r) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20)))
  );

function buildNodes(host: HTMLElement, count: number) {
  let html = "";
  for (let i = 0; i < count; i++) html += `<div class="bench-stage-item">row ${i}</div>`;
  host.innerHTML = html;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export default function BenchView() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLStyleElement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [freezeStats, setFreezeStats] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      // leave the site exactly as we found it
      if (styleRef.current) styleRef.current.remove();
      if (stageRef.current) stageRef.current.innerHTML = "";
      window.DSSL?.signal?.("benchStorm", null);
    };
  }, []);

  /* The settle wait itself costs ~2 frames; every raw measurement includes
   * that floor. So each lane gets a floor run on an EMPTY host with the
   * exact same flow, and the reported number is raw minus floor: work only. */
  const floorFor = useCallback(async (lane: LaneId) => {
    const D = window.DSSL;
    if (!D || !stageRef.current) return { paint: 0, restyle: 0 };
    const host = stageRef.current;
    const paints: number[] = [];
    const restyles: number[] = [];
    for (let rep = 0; rep < 3; rep++) {
      host.innerHTML = "";
      host.classList.remove("on");
      D.signal("benchStorm", null);
      await settle();

      let t0 = performance.now();
      if (lane === "css") {
        const st = document.createElement("style");
        document.head.appendChild(st);
        styleRef.current = st;
        await settle();
        st.remove();
        styleRef.current = null;
      } else {
        D.apply("", { name: "bench-floor", scope: host, replace: true });
        await settle();
      }
      paints.push(performance.now() - t0);

      t0 = performance.now();
      if (lane === "css") {
        host.classList.add("on");
        await settle();
        host.classList.remove("on");
      } else {
        D.signal("benchStorm", "on");
        await settle();
        D.signal("benchStorm", null);
      }
      restyles.push(performance.now() - t0);
      await settle();
    }
    return { paint: median(paints), restyle: median(restyles) };
  }, []);

  const runConfig = useCallback(async (count: number, lane: LaneId) => {
    const D = window.DSSL;
    if (!D || !stageRef.current) return;
    const host = stageRef.current;
    const paints: number[] = [];
    const restyles: number[] = [];

    for (let rep = 0; rep < 3; rep++) {
      host.innerHTML = "";
      host.classList.remove("on");
      D.signal("benchStorm", null);
      await settle();

      if (lane === "css") {
        if (styleRef.current) styleRef.current.remove();
        let t0 = performance.now();
        const st = document.createElement("style");
        st.textContent = CSS_SRC;
        styleRef.current = st;
        document.head.appendChild(st);
        buildNodes(host, count);
        await settle();
        paints.push(performance.now() - t0);

        t0 = performance.now();
        host.classList.add("on");
        await settle();
        restyles.push(performance.now() - t0);
        host.classList.remove("on");
        st.remove();
        styleRef.current = null;
      } else {
        let t0 = performance.now();
        buildNodes(host, count);
        D.apply(BENCH_SRC, { name: "bench-live", scope: host, replace: true });
        await settle();
        paints.push(performance.now() - t0);

        if (lane === "frozen") {
          const stats = D.freeze();
          const s = Array.isArray(stats) ? stats.find((x: any) => x.engine !== "global") || stats[0] : stats;
          setFreezeStats(
            `freeze() → ${s.elements} elements, ${s.rules} rules, ${s.shadowRules} shadow rules — ambient cost now zero`
          );
        }

        t0 = performance.now();
        D.signal("benchStorm", "on");
        await settle();
        restyles.push(performance.now() - t0);
        D.signal("benchStorm", null);

        if (lane === "frozen") D.unfreeze();
      }
      await settle();
    }

    const floor = await floorFor(lane);
    const net = (xs: number[], f: number) => Math.max(0.05, median(xs) - f);
    return { paint: net(paints, floor.paint), restyle: net(restyles, floor.restyle) };
  }, [floorFor]);

  const run = useCallback(
    async (count: number | "all") => {
      const D = window.DSSL;
      if (!D) {
        setErr("engine not booted yet (no window.DSSL) — wait for dssl-ready and retry");
        return;
      }
      setErr(null);
      const counts = count === "all" ? SIZES : [count];
      const tag = count === "all" ? "all" : String(count);
      setBusy(tag);
      try {
        for (const c of counts) {
          for (const lane of LANES) {
            const m = await runConfig(c, lane.id);
            if (m) {
              const row: Row = { count: c, lane: lane.id, paint: m.paint, restyle: m.restyle };
              // merge: replace this (count, lane), keep every other size's rows
              setRows((prev) => [...prev.filter((r) => !(r.count === c && r.lane === lane.id)), row]);
            }
          }
        }
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setBusy(null);
        // full cleanup after every run
        if (stageRef.current) stageRef.current.innerHTML = "";
        D.signal("benchStorm", null);
        await settle();
      }
    },
    [runConfig]
  );

  const cell = (count: number, lane: LaneId, key: "paint" | "restyle") => {
    const r = rows.find((x) => x.count === count && x.lane === lane);
    if (!r) return "—";
    return r[key] >= 100 ? Math.round(r[key]).toLocaleString() : r[key].toFixed(1);
  };

  return (
    <div className="wrap">
      <div className="bench-wrap">
        <h2 className="bench-title">The bench</h2>
        <p className="bench-sub">
          Synthetic nodes styled three ways on this page, on this machine, in this browser.
          Median of 3 runs. The point is not to win &mdash; it is to stop arguing from priors.
        </p>

        <div className="bench-controls">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={"bench-btn" + (busy === String(s) ? " on" : "")}
              disabled={!!busy}
              onClick={() => run(s)}
            >
              {busy === String(s) ? "running…" : `${s.toLocaleString()} nodes`}
            </button>
          ))}
          <button
            type="button"
            className={"bench-btn" + (busy === "all" ? " on" : "")}
            disabled={!!busy}
            onClick={() => run("all")}
          >
            {busy === "all" ? "running…" : "Run the full sweep"}
          </button>
        </div>

        {freezeStats && <div className="bench-freeze-stats">{freezeStats}</div>}
        {err && <div className="bench-err">{err}</div>}

        <table className="bench-table">
          <thead>
            <tr>
              <th>nodes</th>
              <th>lane</th>
              <th className="num">first paint (ms)</th>
              <th className="num">restyle all (ms)</th>
            </tr>
          </thead>
          <tbody>
            {SIZES.flatMap((c) =>
              LANES.map((l) => (
                <tr key={`${c}-${l.id}`}>
                  <td>{c.toLocaleString()}</td>
                  <td className={"bench-lane-" + l.id}>{l.label}</td>
                  <td className="num">{cell(c, l.id, "paint")}</td>
                  <td className="num">{cell(c, l.id, "restyle")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <p className="bench-note">
          <strong>How to read this.</strong> First paint = build every node AND fully apply its
          styling (CSS injects a stylesheet, DSSL runs its first matching pass). Restyle all =
          flip one knob so every node changes color: for CSS a container class, for DSSL the
          signal bridge. The frozen lane restyles through an explicit signal call &mdash; a
          developer action, by design &mdash; while its ambient cost (scroll, hover bookkeeping,
          mutations) is exactly zero after freeze(), which the green line above reports.
          Numbers are floor-subtracted: each lane is also measured on an empty host with the
          same flow, and that wait-only floor comes off every figure, so what you see is work.
        </p>
        <p className="bench-note">
          A frozen DSSL page keeps its resolved inline styles forever; unfreeze() re-arms
          everything. Live DSSL buys back that cost in what it can do: tokens, signals and
          states without a build step. Pick the lane per page, not per project.
        </p>
      </div>

      {/* the measured sandbox; nothing here is ever visible-height rendered */}
      <div ref={stageRef} className="bench-stage" aria-hidden="true" />
    </div>
  );
}
