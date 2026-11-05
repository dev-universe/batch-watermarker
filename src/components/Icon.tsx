import type { CSSProperties } from "react";

const paths = {
  add: "M12 5v14M5 12h14",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8M8 17h6",
  layers: "m12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5",
  close: "m6 6 12 12M6 18 18 6",
  lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5V10Zm7 5v3",
  unlock: "M7 10V7a5 5 0 0 1 9-3M5 10h14v12H5V10Zm7 5v3",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  copy: "M9 9h12v12H9V9ZM15 5V2H2v13h3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  hidden: "m3 3 18 18M10 5h2c6 0 10 7 10 7a22 22 0 0 1-4 4M6 6a22 22 0 0 0-4 6s4 7 10 7h2",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7",
  export: "M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6",
  undo: "M9 4 3 10l6 6M3 10h11a6 6 0 0 1 6 6v4",
  redo: "m15 4 6 6-6 6m6-6H10a6 6 0 0 0-6 6v4"
} as const;

export function Icon({ name, style }: { name: keyof typeof paths; style?: CSSProperties }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={paths[name]} />
    </svg>
  );
}
