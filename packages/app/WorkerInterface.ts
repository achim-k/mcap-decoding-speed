import { McapInfo, WorkerReponse, WorkerRequest, FetchMessagesResult } from "./types";

export default class WorkerInterface {
  #worker = new Worker(new URL("./worker.js", import.meta.url));

  public async initialize(blob: Blob): Promise<McapInfo> {
    return await new Promise<McapInfo>((resolve) => {
      this.#worker.onmessage = (event: MessageEvent<WorkerReponse>) => {
        if (event.data.type === "initialize") {
          resolve(event.data.fileInfo);
        }
      };
      const request: WorkerRequest = {
        type: "initialize",
        blob,
      };
      this.#worker.postMessage(request);
    });
  }

  public async createIterator(options: { topics?: string[]; deserialize: boolean; }): Promise<void> {
    await new Promise<void>((resolve) => {
      this.#worker.onmessage = (event: MessageEvent<WorkerReponse>) => {
        if (event.data.type === "createIterator") {
          resolve();
        }
      };
      const request: WorkerRequest = {
        type: "createIterator",
        options,
      };
      this.#worker.postMessage(request);
    });
  }

  public async fetchMessages(messageBatchSize: number): Promise<FetchMessagesResult & { structuredDeserializeDuration: number }> {
    return await new Promise<
        FetchMessagesResult & { structuredDeserializeDuration: number }
      >((resolve) => {
        this.#worker.onmessage = (event: MessageEvent<WorkerReponse>) => {
          const deserializeStart = performance.now();
          if (!event.data) {
            return;  // Only there to measure event.data access time.
          }
          const structuredDeserializeDuration =
            performance.now() - deserializeStart;

          if (event.data.type === "fetchMessages") {
            resolve({
              messages: event.data.result.messages,
              postMessageDuration: event.data.result.postMessageDuration,
              structuredDeserializeDuration,
            });
          }
        };
        const request: WorkerRequest = {
          type: "fetchMessages",
          messageBatchSize,
        };
        this.#worker.postMessage(request);
      });
  }
};