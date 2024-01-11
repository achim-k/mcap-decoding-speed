export type ChannelResult = {
  id: number
  topic: string
  schemaName: string
  schemaEncoding: string
  messageEncoding: string
  totalBytes: number,
  totalMessages: number,
  totalDurationMs: number,
  bytesPerSec: number
}