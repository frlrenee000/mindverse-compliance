import { transact } from "./store.js";
import { activeRun, canStart, isRunnable, retrieveInParallel } from "./runtime.js";
import { initialSnapshot, parseSnapshot } from "./canvas.js";

const $ = (id) => document.getElementById(id);
const element = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
const controls = ["pause", "resume", "retry", "approve", "cancel"];
const stageNames = { retrieve: "Retrieving evidence", analyze: "Analyzing evidence", review: "Reviewing findings",
  approval: "Awaiting approval", publish: "Publishing locally", completed: "Completed",
  blocked: "Blocked", cancelled: "Cancelled" };
const stages = ["retrieve", "analyze", "review", "approval", "publish"];
let state;
let timer;
let scopeKey;
let storageUnavailable = false;
let revision = 0;
const updates = new BroadcastChannel("mindverse-compliance-runtime");

function requirements() {
  return { market: $("market").value, topic: $("topic").value, language: $("language").value };
}

function report(error) {
  console.error(error.name);
  $("error").hidden = false;
  $("error").textContent = "Workspace storage failed. Reopen the workspace to retry.";
  $("start").disabled = true;
  $("revise").disabled = true;
  controls.forEach((id) => { $(id).disabled = true; });
  storageUnavailable = true;
  clearTimeout(timer);
}

function show(next, recover = false) {
  state = next;
  const run = activeRun(state);
  const terminal = !run || canStart(state);
  const receipt = run && state.receipts.find(({ key }) => key === run.approval?.token);
  const pendingReceipt = Boolean(receipt && run.stage === "publish");
  const displayScopeKey = run ? run.id + ":" + run.version : "new";
  if (scopeKey !== displayScopeKey) {
    const scope = run?.requirements ?? { market: "all", topic: "onboarding", language: state.memory ?? "English" };
    for (const [id, value] of Object.entries(scope)) $(id).value = value;
    if (terminal && state.memory) $("language").value = state.memory;
    scopeKey = displayScopeKey;
  }
  $("version").textContent = run ? "Version " + run.version : "";
  $("status").textContent = pendingReceipt ? "Recovery pending" : run?.paused ? "Paused" : run ? stageNames[run.stage] : "Ready";
  $("start").disabled = !terminal;
  $("revise").disabled = terminal || pendingReceipt;
  $("fault").disabled = !terminal;
  $("status").classList.toggle("blocked", run?.stage === "blocked");
  const index = run?.stage === "completed" ? stages.length :
    run?.stage === "blocked" ? 2 : stages.indexOf(run?.stage);
  for (const item of $("pipeline").children) {
    const step = stages.indexOf(item.dataset.stage);
    item.classList.toggle("current", Boolean(run && (step === index || (index === 4 && step === 3))));
    item.classList.toggle("done", step < index);
  }
  $("actions").hidden = terminal;
  $("pause").hidden = !run || !isRunnable(run) || run.paused || pendingReceipt;
  $("resume").hidden = !run?.paused && !pendingReceipt;
  $("resume").textContent = pendingReceipt ? "Recover publication" : "Resume";
  $("retry").hidden = run?.stage !== "blocked" || run.reviewAttempts !== 1 || run.blockers.length > 0;
  $("approve").hidden = run?.stage !== "approval";
  $("cancel").hidden = pendingReceipt;
  $("evidence-empty").hidden = Boolean(run?.evidence.length || run?.blockers.length);
  $("findings").replaceChildren(...(run?.findings ?? []).map((finding) => element("li", finding)),
    ...(run?.blockers ?? []).map((blocker) => Object.assign(element("li", blocker), { className: "blocked" })));
  $("sources").replaceChildren(...(run?.evidence ?? []).map((doc) => {
    const card = element("article", "");
    card.append(element("strong", doc.title), element("p", doc.excerpt), element("small", doc.id + " · version " + doc.version));
    return card;
  }));
  $("receipt").hidden = !receipt;
  $("receipt").textContent = receipt ? "One local publication" : "";
  $("memory").textContent = state.memory ? "New runs default to " + state.memory + "." : "No saved output preference.";
  $("save-memory").disabled = storageUnavailable;
  $("clear-memory").disabled = !state.memory;
  $("history").replaceChildren(...state.runs.toReversed().map((item) => {
    const option = new Option(item.requirements.market + " / " + item.requirements.topic + " · " +
      item.id.slice(0, 8) + " · " + stageNames[item.stage], item.id);
    option.selected = item.id === state.active;
    return option;
  }));
  $("history").disabled = !terminal || state.runs.length < 2;
  $("log").replaceChildren(...(run?.events ?? []).toReversed().map((event) =>
    element("li", "v" + event.version + " · " + event.label)));
  const latest = new Map(state.evidence.filter((doc) => doc.project === "compliance-demo" && doc.access === "demo")
    .map((doc) => [doc.id, doc]));
  const libraryKey = [...latest.values()].map((doc) => doc.id + "@" + doc.version).join(",");
  if ($("library").dataset.key !== libraryKey) {
    $("library").dataset.key = libraryKey;
    $("library").replaceChildren(...[...latest.values()].map((doc) => {
      const row = Object.assign(element("div", ""), { className: "library-row" });
      const button = element("button", doc.deleted ? "Restore" : "Withdraw");
      button.addEventListener("click", () => dispatch({ type: "source", id: doc.id, withdraw: !doc.deleted }));
      row.append(element("span", doc.id + " · v" + doc.version + (doc.deleted ? " · withdrawn" : "")), button);
      return row;
    }));
  }
  clearTimeout(timer);
  if (run && isRunnable(run) && !run.paused && (!pendingReceipt || recover)) {
    timer = setTimeout(() => tick(state, run), pendingReceipt ? 0 : 1250);
  }
}

async function tick(snapshot, run) {
  try {
    const retrieval = run.stage === "retrieve" ? {
      corpusSize: snapshot.evidence.length,
      documents: await retrieveInParallel(snapshot, run),
    } : undefined;
    await dispatch({ type: "tick", id: run.id, version: run.version, stage: run.stage, now: Date.now(), retrieval });
  } catch (error) { report(error); }
}

async function dispatch(command) {
  if (!state || storageUnavailable) return;
  const id = ++revision;
  const run = activeRun(state);
  const guard = ["pause", "resume", "retry", "approve", "cancel", "revise"].includes(command.type) && run
    ? { id: run.id, version: run.version, stage: run.stage } : undefined;
  try {
    const { state: next, changed } = await transact(command, guard);
    if (id === revision) {
      const finishedNow = canStart(next) && run && !["completed", "cancelled"].includes(run.stage);
      show(next);
      if ((command.type === "memory" || finishedNow) && canStart(next) && next.memory) $("language").value = next.memory;
    }
    if (changed) updates.postMessage("changed");
  } catch (error) { report(error); }
}

updates.onmessage = async () => {
  const id = revision;
  try {
    const { state: next } = await transact();
    if (revision === id && !storageUnavailable) show(next);
  } catch (error) { report(error); }
};
$("requirements").onsubmit = (event) => {
  event.preventDefault();
  void dispatch({ type: "start", id: crypto.randomUUID(), requirements: requirements(), fault: $("fault").value });
};
$("revise").onclick = () => dispatch({ type: "revise", requirements: requirements() });
for (const type of ["pause", "resume", "retry", "cancel"]) $(type).onclick = () => dispatch({ type });
$("approve").onclick = () => dispatch({ type: "approve", token: activeRun(state)?.approval?.token });
$("save-memory").onclick = () => dispatch({ type: "memory", value: $("language").value });
$("clear-memory").onclick = () => dispatch({ type: "memory" });
$("history").onchange = () => dispatch({ type: "select", id: $("history").value });
$("theme").onclick = () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("mindverse-theme", theme); } catch { /* Theme preference is optional. */ }
};
try { document.documentElement.dataset.theme = localStorage.getItem("mindverse-theme") ?? "light"; } catch { /* Keep CSS default. */ }

let canvas = structuredClone(initialSnapshot);
canvas.projectName = "Compliance research notes";
canvas.nodes[0].data.title = "Research brief";
canvas.nodes[0].data.textContent = "Compare fictional onboarding or monitoring rules across two markets.";
canvas.nodes[1].data.title = "Review checklist";
canvas.nodes[1].data.textContent = "Verify source versions, surface contradictions, and request approval.";
try {
  const saved = localStorage.getItem("mindverse-challenge:canvas:v1");
  if (saved) canvas = parseSnapshot(JSON.parse(saved));
} catch { $("canvas-status").textContent = "Saved canvas could not be loaded."; }

function renderCanvas() {
  $("canvas-name").value = canvas.projectName;
  $("canvas").replaceChildren(...canvas.nodes.map((node) => {
    const card = element("article", "");
    const title = element("input", "");
    title.value = node.data.title;
    title.maxLength = 120;
    title.setAttribute("aria-label", "Note title");
    title.oninput = () => { node.data.title = title.value; renderEdges(); };
    const note = element("textarea", "");
    note.value = node.data.textContent;
    note.maxLength = 12000;
    note.setAttribute("aria-label", "Note text");
    note.oninput = () => { node.data.textContent = note.value; };
    card.append(title);
    if (node.data.imageUrl === "/samples/reference.png") {
      const image = element("img", "");
      image.src = "/samples/reference.png";
      image.alt = node.data.title;
      card.append(image);
    }
    const remove = element("button", "Delete note");
    remove.onclick = () => {
      canvas.nodes = canvas.nodes.filter(({ id }) => id !== node.id);
      canvas.edges = canvas.edges.filter(({ source, target }) => ![source, target].includes(node.id));
      renderCanvas();
    };
    card.append(note, remove);
    return card;
  }));
  renderEdges();
}

function renderEdges() {
  for (const id of ["edge-source", "edge-target"]) {
    const value = $(id).value;
    $(id).replaceChildren(...canvas.nodes.map((node) => new Option(node.data.title, node.id)));
    if (canvas.nodes.some((node) => node.id === value)) $(id).value = value;
  }
  const titles = new Map(canvas.nodes.map((node) => [node.id, node.data.title]));
  $("edges").replaceChildren(...canvas.edges.map((edge) => {
    const row = element("li", titles.get(edge.source) + " → " + titles.get(edge.target));
    const remove = element("button", "Remove link");
    remove.onclick = () => { canvas.edges = canvas.edges.filter(({ id }) => id !== edge.id); renderEdges(); };
    row.append(remove);
    return row;
  }));
}

$("canvas-name").oninput = (event) => { canvas.projectName = event.target.value; };
$("add-note").onclick = () => {
  if (canvas.nodes.length >= 80) return;
  canvas.nodes.push({ id: crypto.randomUUID(), type: "creative", position: { x: 0, y: 0 },
    data: { nodeType: "text", title: "New note", textContent: "", status: "idle" } });
  renderCanvas();
};
$("add-edge").onclick = () => {
  const [source, target] = [$("edge-source").value, $("edge-target").value];
  if (!source || !target || source === target || canvas.edges.length >= 160 ||
      canvas.edges.some((edge) => edge.source === source && edge.target === target)) return;
  canvas.edges.push({ id: crypto.randomUUID(), source, target });
  renderEdges();
};
$("save-canvas").onclick = () => {
  try {
    localStorage.setItem("mindverse-challenge:canvas:v1", JSON.stringify(canvas));
    $("canvas-status").textContent = "Canvas saved.";
  } catch { $("canvas-status").textContent = "Canvas could not be saved."; }
};
$("export-canvas").onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(canvas, null, 2)], { type: "application/json" }));
  Object.assign(element("a", ""), { href: url, download: "mindverse-canvas.json" }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("import-canvas").onclick = () => $("canvas-file").click();
$("canvas-file").onchange = async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("File is too large");
    const imported = parseSnapshot(JSON.parse(await file.text()));
    if (imported.nodes.length > 80 || imported.edges.length > 160) throw new Error("Canvas is too large");
    canvas = imported;
    renderCanvas();
    $("canvas-status").textContent = "Canvas imported.";
  } catch { $("canvas-status").textContent = "Invalid canvas or size limit exceeded."; }
};

renderCanvas();
transact().then(({ state: data }) => show(data, true)).catch(report);
