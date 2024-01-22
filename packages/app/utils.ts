
export type Time = {
  sec: number;
  nsec: number;
};

export function toSec({ sec, nsec }: Time): number {
  return sec + nsec * 1e-9;
}

export function fromNanoSec(nsec: bigint): Time {
  return {
    sec: Number(nsec / 1_000_000_000n),
    nsec: Number(nsec % 1_000_000_000n),
  };
}

export function median(arr: number[]) {
  return arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
};