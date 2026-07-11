"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { readableApiErrorMessage } from "@/lib/api-error";
import { formatCitationAuthor, type CitationDetail, type ManualCitationFields } from "../types";

type FormState = {
  title: string;
  authors: string;
  publishedYear: string;
  venue: string;
  publisher: string;
  doi: string;
  url: string;
  tags: string;
};

function initialStateFor(citation: CitationDetail | null): FormState {
  return {
    title: citation?.title ?? "",
    authors: (citation?.authors ?? []).map(formatCitationAuthor).join("; "),
    publishedYear: citation?.publishedYear ? String(citation.publishedYear) : "",
    venue: citation?.venue ?? "",
    publisher: citation?.publisher ?? "",
    doi: citation?.doi ?? "",
    url: citation?.url ?? "",
    tags: (citation?.tags ?? []).join(", "),
  };
}

/** "Family, Given; Family, Given" / nama tunggal → CitationAuthor[]. */
function parseAuthorsInput(value: string): ManualCitationFields["authors"] {
  const parts = value
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  return parts.map((part) => {
    const comma = part.indexOf(",");
    if (comma > 0) {
      const family = part.slice(0, comma).trim();
      const given = part.slice(comma + 1).trim();
      return given ? { family, given } : { family };
    }
    return { literal: part };
  });
}

function fieldsFromState(state: FormState): ManualCitationFields {
  const year = Number.parseInt(state.publishedYear, 10);
  return {
    title: state.title.trim(),
    authors: parseAuthorsInput(state.authors),
    publishedYear: Number.isInteger(year) && year > 0 ? year : null,
    venue: state.venue.trim() || null,
    publisher: state.publisher.trim() || null,
    doi: state.doi.trim() || null,
    url: state.url.trim() || null,
  };
}

function tagsFromState(state: FormState): string[] {
  return state.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Form referensi manual — dipakai "Tambah manual" (citation=null) dan "Edit"
 * (citation terisi). Pola dialog konsisten `NameDialog` (submit async + error readable).
 */
export function CitationFormDialog({
  open,
  citation,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  citation: CitationDetail | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { fields: ManualCitationFields; tags: string[] }) => Promise<unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <CitationFormContent
          key={citation?.id ?? "new"}
          citation={citation}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function CitationFormContent({
  citation,
  onOpenChange,
  onSubmit,
}: {
  citation: CitationDetail | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: { fields: ManualCitationFields; tags: string[] }) => Promise<unknown>;
}) {
  const [state, setState] = useState<FormState>(() => initialStateFor(citation));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (event: FormEvent<HTMLInputElement>) =>
    setState((prev) => ({ ...prev, [key]: (event.target as HTMLInputElement).value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!state.title.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      await onSubmit({ fields: fieldsFromState(state), tags: tagsFromState(state) });
      onOpenChange(false);
    } catch (err) {
      setError(readableApiErrorMessage(err, "Gagal menyimpan referensi"));
    } finally {
      setPending(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{citation ? "Edit referensi" : "Tambah referensi manual"}</DialogTitle>
        <DialogDescription>
          Isi metadata inti — field lain bisa dilengkapi lewat edit kapan saja.
        </DialogDescription>
      </DialogHeader>
      <form className="grid gap-3" onSubmit={handleSubmit}>
        <LabeledInput label="Judul" required value={state.title} onInput={set("title")} />
        <LabeledInput
          label="Penulis"
          hint="pisahkan dengan ; — format Family, Given"
          value={state.authors}
          onInput={set("authors")}
        />
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="Tahun"
            value={state.publishedYear}
            onInput={set("publishedYear")}
            inputMode="numeric"
          />
          <LabeledInput label="Venue/jurnal" value={state.venue} onInput={set("venue")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="Penerbit" value={state.publisher} onInput={set("publisher")} />
          <LabeledInput label="DOI" value={state.doi} onInput={set("doi")} />
        </div>
        <LabeledInput label="URL" value={state.url} onInput={set("url")} />
        <LabeledInput
          label="Tag"
          hint="pisahkan dengan koma"
          value={state.tags}
          onInput={set("tags")}
        />
        {error ? <p className="text-[12px] font-medium text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Batal
          </Button>
          <Button type="submit" disabled={!state.title.trim() || pending}>
            {pending ? "Menyimpan…" : citation ? "Simpan" : "Tambah"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function LabeledInput({
  label,
  hint,
  required,
  value,
  onInput,
  inputMode,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  value: string;
  onInput: (event: FormEvent<HTMLInputElement>) => void;
  inputMode?: "numeric";
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
        {hint ? (
          <span className="ml-1.5 font-medium text-muted-foreground">({hint})</span>
        ) : null}
      </span>
      <Input value={value} onInput={onInput} inputMode={inputMode} />
    </label>
  );
}
