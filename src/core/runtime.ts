export const markets = ["HK", "SG"] as const;
export type Market = typeof markets[number];
export const topics = ["onboarding", "monitoring"] as const;
export type Topic = typeof topics[number];
export type Language = "中文" | "English";
export type Fault = "none" | "review" | "receipt" | "timeout";
type Stage = "retrieve" | "analyze" | "review" | "approval" | "publish" | "completed" | "blocked" | "cancelled";

export type Evidence = {
  id: string; version: number; project: string; access: "demo" | "restricted";
  market: Market; topic: Topic; title: string; excerpt: string;
  position: "required" | "optional"; deleted: boolean;
};

export type Requirements = { market: Market | "all"; topic: Topic; language: Language };
type Approval = { token: string; version: number; evidenceKey: string; accepted: boolean };
type Run = {
  id: string; version: number; requirements: Requirements; stage: Stage; paused: boolean;
  evidence: Evidence[]; findings: string[]; blockers: string[];
  approval?: Approval; fault: Fault; reviewAttempts: number; deadline?: number;
  events: { version: number; label: string }[];
};
type Receipt = { key: string; findings: string[] };
export type State = {
  schema: 1; active?: string; runs: Run[]; evidence: Evidence[];
  memory?: Language; receipts: Receipt[];
};

const project = "compliance-demo";
const seed: Evidence[] = [
  { id: "HK-A", version: 1, market: "HK", topic: "onboarding", title: "Harbour sandbox · archived circular", excerpt: "Illustrative identity check was optional.", position: "optional" },
  { id: "HK-A", version: 2, market: "HK", topic: "onboarding", title: "Harbour sandbox · onboarding", excerpt: "Verify identity before opening a demo account.", position: "required" },
  { id: "SG-A", version: 1, market: "SG", topic: "onboarding", title: "Meridian sandbox · onboarding", excerpt: "Verify identity before opening a demo account.", position: "required" },
  { id: "SG-B", version: 1, market: "SG", topic: "onboarding", title: "Meridian sandbox · conflicting pilot memo", excerpt: "Identity verification may be deferred in the demo pilot.", position: "optional" },
  { id: "HK-M", version: 1, market: "HK", topic: "monitoring", title: "Harbour sandbox · monitoring", excerpt: "Review alerts weekly in the simulation.", position: "required" },
  { id: "SG-M", version: 1, market: "SG", topic: "monitoring", title: "Meridian sandbox · monitoring", excerpt: "Review alerts weekly in the simulation.", position: "required" },
].map((doc) => ({ ...doc, project, access: "demo", deleted: false } as Evidence));

export function initialState(): State {
  return { schema: 1, runs: [], evidence: structuredClone(seed), receipts: [] };
}

const ref = (doc: Evidence) => `${doc.id}@${doc.version}`;
const validRequirements = ({ market, topic, language }: Requirements) =>
  (market === "all" || markets.includes(market)) && topics.includes(topic) &&
  (language === "中文" || language === "English");

export function retrieve(corpus: Evidence[], market: Market, topic: Topic) {
  const latest = new Map<string, Evidence>();
  for (const doc of corpus) {
    if (doc.project !== project) continue;
    if ((latest.get(doc.id)?.version ?? 0) < doc.version) latest.set(doc.id, doc);
  }
  return [...latest.values()]
    .filter((doc) => !doc.deleted && doc.access === "demo" && doc.market === market && doc.topic === topic)
    .sort((a, b) => a.id.localeCompare(b.id)).slice(0, 8);
}

const selectedMarkets = (run: Run): readonly Market[] =>
  run.requirements.market === "all" ? markets : [run.requirements.market];
const currentEvidence = (state: State, run: Run) =>
  selectedMarkets(run).flatMap((market) => retrieve(state.evidence, market, run.requirements.topic));
const evidenceKey = (docs: Evidence[]) => docs.map(ref).join(",");
export async function retrieveInParallel(state: State, run: Run,
  search: (corpus: Evidence[], market: Market, topic: Topic) => Evidence[] | Promise<Evidence[]> = retrieve) {
  return (await Promise.all(selectedMarkets(run).map(async (market) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    return search(state.evidence, market, run.requirements.topic);
  }))).flat();
}
export const activeRun = (state: State) => state.runs.find((run) => run.id === state.active);
export const canStart = (state: State) => {
  const run = activeRun(state);
  return !run || run.stage === "completed" || run.stage === "cancelled";
};

export type Command =
  | { type: "start"; id: string; requirements: Requirements; fault: Fault }
  | { type: "select"; id: string }
  | { type: "revise"; requirements: Requirements }
  | { type: "approve"; token: string }
  | { type: "tick"; id: string; version: number; now: number; stage?: Stage; retrieval?: { corpusSize: number; documents: Evidence[] } }
  | { type: "pause" | "resume" | "retry" | "cancel" }
  | { type: "memory"; value?: Language }
  | { type: "source"; id: string; withdraw: boolean };

export function applyCommand(previous: State, command: Command): State {
  const state = structuredClone(previous);
  if (command.type === "memory") {
    if (command.value !== undefined && command.value !== "中文" && command.value !== "English") return previous;
    state.memory = command.value;
    return state;
  }
  if (command.type === "source") {
    const latest = state.evidence.filter((doc) => doc.id === command.id && doc.project === project).at(-1);
    if (!latest || latest.access !== "demo" || latest.deleted === command.withdraw || state.evidence.length >= 80) return previous;
    state.evidence.push({ ...latest, version: latest.version + 1, deleted: command.withdraw });
    const run = activeRun(state);
    if (run && !terminal(run) && !receiptFor(state, run) && stale(state, run)) invalidate(run);
    return state;
  }
  if (command.type === "start") {
    if (!canStart(previous) || !validRequirements(command.requirements) ||
        !/^[a-f0-9-]{36}$/i.test(command.id) || state.runs.some((run) => run.id === command.id) ||
        !["none", "review", "receipt", "timeout"].includes(command.fault)) return previous;
    const run: Run = { id: command.id, version: 1, requirements: command.requirements, fault: command.fault,
      stage: "retrieve", paused: false, evidence: [], findings: [], blockers: [], reviewAttempts: 0, events: [] };
    log(run, "Run created");
    state.active = run.id;
    state.runs = [...state.runs.slice(-14), run];
    state.receipts = state.receipts.filter((receipt) => state.runs.some(({ id }) => receipt.key.startsWith(id + ":")));
    return state;
  }
  if (command.type === "select") {
    if (!canStart(previous) || !state.runs.some((run) => run.id === command.id)) return previous;
    state.active = command.id;
    return state;
  }

  const run = activeRun(state);
  if (!run || terminal(run)) return previous;
  if (command.type === "tick" && (command.id !== run.id || command.version !== run.version || (command.stage !== undefined && command.stage !== run.stage) || run.paused)) return previous;

  // A committed local effect wins over late cancellation or edits.
  if (receiptFor(state, run)) {
    run.stage = "completed";
    log(run, "Recovered committed publication receipt");
    return state;
  }

  if (command.type === "cancel") {
    run.approval = undefined;
    run.stage = "cancelled";
    log(run, "Run cancelled");
    return state;
  }
  if (command.type === "revise") {
    if (!validRequirements(command.requirements)) return previous;
    run.requirements = command.requirements;
    invalidate(run);
    return state;
  }
  if (stale(state, run)) {
    invalidate(run);
    return state;
  }

  switch (command.type) {
    case "pause":
      if (!isRunnable(run) || run.paused) return previous;
      run.paused = true;
      run.deadline = undefined;
      log(run, "Paused by user");
      break;
    case "resume":
      if (!run.paused) return previous;
      run.paused = false;
      log(run, "Resumed by user");
      break;
    case "retry":
      if (run.stage !== "blocked" || run.reviewAttempts !== 1 || run.blockers.length) return previous;
      run.stage = "review";
      run.deadline = undefined;
      log(run, "Review retry queued");
      break;
    case "approve":
      if (run.stage !== "approval" || run.approval?.token !== command.token) return previous;
      run.approval.accepted = true;
      run.stage = "publish";
      log(run, "Local publication approved for this version");
      break;
    case "tick":
      if (!isRunnable(run) || !Number.isFinite(command.now)) return previous;
      if (run.stage === "retrieve" && command.retrieval) {
        if (command.retrieval.corpusSize !== state.evidence.length) return previous;
        const canonical = currentEvidence(state, run);
        if (evidenceKey(command.retrieval.documents) !== evidenceKey(canonical)) return previous;
        advance(state, run, command.now, canonical);
      } else {
        advance(state, run, command.now);
      }
      break;
    default:
      return previous;
  }
  return state;
}

function terminal(run: Run) {
  return run.stage === "completed" || run.stage === "cancelled";
}

export function isRunnable(run: Run) {
  return (["retrieve", "analyze", "review", "publish"] as Stage[]).includes(run.stage);
}

function log(run: Run, label: string) {
  run.events = [...run.events.slice(-59), { version: run.version, label }];
}

function stale(state: State, run: Run) {
  return run.stage !== "retrieve" && evidenceKey(run.evidence) !== evidenceKey(currentEvidence(state, run));
}

function invalidate(run: Run) {
  run.version++;
  run.stage = "retrieve";
  run.evidence = [];
  run.findings = [];
  run.blockers = [];
  run.approval = undefined;
  run.reviewAttempts = 0;
  run.deadline = undefined;
  log(run, "Requirements or evidence updated. Previous approval cleared.");
}

const approvalToken = (run: Run) => `${run.id}:${run.version}:publish:${evidenceKey(run.evidence)}`;
const receiptFor = (state: State, run: Run) => state.receipts.find((receipt) => receipt.key === approvalToken(run));

function advance(state: State, run: Run, now: number, documents?: Evidence[]) {
  switch (run.stage) {
    case "retrieve":
      run.evidence = documents ?? currentEvidence(state, run);
      run.stage = "analyze";
      log(run, "Retrieval handed scoped citations to Analysis");
      break;
    case "analyze":
      for (const market of selectedMarkets(run)) {
        const docs = run.evidence.filter((doc) => doc.market === market);
        const positions = new Set(docs.map((doc) => doc.position));
        if (positions.size !== 1) {
          run.blockers.push(`${market} · ${docs.length ? "Conflicting evidence" : "Evidence missing"} [${docs.map(ref).join(", ")}]`);
          continue;
        }
        const required = docs[0].position === "required";
        const zh = run.requirements.language === "中文";
        const topic = run.requirements.topic === "onboarding" ? (zh ? "身份核验" : "identity verification") : (zh ? "警报复查" : "alert review");
        const position = required ? (zh ? "需要" : "required") : (zh ? "可选" : "optional");
        run.findings.push(`${market} · ${topic} · ${position} [${docs.map(ref).join(", ")}]`);
      }
      run.stage = "review";
      log(run, "Analysis handed findings and conflicts to Review");
      break;
    case "review":
      if (run.fault === "timeout" && run.deadline === undefined) {
        run.deadline = now + 1800;
        log(run, "Review started with a deadline");
        return;
      }
      if (run.deadline !== undefined && now < run.deadline) return;
      run.reviewAttempts++;
      if (run.fault === "review" || run.fault === "timeout") {
        log(run, run.fault === "timeout" ? "Review timed out" : "Injected review failure");
        run.fault = "none";
        run.stage = "blocked";
        return;
      }
      if (run.blockers.length || !run.findings.length) {
        run.stage = "blocked";
        log(run, "Review blocked publication because evidence was missing or conflicted");
        return;
      }
      run.approval = { token: approvalToken(run), version: run.version, evidenceKey: evidenceKey(run.evidence), accepted: false };
      run.stage = "approval";
      log(run, "Review completed. Awaiting publication approval.");
      break;
    case "publish":
      if (!run.approval?.accepted || run.approval.token !== approvalToken(run)) {
        run.stage = "blocked";
        log(run, "Publication lacked current approval");
        return;
      }
      state.receipts.push({ key: run.approval.token, findings: [...run.findings] });
      if (run.fault === "receipt") {
        run.fault = "none";
        log(run, "Injected interruption after local publication");
        return;
      }
      run.stage = "completed";
      log(run, "Local publication committed");
  }
}
