/**
 * Ambient declarations minimal untuk @citation-js/* (paket tanpa .d.ts).
 * Hanya permukaan yang dipakai modul citations — jangan memperluas tanpa perlu.
 */
declare module "@citation-js/core" {
  export class Cite {
    constructor(data: unknown, options?: { forceType?: string; generateGraph?: boolean });
    data: Array<Record<string, unknown>>;
    format(format: string, options?: Record<string, unknown>): string;
  }
  export const plugins: {
    config: { get(ref: string): unknown };
    list(): IterableIterator<string>;
  };
}
declare module "@citation-js/plugin-bibtex";
declare module "@citation-js/plugin-ris";
declare module "@citation-js/plugin-csl";
