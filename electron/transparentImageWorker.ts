import { parentPort, workerData } from "node:worker_threads";
import { composeTransparentPage } from "./transparentImageComposition";
import { exportTransparentGroups } from "./transparentImageExport";

async function run() {
  const value = workerData.kind === "preview"
    ? new Uint8Array((await composeTransparentPage(workerData.request, { maxEdge: 1400 })).png)
    : await exportTransparentGroups(workerData.request, progress => parentPort!.postMessage({ type: "progress", progress }));
  parentPort!.postMessage({ type: "result", value });
}
run().catch(error => parentPort!.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) }));
