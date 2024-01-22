import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import { visuallyHidden } from '@mui/utils';
import * as React from 'react';
import { ChannelStats } from './types';

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) {
    return -1;
  }
  if (b[orderBy] > a[orderBy]) {
    return 1;
  }
  return 0;
}

type Order = 'asc' | 'desc';

function getComparator<Key extends keyof any>(
  order: Order,
  orderBy: Key,
): (
  a: { [key in Key]: number | string },
  b: { [key in Key]: number | string },
) => number {
  return order === 'desc'
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}


interface HeadCell {
  disablePadding: boolean;
  id: keyof ChannelStats;
  label: string;
  numeric: boolean;
}

const headCells: readonly HeadCell[] = [
  {
    id: 'topic',
    numeric: false,
    disablePadding: true,
    label: 'Topic',
  },
  {
    id: 'schemaName',
    numeric: false,
    disablePadding: false,
    label: 'Schema Name',
  },
  {
    id: 'schemaEncoding',
    numeric: false,
    disablePadding: false,
    label: 'Schema encoding',
  },
  {
    id: 'messageEncoding',
    numeric: false,
    disablePadding: false,
    label: 'message encoding',
  },
  {
    id: 'totalMessages',
    numeric: true,
    disablePadding: false,
    label: 'Total messages',
  },
  {
    id: 'totalBytes',
    numeric: true,
    disablePadding: false,
    label: 'Total bytes',
  },
  {
    id: 'totalDurationMs',
    numeric: true,
    disablePadding: false,
    label: 'Deserialization duration',
  },
];

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (event: React.MouseEvent<unknown>, property: keyof ChannelStats) => void;
  onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  order: Order;
  orderBy: string;
  rowCount: number;
  disabled?: boolean;
}

function ResultTable(props: EnhancedTableProps) {
  const { onSelectAllClick, order, orderBy, numSelected, rowCount, onRequestSort, disabled } =
    props;
  const createSortHandler =
    (property: keyof ChannelStats) => (event: React.MouseEvent<unknown>) => {
      onRequestSort(event, property);
    };

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            disabled={disabled}
            color="primary"
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            inputProps={{
              'aria-label': 'select all desserts',
            }}
          />
        </TableCell>
        {headCells.map((headCell, idx) => (
          <TableCell
            key={headCell.id}
            align={idx === 0 ? 'left' : 'right'}
            padding={headCell.disablePadding ? 'none' : 'normal'}
            sortDirection={orderBy === headCell.id ? order : false}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : 'asc'}
              onClick={createSortHandler(headCell.id)}
              sx={{fontWeight: 700}}
            >
              {headCell.label}
              {orderBy === headCell.id ? (
                <Box component="span" sx={visuallyHidden}>
                  {order === 'desc' ? 'sorted descending' : 'sorted ascending'}
                </Box>
              ) : null}
            </TableSortLabel>
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

type TableProps = {
  data: ChannelStats[],
  selected: readonly number[],
  onSelected: (selectedChannelIds: readonly number[]) => void,
  disabled?: boolean,
};

export default function EnhancedTable(props: TableProps) {
  const { data, selected, onSelected, disabled } = props;
  const [order, setOrder] = React.useState<Order>('desc');
  const [orderBy, setOrderBy] = React.useState<keyof ChannelStats>('totalDurationMs');

  const handleRequestSort = (
    _event: React.MouseEvent<unknown>,
    property: keyof ChannelStats,
  ) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const setSelected = React.useCallback((newSelected: readonly number[]) => {
    onSelected(newSelected);
  }, [onSelected, data]);

  const handleSelectAllClick = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) {
      const newSelected = data.map((n) => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  }, [data, setSelected]);

  const handleClick = React.useCallback((_event: React.MouseEvent<unknown>, id: number) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: readonly number[] = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1),
      );
    }
    setSelected(newSelected);
  }, [selected, setSelected]);

  const isSelected = (id: number) => selected.indexOf(id) !== -1;

  const orderedRows = React.useMemo(
    () =>
      data.slice().sort(getComparator(order, orderBy)),
    [order, orderBy, data],
  );

  return (
    <Box sx={{ width: '100%' }}>
        <TableContainer>
          <Table
            sx={{ minWidth: 750 }}
            aria-labelledby="tableTitle"
            size={'small'}
          >
            <ResultTable
              disabled={disabled}
              numSelected={selected.length}
              order={order}
              orderBy={orderBy}
              onSelectAllClick={handleSelectAllClick}
              onRequestSort={handleRequestSort}
              rowCount={data.length}
            />
            <TableBody>
              {orderedRows.map((row, index) => {
                const isItemSelected = isSelected(row.id);
                const labelId = `enhanced-table-checkbox-${index}`;

                return (
                  <TableRow
                    hover
                    onClick={(event) => handleClick(event, row.id)}
                    role="checkbox"
                    tabIndex={-1}
                    key={row.id}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        disabled={disabled}
                        color="primary"
                        checked={isItemSelected}
                        inputProps={{
                          'aria-labelledby': labelId,
                        }}
                      />
                    </TableCell>
                    <TableCell
                      component="th"
                      id={labelId}
                      scope="row"
                      padding="none"
                    >
                      {row.topic}
                    </TableCell>
                    <TableCell align="right">{row.schemaName}</TableCell>
                    <TableCell align="right">{row.schemaEncoding}</TableCell>
                    <TableCell align="right">{row.messageEncoding}</TableCell>
                    <TableCell align="right">{row.totalMessages}</TableCell>
                    <TableCell align="right">{row.totalBytes.toExponential(2)}</TableCell>
                    <TableCell align="right">{row.totalDurationMs.toFixed(2)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
    </Box>
  );
}
