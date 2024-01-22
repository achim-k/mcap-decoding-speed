import * as comlink from "comlink";
import { createRoot } from "react-dom/client";

import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Input,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ParsedChannel,
  parseChannel,
} from "../studio/packages/mcap-support/src";
import EnhancedTable from "./ResultTable";
import {
  ChannelStats,
  McapInfo,
  Message,
  RawMessage,
  WorkerInterface,
} from "./types";
import { toSec, fromNanoSec, median } from "./utils";

type Config = {
  messageBatchSize: number;
  deserializeInWorker: boolean;
  selectedChannelIds: readonly number[];
};

type State = {
  isRunning: boolean;
  totalTimeSec: number;
  realTimeFactor: number;
  medianCycleDuration: number;
  medianFetchMessageDurations: number;
  progress: number;
};

const EMPTY_STATE: State = {
  isRunning: false,
  totalTimeSec: 0,
  realTimeFactor: 0,
  medianCycleDuration: 0,
  medianFetchMessageDurations: 0,
  progress: 0,
};

type RunState = {
  statsByChannel: Map<number, ChannelStats>;
  deserializerByChannelId: Map<number, ParsedChannel["deserialize"]>;
  firstMessageLogTime?: bigint;
  currentLogTime?: bigint;
  startMs?: number;
  cycleDurations: number[];
  fetchMessageDurations: number[];
  stopped?: boolean;
};

const worker = new Worker(new URL("./worker.js", import.meta.url));
const workerProxy = comlink.wrap<WorkerInterface>(worker);
const { initialize, createIterator, fetchMessages } = workerProxy;
const runState: RunState = {
  statsByChannel: new Map(),
  deserializerByChannelId: new Map(),
  cycleDurations: [],
  fetchMessageDurations: [],
};

function App() {
  const [fileInfo, setFileInfo] = useState<McapInfo | undefined>();
  const [config, setConfig] = useState<Config>({
    messageBatchSize: 1,
    deserializeInWorker: true,
    selectedChannelIds: [],
  });
  const [state, setState] = useState<State>(EMPTY_STATE);
  const fileInputRef = useRef<HTMLInputElement>();

  // Re-render every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (!state.isRunning) {
        return;
      }
      const secondsSinceStart = runState.startMs
        ? (performance.now() - runState.startMs) / 1e3
        : 0;
      const secondsRead = toSec(
        fromNanoSec(
          (runState.currentLogTime ?? 0n) - (runState.firstMessageLogTime ?? 0n)
        )
      );
      const realTimeFactor = secondsRead / secondsSinceStart;
      const medianCycleDuration = median(runState.cycleDurations);
      const medianFetchMessageDurations = median(
        runState.fetchMessageDurations
      );
      runState.cycleDurations = [];
      runState.fetchMessageDurations = [];

      const progress =
        fileInfo && runState.currentLogTime
          ? Number(runState.currentLogTime - fileInfo?.startTime) /
            Number(fileInfo?.endTime - fileInfo?.startTime)
          : 0;

      setState((oldState) => ({
        ...oldState,
        totalTimeSec: secondsSinceStart,
        realTimeFactor,
        medianCycleDuration: medianCycleDuration ?? 0,
        medianFetchMessageDurations: medianFetchMessageDurations ?? 0,
        progress,
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
        await initialize(selectedFile);

      runState.statsByChannel.clear();
      runState.deserializerByChannelId.clear();

      for (const [, channel] of channelsById.entries()) {
        try {
          const schema = schemasById.get(channel.schemaId);
          runState.statsByChannel.set(channel.id, {
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
          runState.deserializerByChannelId.set(channel.id, deserialize);
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
      });
      setConfig((oldState) => ({
        ...oldState,
        selectedChannelIds: [...channelsById.keys()],
      }));
      setState({
        ...EMPTY_STATE,
      });
    },
    [setFileInfo, setConfig, setState]
  );

  const onStopClick = useCallback(() => {
    runState.stopped = true;
  }, []);

  const onRunClick = useCallback(async () => {
    if (!fileInfo) {
      return;
    }

    for (const channelStats of runState.statsByChannel.values()) {
      channelStats.totalBytes = 0;
      channelStats.totalDurationMs = 0;
      channelStats.totalMessages = 0;
    }

    setState({
      ...EMPTY_STATE,
      isRunning: true,
    });

    const selectedTopics: string[] = config.selectedChannelIds.map(
      (channelId) => runState.statsByChannel.get(channelId)!.topic
    );

    await createIterator({
      topics: selectedTopics,
      deserialize: config.deserializeInWorker,
    });

    runState.firstMessageLogTime = runState.currentLogTime = undefined;
    const totalStart = (runState.startMs = performance.now());
    runState.stopped = false;

    while (!runState.stopped) {
      const cycleStart = performance.now();
      const msgs = await fetchMessages(config.messageBatchSize);
      const fetchDuration = performance.now() - cycleStart;
      runState.firstMessageLogTime ??= msgs[0]?.logTime;
      runState.currentLogTime = msgs[0]?.logTime;

      for (const msg of msgs) {
        if (config.deserializeInWorker) {
          const { channelId, sizeInBytes, deserializationTimeMs } =
            msg as Message;
          const channelStats = runState.statsByChannel.get(channelId)!;
          channelStats.totalBytes += sizeInBytes;
          channelStats.totalMessages += 1;
          channelStats.totalDurationMs += deserializationTimeMs;
        } else {
          const { channelId, data } = msg as RawMessage;
          const channelStats = runState.statsByChannel.get(channelId)!;
          channelStats.totalBytes += data.byteLength;
          channelStats.totalMessages += 1;
          const deserialize = runState.deserializerByChannelId.get(channelId);
          if (deserialize) {
            const start = performance.now();
            deserialize(data);
            const deserializationTimeMs = performance.now() - start;
            channelStats.totalDurationMs += deserializationTimeMs;
          }
        }
      }

      if (msgs.length < config.messageBatchSize) {
        break; // End of file.
      }

      const cycleDuration = performance.now() - cycleStart;
      runState.cycleDurations.push(cycleDuration);
      runState.fetchMessageDurations.push(fetchDuration);
    }

    setState((oldState) => ({
      ...oldState,
      isRunning: false,
      totalTimeSec: (performance.now() - totalStart) / 1000,
      progress: runState.stopped ? oldState.progress : 1,
    }));
  }, [fileInfo, state, config]);

  return (
    <div>
      <Stack
        direction={{ xs: "column", xl: "row" }}
        justifyContent={"space-between"}
      >
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
              Elapsed time: <b>{state.totalTimeSec.toFixed(2)}</b> s
            </Typography>
          </Tooltip>
          <Tooltip title="Median time to fetch messages from the worker (may include deserialization time if this is done on the worker)">
            <Typography>
              Fetch duration:{" "}
              <b>{state.medianFetchMessageDurations.toFixed(2)}</b> ms
            </Typography>
          </Tooltip>
          <Tooltip
            title={`Median time to fetch and deserialize messages of the specified bulk size (${config.messageBatchSize})`}
          >
            <Typography>
              Cycle duration: <b>{state.medianCycleDuration.toFixed(2)}</b> ms
            </Typography>
          </Tooltip>
          <Tooltip title="Factor indicating if messages can be read in realtime speed. A factor of 1 means that messages are read at the same speed as they were recorded. Higher is better.">
            <Typography>
              Reading speed: <b>{state.realTimeFactor.toFixed(2)}x</b>
            </Typography>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ width: "100%", paddingTop: "1em", paddingBottom: "1em" }}>
        <LinearProgress variant="determinate" value={state.progress * 100} />
      </Box>
      <EnhancedTable
        data={[...runState.statsByChannel.values()]}
        selected={config.selectedChannelIds}
        onSelected={onSelected}
        disabled={fileInfo == undefined || state.isRunning}
      />
    </div>
  );
}

const domNode = document.getElementById("app");
const root = createRoot(domNode!);
root.render(<App />);
