import type { Jury } from "@bench/core";
import { Hash } from "./ui";

const STAGES = ["PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED", "FINALIZED"] as const;

export function LifecycleBar({ status }: { status: string }) {
  const s = status.toUpperCase();
  const idx = STAGES.indexOf(s as (typeof STAGES)[number]);
  const appeal = s.startsWith("APPEAL");
  const bad = ["UNDETERMINED", "CANCELED", "LEADER_TIMEOUT", "VALIDATORS_TIMEOUT"].includes(s);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {STAGES.map((st, i) => (
          <div key={st} className={`h-1.5 flex-1 rounded-full ${idx >= i || (appeal && i <= 4) ? "bg-blue" : "bg-line"}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>Pending</span>
        <span>Accepted · appeal window</span>
        <span>Finalized</span>
      </div>
      <p className={`text-sm font-medium ${bad ? "text-fail" : appeal ? "text-warn" : "text-ink"}`}>
        {s}
        {s === "ACCEPTED" && " (verdict reached; appeal window open, not final yet)"}
        {appeal && " (a larger jury is re-judging)"}
      </p>
    </div>
  );
}

const VOTE_STYLE: Record<string, { label: string; cls: string }> = {
  LEADER: { label: "Proposed the verdict", cls: "text-blue" },
  AGREE: { label: "Agreed", cls: "text-pass" },
  DISAGREE: { label: "Disagreed", cls: "text-fail" },
  TIMEOUT: { label: "Timed out", cls: "text-warn" },
  DETERMINISTIC_VIOLATION: { label: "Violation", cls: "text-fail" },
  NOT_VOTED: { label: "Not needed", cls: "text-muted" },
};

export function JuryPanel({ jury }: { jury: Jury }) {
  const pct = jury.total ? Math.round((jury.agree / jury.total) * 100) : 0;
  const hasModels = jury.votes.some((v) => v.model);
  return (
    <div className="space-y-5">
      <LifecycleBar status={jury.status} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {jury.votes.map((v, i) => {
          const st = VOTE_STYLE[v.vote] ?? { label: v.vote, cls: "text-ink" };
          return (
            <div
              key={v.validator}
              className={`rise rounded-xl border bg-white p-3.5 text-xs ${v.leader ? "border-blue/40 ring-1 ring-blue/15" : "border-line"}`}
              style={{ animationDelay: `${i * 140}ms` }}
            >
              <p className="eyebrow">{v.leader ? "Leader" : `Validator ${i + (jury.votes[0]?.leader ? 0 : 1)}`}</p>
              {v.model && (
                <span className="mt-2 inline-flex rounded-full bg-blue-wash px-2.5 py-0.5 text-[0.72rem] font-medium text-blue">{v.model}</span>
              )}
              <div className="mt-2">
                <Hash value={v.validator} chars={6} />
              </div>
              <p className={`mt-2 font-semibold ${st.cls}`}>{st.label}</p>
            </div>
          );
        })}
      </div>
      {jury.total > 0 && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div className="h-2 rounded-full bg-blue transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {jury.agree} of {jury.total} validators agreed with the leader
            {jury.rounds > 1 && ` · round ${jury.round} of ${jury.rounds}`}
          </p>
        </div>
      )}
      <p className="text-xs text-muted">
        {hasModels
          ? "Each validator re-ran the judgment with its own model; the network reports which model each one used."
          : "Validators run their own models; this network's receipt records votes, not model names."}
      </p>
    </div>
  );
}
