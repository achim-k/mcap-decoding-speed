import { Channel, Schema } from "@mcap/core/dist/esm/src/types";

type BaseMessage = {
  logTime: bigint,
  channelId: number,
}
export type RawMessage = BaseMessage & {
  channelId: number,
  data: Uint8Array,
}
export type Message =  BaseMessage &{
  channelId: number,
  data: unknown,
  sizeInBytes: number,
  deserializationTimeMs: number,
}
export type McapInfo = {
  startTime: bigint,
  endTime: bigint,
  channelsById: Map<number, Channel>;
  schemasById: Map<number, Schema>;
};
export type WorkerInterface = {
  initialize: (blob: Blob) => Promise<McapInfo>,
  createIterator: (options: { topics?: string[], deserialize: boolean}) => Promise<void>,
  fetchMessages: (messageBatchSize: number) => Promise<Message[] | RawMessage[]>,
}

export type ChannelStats = {
  id: number
  topic: string
  schemaName: string
  schemaEncoding: string
  messageEncoding: string
  totalBytes: number,
  totalMessages: number,
  totalDurationMs: number,
}