import { createRoot } from "react-dom/client";

import {
  Button,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { ChannelResult } from "./types";

const worker = new Worker(new URL("./worker.js", import.meta.url));

export default function Results(props: { results: ChannelResult[] }) {
  const { results } = props;
  results.sort((a, b) => b.totalDurationMs - a.totalDurationMs);

  return (
    <TableContainer>
      <Table sx={{ minWidth: 650 }} size="small" aria-label="a dense table">
        <TableHead>
          <TableRow>
            <TableCell>Topic</TableCell>
            <TableCell align="right">Schema encoding</TableCell>
            <TableCell align="right">Message encoding</TableCell>
            <TableCell align="right">Messages</TableCell>
            <TableCell align="right">Total bytes</TableCell>
            <TableCell align="right">Duration</TableCell>
            <TableCell align="right">Speed</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {results.map((channelResult) => (
            <TableRow
              key={channelResult.id}
              sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
            >
              <TableCell component="th" scope="row">
                {channelResult.topic}
              </TableCell>
              <TableCell align="right">
                {channelResult.schemaEncoding}
              </TableCell>
              <TableCell align="right">
                {channelResult.messageEncoding}
              </TableCell>
              <TableCell align="right">{channelResult.totalMessages}</TableCell>
              <TableCell align="right">
                {channelResult.totalBytes.toExponential(2)} byte
              </TableCell>
              <TableCell align="right">
                {(channelResult.totalDurationMs / 1000).toFixed(2)} s
              </TableCell>
              <TableCell align="right">
                {channelResult.bytesPerSec.toExponential(2)} byte/s
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function App() {
  const [file, setFile] = useState<File | undefined>();
  const [chunkSize, setChunkSize] = useState<number>(100);
  const [state, setState] = useState<{
    results: ChannelResult[];
    isDone: boolean;
  }>({ isDone: true, results: [] });

  const onSliderChange = useCallback(
    (_event: any, value: number | number[]) => setChunkSize(value as number),
    []
  );
  const onRunClick = useCallback(() => {
    worker.postMessage({ blob: file, chunkSizeMb: chunkSize });
  }, [file, state, chunkSize]);

  useEffect(() => {
    worker.onmessage = (message) => {
      const { results, isDone } = message.data;
      setState({
        results,
        isDone,
      });
    };
  }, []);

  return (
    <div>
      <input
        type="file"
        id="file-picker"
        accept=".mcap"
        onChange={(event) => {
          setFile(event.target.files ? event.target.files[0] : undefined);
        }}
      />
      <div>
        <Typography>
          Deserialize every <b>{chunkSize}</b> MB worth of messages
        </Typography>
        <Slider
          defaultValue={100}
          aria-label="Default"
          valueLabelDisplay="auto"
          size="small"
          sx={{ maxWidth: "200px" }}
          min={1}
          max={500}
          onChange={onSliderChange}
        />
      </div>
      <Button
        size="small"
        variant="outlined"
        onClick={onRunClick}
        disabled={file == undefined || !state.isDone}
      >
        Run
      </Button>
      <hr />
      <Results results={state.results} />
    </div>
  );
}

const domNode = document.getElementById("app");
const root = createRoot(domNode!);
root.render(<App />);
