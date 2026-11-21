import { activeRun, applyCommand, initialState } from "./runtime.js";

const database = new Promise((resolve, reject) => {
  const request = indexedDB.open("mindverse-compliance-runtime", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("workspace");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
  request.onblocked = () => reject(new Error("Storage upgrade blocked"));
});

export async function transact(command, guard) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = command ? db.transaction("workspace", "readwrite", { durability: "strict" })
      : db.transaction("workspace", "readonly");
    const store = tx.objectStore("workspace");
    const request = store.get("runtime");
    let state, changed;
    request.onsuccess = () => {
      try {
        const previous = request.result ?? initialState();
        if (previous.schema !== 1) throw new Error("Unknown workspace format");
        const run = activeRun(previous);
        const admitted = !guard || (run?.id === guard.id && run.version === guard.version && run.stage === guard.stage);
        state = command && admitted ? applyCommand(previous, command) : previous;
        changed = state !== previous;
        if (changed) store.put(state, "runtime");
      } catch (error) {
        reject(error);
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve({ state, changed });
    tx.onabort = () => reject(tx.error ?? new Error("Storage transaction aborted"));
  });
}
