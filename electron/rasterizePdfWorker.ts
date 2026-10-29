import { parentPort, workerData } from "node:worker_threads";
import { rasterizePdf } from "./rasterizePdf";

void rasterizePdf(workerData.bytes, workerData.profileId).then(
  (bytes) => parentPort!.postMessage({ bytes }, [bytes.buffer as ArrayBuffer]),
  (error: unknown) => parentPort!.postMessage({
    error: error instanceof Error ? error.message : String(error)
  })
);
