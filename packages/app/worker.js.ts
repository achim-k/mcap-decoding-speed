import { loadDecompressHandlers } from "@mcap/support";
import { McapIndexedReader } from "@mcap/core";
import { BlobReadable } from "@mcap/browser";
import { ParsedChannel, parseChannel } from "@foxglove/mcap-support";
import { ChannelResult } from "./types";

const decompressHandlersPromise = loadDecompressHandlers();
console.log("Worker loaded");

type Measurement = {
  numMsgs: number;
  numBytes: number;
  durationMs: number;
};

function measureDeserializationTime(
  messageDatas: Uint8Array[],
  deserialize: ParsedChannel["deserialize"]
): Measurement {
  let numBytes = 0;
  const start = performance.now();
  for (const data of messageDatas) {
    deserialize(data);
    numBytes += data.length;
  }
  const durationMs = performance.now() - start;
  return {
    durationMs,
    numBytes,
    numMsgs: messageDatas.length,
  };
}

async function run(blob: Blob, chunkSizeBytes: number) {
  console.log(chunkSizeBytes);
  const decompressHandlers = await decompressHandlersPromise;
  const reader = await McapIndexedReader.Initialize({
    readable: new BlobReadable(blob),
    decompressHandlers,
  });

  const deserializerByChannelId: Map<number, ParsedChannel["deserialize"]> =
    new Map();

  for (const [, channel] of reader.channelsById.entries()) {
    try {
      const schema = reader.schemasById.get(channel.schemaId);
      const { deserialize } = parseChannel({
        messageEncoding: channel.messageEncoding,
        schema,
      });
      deserializerByChannelId.set(channel.id, deserialize);
    } catch (err) {
      console.error(`Failed to parse channel ${channel.id} (${channel.topic})`);
    }
  }

  let chunkSizeInBytes = 0;
  let messageDataByChannelId: Map<number, Uint8Array[]> = new Map();
  let measurementsByChannelId: Map<number, Measurement[]> = new Map();

  const measureDeserializationTimes = () => {
    for (const [channelId, messages] of messageDataByChannelId.entries()) {
      const deserialize = deserializerByChannelId.get(channelId);
      if (deserialize == undefined) {
        continue;
      }

      const measurement = measureDeserializationTime(messages, deserialize);
      const channelMeasurements = measurementsByChannelId.get(channelId);
      if (channelMeasurements == undefined) {
        measurementsByChannelId.set(channelId, [measurement]);
      } else {
        channelMeasurements.push(measurement);
      }
    }
  };

  const postResults = (opts: { isDone: boolean }) => {
    const results: ChannelResult[] = [];

    for (const [, channel] of reader.channelsById.entries()) {
      const schema = reader.schemasById.get(channel.schemaId);
      const measurements = measurementsByChannelId.get(channel.id) ?? [];
      const totalBytes = measurements.reduce(
        (acc, measurement) => acc + measurement.numBytes,
        0
      );
      const totalMessages = measurements.reduce(
        (acc, measurement) => acc + measurement.numMsgs,
        0
      );
      const totalDurationMs = measurements.reduce(
        (acc, measurement) => acc + measurement.durationMs,
        0
      );

      results.push({
        id: channel.id,
        topic: channel.topic,
        schemaEncoding: schema?.encoding ?? "?",
        messageEncoding: channel.messageEncoding,
        totalBytes,
        totalMessages,
        totalDurationMs,
        bytesPerSec:
          totalDurationMs > 0 ? totalBytes / (totalDurationMs / 1000) : 0,
      });
    }

    self.postMessage({ results, isDone: opts.isDone });
  };

  for await (const message of reader.readMessages({
    validateCrcs: false,
  })) {
    const channelMessages = messageDataByChannelId.get(message.channelId);
    if (channelMessages == undefined) {
      messageDataByChannelId.set(message.channelId, [message.data]);
    } else {
      channelMessages.push(message.data);
    }

    chunkSizeInBytes += message.data.length;
    if (chunkSizeInBytes > chunkSizeBytes) {
      measureDeserializationTimes();
      postResults({ isDone: false });
      chunkSizeInBytes = 0;
      messageDataByChannelId = new Map();
    }
  }
  measureDeserializationTimes();
  postResults({ isDone: true });
}

self.onmessage = async (event) => {
  const { blob, chunkSizeMb } = event.data;
  await run(blob, chunkSizeMb * 1024 * 1024);
};
