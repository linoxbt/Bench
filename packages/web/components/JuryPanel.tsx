import type { Jury } from "@bench/core";
import { Hash, Note } from "./ui";

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
          <div key={st} className={`h-1.5 flex-1 ${idx >= i || (appeal && i <= 4) ? "bg-teal" : "bg-line"}`} />
        ))}
      </div>
      <div className="flex justify-between text-[0.65rem] text-dim">
        <span>PENDING</span>
        <span>ACCEPTED · appeal window</span>
        <span>FINALIZED</span>
      </div>
      <p className={`text-sm ${bad ? "text-fail" : appeal ? "text-warn" : "text-text"}`}>
        {s}
        {s === "ACCEPTED" && " (verdict reached; appeal window open, not final yet)"}
        {appeal && " (a larger jury is re-judging)"}
      </p>
    </div>
  );
}

export function JuryPanel({ jury }: { jury: Jury }) {
  const pct = jury.total ? Math.round((jury.agree / jury.total) * 100) : 0;
  return (
    <div className="space-y-4">
      <LifecycleBar status={jury.status} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {jury.votes.map((v, i) => (
          <div
            key={v.validator}
            className="flip-in border border-line bg-ink p-3 text-xs"
            style={{ animationDelay: `${i * 160}ms` }}
          >
            <p className="label">validator {i + 1}</p>
            <Hash value={v.validator} chars={6} />
            <p className={`mt-2 font-bold ${v.vote === "AGREE" ? "text-pass" : v.vote === "NOT_VOTED" ? "text-dim" : "text-fail"}`}>
              {v.vote.replace("_", " ")}
            </p>
            {jury.leader?.toLowerCase() === v.validator.toLowerCase() && <p className="text-dim">leader</p>}
          </div>
        ))}
      </div>
      <div>
        <div className="h-2 bg-line">
          <div className="h-2 bg-teal transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-dim">
          {jury.agree}/{jury.total} validators agreed with the leader · round {jury.round}
          {jury.rounds > 1 && ` of ${jury.rounds}`}
        </p>
      </div>
      <Note>Validators run their own models; the receipt records votes, not model names.</Note>
    </div>
  );
}
