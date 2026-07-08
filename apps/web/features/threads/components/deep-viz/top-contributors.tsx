"use client";

import type { TopContributorsBlock } from "@aqsha/chat-core/deep-viz";
import { BookOpenIcon, UsersRoundIcon } from "@aqsha/ui/icons";
import type { ComponentType } from "react";
import { PaperPills } from "./viz-block";

/**
 * Kontributor teratas (ala Consensus): tabel Tipe | Nama | Paper — kolom tipe di-rowspan per
 * grup (ikon + label "Author"/"Jurnal"), nama jurnal italic, kolom paper = chip `[n]` (resolve
 * `CitationProvider`, `+n lagi` bila > 3). Pemisah baris hairline; header hairline lebih tegas.
 */
export function TopContributors({ block }: { block: TopContributorsBlock }) {
  const groups = [
    { label: "Author", icon: UsersRoundIcon, rows: block.authors, italic: false },
    { label: "Jurnal", icon: BookOpenIcon, rows: block.venues, italic: true },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-left text-[13px]">
        <thead>
          <tr className="border-b text-[12px] text-foreground">
            <th className="w-[26%] py-2.5 pr-3 font-semibold">Tipe</th>
            <th className="w-[34%] py-2.5 pr-3 font-semibold">Nama</th>
            <th className="py-2.5 font-semibold">Paper</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <ContributorGroup key={group.label} {...group} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContributorGroup({
  label,
  icon: Icon,
  rows,
  italic,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  rows: Array<{ name: string; papers: number[] }>;
  italic: boolean;
}) {
  return (
    <>
      {rows.map((row, i) => (
        <tr key={row.name} className="border-b border-border/60 last:border-b-0">
          {i === 0 ? (
            <th
              scope="rowgroup"
              rowSpan={rows.length}
              className="py-3.5 pr-3 align-top font-medium text-foreground"
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {label}
              </span>
            </th>
          ) : null}
          <td className={`py-3.5 pr-3 align-middle ${italic ? "italic" : ""}`}>
            <span className="block break-words text-foreground">{row.name}</span>
          </td>
          <td className="py-3.5 align-middle">
            <PaperPills papers={row.papers} />
          </td>
        </tr>
      ))}
    </>
  );
}
