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
export type FetchMessagesResult = {
  postMessageDuration: number,
  messages: Message[] | RawMessage[],
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

type InitializeRequest = {
  type: "initialize",
  blob: Blob,
}
type CreateIteratorRequest = {
  type: "createIterator",
  options: { topics?: string[], deserialize: boolean}
}
type FetchMessagesRequest = {
  type: "fetchMessages",
  messageBatchSize: number
}
export type WorkerRequest = InitializeRequest
| CreateIteratorRequest
| FetchMessagesRequest;

type InitializeResponse = {
  type: "initialize",
  fileInfo: McapInfo,
}
type CreateIteratorResponse = {
  type: "createIterator",
}
type FetchMessagesResponse = {
  type: "fetchMessages",
  result: FetchMessagesResult,
}

export type WorkerReponse = InitializeResponse
| CreateIteratorResponse
| FetchMessagesResponse;