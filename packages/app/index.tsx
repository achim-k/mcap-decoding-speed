import { createRoot } from "react-dom/client";

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Input,
  LinearProgress,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ParsedChannel,
  parseChannel,
} from "../studio/packages/mcap-support/src";
import EnhancedTable from "./ResultTable";
import RunHistory from "./RunHistory";
import WorkerInterface from "./WorkerInterface";
import { ChannelStats, McapInfo, Message, RawMessage } from "./types";
import { fromNanoSec, median, toSec } from "./utils";

type Config = {
  messageBatchSize: number;
  deserializeInWorker: boolean;
  selectedChannelIds: readonly number[];
};

type TotalAndMedian = {
  median: number;
  total: number;
  cycles: number[];
};

type RunStatistics = {
  progress: number;
  totalTimeSec: number;
  realTimeFactor: number;
  deserializationDuration: TotalAndMedian;
  fetchMessageDuration: TotalAndMedian;
  postMessageDuration: TotalAndMedian;
  structuredDeserializeDuration: TotalAndMedian;
};

export type CompletedRun = {
  filename: string;
  config: Config;
  stats: RunStatistics;
  statsByChannel: Map<number, ChannelStats>;
}

type State = {
  isRunning: boolean;
  currentStats: RunStatistics;
};

const EMPTY_RUN_STATS : RunStatistics = {
  progress: 0,
  realTimeFactor: 0,
  totalTimeSec: 0,
  deserializationDuration: { median: 0, total: 0, cycles: [] },
  fetchMessageDuration: { median: 0, total: 0, cycles: [] },
  postMessageDuration: { median: 0, total: 0, cycles: [] },
  structuredDeserializeDuration: { median: 0, total: 0, cycles: [] },
};

const EMPTY_STATE: State = {
  isRunning: false,
  currentStats: { ...EMPTY_RUN_STATS },
};

type CurrentRun = {
  statsByChannel: Map<number, ChannelStats>;
  deserializerByChannelId: Map<number, ParsedChannel["deserialize"]>;
  messageTimeRead?: bigint;
  performanceStart?: number;
  stopped?: boolean;
  stats: RunStatistics;
};

const worker = new WorkerInterface();
const currentRun: CurrentRun = {
  statsByChannel: new Map(),
  deserializerByChannelId: new Map(),
  stats: { ...EMPTY_RUN_STATS },
};

function aggregateRunStats(
  run: CurrentRun,
  fileInfo: McapInfo
): RunStatistics {
  const secondsSinceStart = run.performanceStart
    ? (performance.now() - run.performanceStart) / 1e3
    : 0;
  const secondsRead = toSec(fromNanoSec(run.messageTimeRead ?? 0n));
  const fileDurationSeconds = toSec(
    fromNanoSec(fileInfo.endTime - fileInfo.startTime)
  );
  const realTimeFactor = secondsRead / secondsSinceStart;
  const progress = secondsRead / fileDurationSeconds;
  const deserializationMedian = median(run.stats.deserializationDuration.cycles) ?? 0;
  const fetchMessageMedian = median(run.stats.fetchMessageDuration.cycles) ?? 0;
  const structuredDeerializeMedian = median(run.stats.structuredDeserializeDuration.cycles) ?? 0;
  const postMessageMedian = median(run.stats.postMessageDuration.cycles) ?? 0;

  run.stats.deserializationDuration.cycles = [];
  run.stats.fetchMessageDuration.cycles = [];
  run.stats.structuredDeserializeDuration.cycles = [];
  run.stats.postMessageDuration.cycles = [];

  return {
    progress,
    totalTimeSec: secondsSinceStart,
    realTimeFactor,
    deserializationDuration: {
      ...run.stats.deserializationDuration,
      cycles: [],
      median: deserializationMedian,
    },
    fetchMessageDuration: {
      ...run.stats.fetchMessageDuration,
      cycles: [],
      median: fetchMessageMedian,
    },
    structuredDeserializeDuration: {
      ...run.stats.structuredDeserializeDuration,
      cycles: [],
      median: structuredDeerializeMedian,
    },
    postMessageDuration: {
      ...run.stats.postMessageDuration,
      cycles: [],
      median: postMessageMedian,
    },
  };
}

function App() {
  const [fileInfo, setFileInfo] = useState<McapInfo & { filename: string } | undefined>();
  const [config, setConfig] = useState<Config>({
    messageBatchSize: 1,
    deserializeInWorker: true,
    selectedChannelIds: [],
  });
  const [state, setState] = useState<State>(EMPTY_STATE);
  const fileInputRef = useRef<HTMLInputElement>();
  const [runHistory, setRunHistory] = useState<CompletedRun[]>([]);

  // Re-render every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.isRunning || !fileInfo) {
        return;
      }

      setState((oldState) => ({
        ...oldState,
        currentStats: aggregateRunStats(
          currentRun,
          fileInfo,
        ),
      }));
    }, 500);
    return () => clearInterval(interval);
  }, [state, setState, fileInfo]);

  const onInputChange = useCallback(
    (event: any) =>
      setConfig((cfg) => ({
        ...cfg,
        messageBatchSize: event.target.value
          ? Math.max(1, parseInt(event.target.value))
          : 1,
      })),
    [setConfig]
  );
  const onChechboxChange = useCallback(
    (_event: any, checked: boolean) =>
      setConfig((cfg) => ({ ...cfg, deserializeInWorker: checked })),
    [setConfig]
  );
  const onSelected = useCallback(
    (selectedIds: readonly number[]) =>
      setConfig((oldConfig) => ({
        ...oldConfig,
        selectedChannelIds: selectedIds,
      })),
    []
  );

  const onFileInputChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files || event.target.files.length === 0) {
        setFileInfo(undefined);
        return;
      }

      const selectedFile = event.target.files[0]!;
      const { startTime, endTime, channelsById, schemasById } =
        await worker.initialize(selectedFile);

      currentRun.statsByChannel.clear();
      currentRun.deserializerByChannelId.clear();
      currentRun.stats = structuredClone(EMPTY_RUN_STATS);

      for (const [, channel] of channelsById.entries()) {
        try {
          const schema = schemasById.get(channel.schemaId);
          currentRun.statsByChannel.set(channel.id, {
            id: channel.id,
            messageEncoding: channel.messageEncoding,
            schemaEncoding: schema?.encoding ?? "",
            schemaName: schema?.name ?? "",
            topic: channel.topic,
            totalBytes: 0,
            totalDurationMs: 0,
            totalMessages: 0,
          });
          const { deserialize } = parseChannel({
            messageEncoding: channel.messageEncoding,
            schema,
          });
          currentRun.deserializerByChannelId.set(channel.id, deserialize);
        } catch (err) {
          console.error(
            `Failed to parse channel ${channel.id} (${channel.topic})`
          );
        }
      }

      setFileInfo({
        startTime,
        endTime,
        channelsById,
        schemasById,
        filename: selectedFile.name,
      });
      setConfig((oldConfig) => ({
        ...oldConfig,
        selectedChannelIds: [...channelsById.keys()],
      }));
      setState({
        ...EMPTY_STATE,
      });
    },
    [setFileInfo, setConfig, setState]
  );

  const onStopClick = useCallback(() => {
    currentRun.stopped = true;
  }, []);

  const onRunClick = useCallback(async () => {
    if (!fileInfo) {
      return;
    }

    for (const channelStats of currentRun.statsByChannel.values()) {
      channelStats.totalBytes = 0;
      channelStats.totalDurationMs = 0;
      channelStats.totalMessages = 0;
    }

    setState({
      ...EMPTY_STATE,
      isRunning: true,
    });

    const selectedTopics: string[] = config.selectedChannelIds.map(
      (channelId) => currentRun.statsByChannel.get(channelId)!.topic
    );

    await worker.createIterator({
      topics: selectedTopics,
      deserialize: config.deserializeInWorker,
    });

    let firstMessageLogTime: bigint | undefined = undefined;
    currentRun.messageTimeRead = undefined;
    currentRun.stopped = false;
    currentRun.performanceStart = performance.now();
    currentRun.stats = structuredClone(EMPTY_RUN_STATS);

    while (!currentRun.stopped) {
      const cycleStart = performance.now();
      const { messages, postMessageDuration, structuredDeserializeDuration } =
        await worker.fetchMessages(config.messageBatchSize);
      const fetchDuration = performance.now() - cycleStart;
      if (!messages.length) break;

      firstMessageLogTime ??= messages[0]!.logTime;
      currentRun.messageTimeRead =
        messages[messages.length - 1]!.logTime - firstMessageLogTime;

      let deserializationDuration = 0;
      for (const msg of messages) {
        if (config.deserializeInWorker) {
          const { channelId, sizeInBytes, deserializationTimeMs } =
            msg as Message;
          const channelStats = currentRun.statsByChannel.get(channelId)!;
          channelStats.totalBytes += sizeInBytes;
          channelStats.totalMessages += 1;
          channelStats.totalDurationMs += deserializationTimeMs;
          deserializationDuration += deserializationTimeMs;
        } else {
          const { channelId, data } = msg as RawMessage;
          const channelStats = currentRun.statsByChannel.get(channelId)!;
          channelStats.totalBytes += data.byteLength;
          channelStats.totalMessages += 1;
          const deserialize = currentRun.deserializerByChannelId.get(channelId);
          if (deserialize) {
            const start = performance.now();
            deserialize(data);
            const deserializationTimeMs = performance.now() - start;
            channelStats.totalDurationMs += deserializationTimeMs;
            deserializationDuration += deserializationTimeMs;
          }
        }
      }

      if (messages.length < config.messageBatchSize) {
        break; // End of file.
      }

      currentRun.stats.deserializationDuration.total += deserializationDuration;
      currentRun.stats.deserializationDuration.cycles.push(deserializationDuration);
      currentRun.stats.fetchMessageDuration.total += fetchDuration;
      currentRun.stats.fetchMessageDuration.cycles.push(fetchDuration);
      currentRun.stats.postMessageDuration.total += postMessageDuration;
      currentRun.stats.postMessageDuration.cycles.push(postMessageDuration);
      currentRun.stats.structuredDeserializeDuration.total += structuredDeserializeDuration;
      currentRun.stats.structuredDeserializeDuration.cycles.push(structuredDeserializeDuration);
    }

    const runStats = aggregateRunStats(currentRun, fileInfo);

    setState((oldState) => ({
      ...oldState,
      isRunning: false,
      totalTimeSec: (performance.now() - currentRun.performanceStart!) / 1000,
      currentStats: runStats,
    }));
    setRunHistory((oldHistory) => [...oldHistory, {
      config,
      filename: fileInfo.filename,
      stats: { ...runStats },
      statsByChannel: structuredClone(currentRun.statsByChannel),
    }]);
  }, [fileInfo, config]);

  return (
    <div>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={"center"}
      >
        <Input
          ref={fileInputRef}
          type="file"
          inputProps={{
            accept: ".mcap",
          }}
          onChange={onFileInputChange}
          disableUnderline
          disabled={state.isRunning}
        />

        <Stack direction={"row"} gap={1}>
          <Typography>Fetch messages in batches of</Typography>
          <Input
            sx={{ maxWidth: "60px" }}
            id="filled-number"
            type="number"
            size="small"
            value={config.messageBatchSize}
            onChange={onInputChange}
            disabled={state.isRunning}
          />
        </Stack>
        <FormGroup>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                disabled={state.isRunning}
                onChange={onChechboxChange}
                checked={config.deserializeInWorker}
              />
            }
            label="Deserialize in worker"
          />
        </FormGroup>
        {!state.isRunning && (
          <Button
            size="small"
            variant="outlined"
            onClick={onRunClick}
            disabled={fileInfo == undefined}
          >
            Run
          </Button>
        )}
        {state.isRunning && (
          <Button
            size="small"
            variant="outlined"
            onClick={onStopClick}
            color="error"
          >
            Stop
          </Button>
        )}
      </Stack>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        gap={2}
        alignItems={"center"}
      >
        <Tooltip title="Total elapsed time">
          <Typography>
            Elapsed time:{" "}
            <Typography component="span" fontWeight={700}>
              {state.currentStats.totalTimeSec.toFixed(2)} s
            </Typography>
          </Typography>
        </Tooltip>
        <Tooltip title="Total time for fetching messages as well as the time for structuredDeserialize (main thread) and postMessage (worker). For all three times, the total and the median time (per batch) are shown. Note that the time for fetching messages is the roundtrip time which includes time to read messages from the mcap file and eventually deserializing them in the worker.">
          <Stack direction={"row"} divider={<span>|</span>} spacing={1}>
            <Typography component="span">Message fetching</Typography>
            <Typography fontWeight={700}>
              {(state.currentStats.fetchMessageDuration.total / 1e3).toFixed(2)}{" "}
              s ({state.currentStats.fetchMessageDuration.median.toFixed(2)} ms)
            </Typography>
            <Typography fontWeight={700}>
              {(
                state.currentStats.structuredDeserializeDuration.total / 1e3
              ).toFixed(2)}{" "}
              s (
              {state.currentStats.structuredDeserializeDuration.median.toFixed(
                2
              )}{" "}
              ms)
            </Typography>
            <Typography fontWeight={700}>
              {(state.currentStats.postMessageDuration.total / 1e3).toFixed(2)}{" "}
              s ({state.currentStats.postMessageDuration.median.toFixed(2)} ms)
            </Typography>
          </Stack>
        </Tooltip>
        <Tooltip
          title={`Total time (and median time) to deserialize all messages in the batch.`}
        >
          <Typography>
            Deserialization:{" "}
            <Typography component="span" fontWeight={700}>
              {(state.currentStats.deserializationDuration.total / 1e3).toFixed(
                2
              )}{" "}
              s ({state.currentStats.deserializationDuration.median.toFixed(2)}{" "}
              ms)
            </Typography>
          </Typography>
        </Tooltip>
        <Tooltip title="Factor indicating if messages can be read in realtime speed. A factor of 1 means that messages are read at the same speed as they were recorded. Higher is better.">
          <Typography>
            Reading speed:
            <Typography component="span" fontWeight={700}>
              {state.currentStats.realTimeFactor.toFixed(2)}x
            </Typography>
          </Typography>
        </Tooltip>
      </Stack>

      <Box sx={{ width: "100%", paddingTop: "1em", paddingBottom: "1em" }}>
        <LinearProgress
          variant="determinate"
          value={state.currentStats.progress * 100}
        />
      </Box>
      <EnhancedTable
        data={[...currentRun.statsByChannel.values()]}
        selected={config.selectedChannelIds}
        onSelected={onSelected}
        disabled={fileInfo == undefined || state.isRunning}
      />

      <Accordion sx={{marginTop: "1em"}}>
        <AccordionSummary
          aria-controls="panel1-content"
          id="panel1-header"
        >
          <Typography>Run History ({runHistory.length})</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <RunHistory history={runHistory} />
        </AccordionDetails>
      </Accordion>

    </div>
  );
}

const domNode = document.getElementById("app");
const root = createRoot(domNode!);
root.render(<App />);
