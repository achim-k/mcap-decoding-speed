import { Button } from "@mui/material";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { memo } from "react";
import { CompletedRun } from ".";

const RunHistory = memo(function RunHistory(props: {
  history: CompletedRun[];
}) {
  return (
    <>
      <TableContainer>
        <Table sx={{ minWidth: 650 }} size="small" aria-label="a dense table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Filename</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Progress
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Batch size
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Deserialization place
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Total time
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Deserialization
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Message fetching
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                structuredDeserialize
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                postMessage
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">
                Read speed
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {props.history.map((run, idx) => {
              const numMsgs = Array.from(run.statsByChannel.values()).reduce(
                (acc, stats) => acc + stats.totalMessages,
                0
              );
              const numBatches = Math.ceil(numMsgs / run.config.messageBatchSize);

              return (
                <TableRow
                  key={idx}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {run.filename}
                  </TableCell>
                  <TableCell align="right">
                    {(run.stats.progress * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell align="right">
                    {run.config.messageBatchSize}
                  </TableCell>
                  <TableCell align="right">
                    {run.config.deserializeInWorker ? "worker" : "main"}
                  </TableCell>
                  <TableCell align="right">
                    {run.stats.totalTimeSec.toFixed(2)}
                  </TableCell>
                  <TableCell align="right">
                    {(run.stats.deserializationDuration.total / 1e3).toFixed(2)}{" "}
                    s ({(run.stats.deserializationDuration.total / numBatches).toFixed(2)} ms)
                  </TableCell>
                  <TableCell align="right">
                    {(run.stats.fetchMessageDuration.total / 1e3).toFixed(2)} s
                    ({(run.stats.fetchMessageDuration.total / numBatches).toFixed(2)} ms)
                  </TableCell>
                  <TableCell align="right">
                    {(
                      run.stats.structuredDeserializeDuration.total / 1e3
                    ).toFixed(2)}{" "}
                    s (
                    {(run.stats.structuredDeserializeDuration.total / numBatches).toFixed(2)}{" "}
                    ms)
                  </TableCell>
                  <TableCell align="right">
                    {(run.stats.postMessageDuration.total / 1e3).toFixed(2)} s (
                    {(run.stats.postMessageDuration.total / numBatches).toFixed(2)} ms)
                  </TableCell>
                  <TableCell align="right">
                    {run.stats.realTimeFactor.toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Button
        sx={{ marginTop: "1em" }}
        variant="contained"
        color="success"
        onClick={() => {
          const replacer = (_key: string, value: unknown) => {
            if (value instanceof Map) {
              return {
                dataType: "Map",
                value: Array.from(value.entries()),
              };
            } else {
              return value;
            }
          };

          function download(
            content: string,
            fileName: string,
            contentType: string
          ) {
            var a = document.createElement("a");
            var file = new Blob([content], { type: contentType });
            a.href = URL.createObjectURL(file);
            a.download = fileName;
            a.click();
          }

          download(
            JSON.stringify(props.history, replacer, 2),
            "decoding-speed-results.json",
            "text/plain"
          );
        }}
      >
        Save as JSON
      </Button>
    </>
  );
});

export default RunHistory;
