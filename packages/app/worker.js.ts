import { loadDecompressHandlers } from "@mcap/support";
import { McapIndexedReader } from "@mcap/core";
import { BlobReadable } from "@mcap/browser";
import { ParsedChannel, parseChannel } from "@foxglove/mcap-support";
import { Message, RawMessage, WorkerInterface } from "./types";
import * as comlink from "comlink";
import { TypedMcapRecords } from "@mcap/core/dist/esm/src/types";

const decompressHandlersPromise = loadDecompressHandlers();

class WorkerReader implements WorkerInterface {
  #reader?: McapIndexedReader;
  #deserialize: boolean = true;
  #deserializerByChannelId: Map<number, ParsedChannel["deserialize"]> =
    new Map();
  #iterator?: AsyncGenerator<TypedMcapRecords["Message"], void, void>

  public async initialize(blob: Blob) {
    const decompressHandlers = await decompressHandlersPromise;
    this.#reader = await McapIndexedReader.Initialize({
      readable: new BlobReadable(blob),
      decompressHandlers,
    });

    if (!this.#reader.statistics) {
      throw new Error("Failed to read mcap statistic record");
    }

    return {
      startTime: this.#reader.statistics?.messageStartTime,
      endTime: this.#reader.statistics?.messageEndTime,
      channelsById: new Map(this.#reader.channelsById.entries()),
      schemasById: new Map(this.#reader.schemasById.entries()),
    };
  }

  public async createIterator(options: {
    topics?: string[];
    deserialize: boolean;
  }) {
    if (!this.#reader) {
      throw new Error("Source not initialized");
    }

    this.#deserialize = options.deserialize;
    if (options.deserialize) {
      for (const [, channel] of this.#reader.channelsById.entries()) {
        try {
          const schema = this.#reader.schemasById.get(channel.schemaId);
          const { deserialize } = parseChannel({
            messageEncoding: channel.messageEncoding,
            schema,
          });
          this.#deserializerByChannelId.set(channel.id, deserialize);
        } catch (err) {
          console.error(
            `Failed to parse channel ${channel.id} (${channel.topic})`
          );
        }
      }
    }

    this.#iterator = this.#reader.readMessages({
      validateCrcs: false,
      topics: options.topics,
    });
  }

  public async fetchMessages(
    bulkSize: number
  ): Promise<Message[] | RawMessage[]> {
    if (!this.#iterator) {
      throw new Error("Iterator not initialized");
    }

    const messages: Message[] | RawMessage[] = [];
    for (let i = 0; i < bulkSize; i++) {
      const { done, value } = await this.#iterator.next();
      if (done) {
        return messages;
      }

      if (this.#deserialize) {
        const deserialize = this.#deserializerByChannelId.get(value.channelId);
        const message: Partial<Message> = {
          logTime: value.logTime,
          channelId: value.channelId,
          sizeInBytes: value.data.byteLength,
        };

        if (deserialize == undefined) {
          (messages as Message[]).push({
            ...message,
            data: value.data,
            deserializationTimeMs: 0,
          } as Message);
          continue;
        }

        const start = performance.now();
        const data = deserialize(value.data);
        const durationMs = performance.now() - start;
        (messages as Message[]).push({
          ...message,
          data,
          deserializationTimeMs: durationMs,
        } as Message);
      } else {
        (messages as RawMessage[]).push({
          logTime: value.logTime,
          channelId: value.channelId,
          data: value.data,
        });
      }
    }

    if (this.#deserialize) {
      return messages;
    } else {
      return comlink.transfer(
        messages,
        messages.map((msg) => (msg as RawMessage).data.buffer)
      );
    }
  }
}

const obj = new WorkerReader();
comlink.expose(obj);
