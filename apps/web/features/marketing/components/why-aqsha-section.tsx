"use client";

import { useEffect, useRef, useState } from "react";
import {
  animate,
  m,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

const comparisonRows = [
  {
    problem: "Ngasih sumber yang ternyata nggak ada",
    others: "Perplexity, ChatGPT: sering ngarang referensi",
    aqsha: "Tiap sumber dicek ke paper aslinya",
  },
  {
    problem: "Kutipan nggak nyambung sama isi paper",
    others: "AI lain: asal tempel kutipan",
    aqsha: "Kalimatnya dicocokin ke isi aslinya",
  },
  {
    problem: "Tiba-tiba ditagih, susah berhenti langganan",
    others: "SciSpace: dikeluhkan auto-perpanjang & tagihan kejutan",
    aqsha: "Harga jelas, batal kapan aja",
  },
  {
    problem: "Limit dipangkas diam-diam",
    others: "Perplexity: deep research dipotong dari 600/hari jadi 20/bulan",
    aqsha: "Batas pemakaian jelas di depan",
  },
  {
    problem: "Jawabannya dangkal, cuma permukaan",
    others: "AI lain: rangkuman cepat tapi seadanya",
    aqsha: "Bantu gali lebih dalam, kamu tetap yang mikir",
  },
  {
    problem: 'Tulisan jujurmu malah dicap "buatan AI"',
    others: "Tanpa Aqsha: nggak ada bukti buat membela diri",
    aqsha: "Nyimpen jejak proses nulismu sebagai bukti",
  },
] as const;

const stats = [
  {
    value: 40,
    suffix: "%",
    label: "sumber AI lain yang nggak nyambung, menurut laporan pengguna",
  },
  {
    value: 100,
    suffix: "%",
    label: "sumber Aqsha dicek ke paper aslinya",
  },
  {
    value: 6,
    suffix: "",
    label: "masalah umum yang beres di Aqsha",
  },
] as const;

const quotes = [
  {
    text: "When using Perplexity, I am finding that almost all of the sources are not true. It will give me a quote from a source, I click on the source and the quote is not part of it.",
    attribution: "pengguna, komunitas riset",
    tilt: -1.2,
  },
  {
    text: "Out of ten sources, four led nowhere — dead links, nonexistent books, actual scholars authoring papers they never wrote.",
    attribution: "pengguna, komunitas riset",
    tilt: 1,
  },
] as const;

const inView = { once: true as const, amount: 0.3 as const };

function CountUp({
  to,
  suffix = "",
  duration = 1.4,
}: {
  to: number;
  suffix?: string;
  duration?: number;
}) {
  const [value, setValue] = useState(0);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    let controls: ReturnType<typeof animate> | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started.current) {
          started.current = true;
          controls = animate(0, to, {
            duration,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => setValue(Math.round(v)),
          });
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      controls?.stop();
    };
  }, [to, duration, reduce]);

  const displayValue = reduce ? to : value;
  return (
    <span ref={ref}>
      {displayValue}
      {suffix}
    </span>
  );
}

/**
 * PinnedQuote — a user complaint rendered as a printout taped to the board:
 * bg-background sheet on the bg-card band, paper-grain, a resting tilt, and a
 * translucent "tape" strip on top. Enters with an exaggerated tilt that
 * springs down to its resting angle — like the note was just slapped on.
 */
function PinnedQuote({ quote }: { quote: (typeof quotes)[number] }) {
  const reduce = useReducedMotion();
  return (
    <m.blockquote
      className="relative border border-border bg-background px-7 py-8 sm:px-9 sm:py-10"
      initial={
        reduce
          ? false
          : { opacity: 0, y: 28, rotate: quote.tilt * 3 }
      }
      whileInView={{ opacity: 1, y: 0, rotate: quote.tilt }}
      viewport={inView}
      transition={{ type: "spring", stiffness: 120, damping: 17 }}
    >
      <div className="paper-grain pointer-events-none absolute inset-0" />
      {/* Tape strip */}
      <span
        aria-hidden
        className="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-[-2deg] border border-foreground/10 bg-foreground/10"
      />
      <p className="font-heading text-pretty text-xl font-normal leading-[1.25] tracking-normal text-foreground sm:text-2xl sm:leading-[1.2]">
        &ldquo;{quote.text}&rdquo;
      </p>
      <footer className="mt-5 font-mono text-xs text-muted-foreground sm:mt-6">
        — {quote.attribution}
      </footer>
    </m.blockquote>
  );
}

/**
 * LedgerRow — one line of the comparison ledger.
 *
 * Signature micro-interaction: "masalah dicoret" — as the row passes through
 * the viewport, a hairline strike draws across the complaint (scaleX 0 → 1,
 * scroll-linked) while the Aqsha answer brightens to full opacity. The
 * complaint literally gets crossed off the books.
 */
function LedgerRow({
  row,
  index,
}: {
  row: (typeof comparisonRows)[number];
  index: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.75", "start 0.45"],
  });
  const strike = useTransform(scrollYProgress, [0, 1], [0, 1]);
  const answerOpacity = useTransform(scrollYProgress, [0, 1], [0.5, 1]);

  return (
    <div
      ref={ref}
      className="grid gap-2 border-b border-border/70 py-5 sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-8 sm:py-6"
    >
      <span
        aria-hidden
        className="hidden font-mono text-xs leading-6 text-muted-foreground/60 sm:block"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <p className="text-sm font-medium leading-snug text-foreground sm:text-[15px]">
          <span className="relative inline">
            {row.problem}
            {!reduce && (
              <m.span
                aria-hidden
                className="absolute left-0 top-[0.6em] h-px w-full origin-left bg-foreground/60"
                style={{ scaleX: strike }}
              />
            )}
          </span>
        </p>
        <p className="mt-1.5 text-xs leading-snug text-muted-foreground sm:text-[13px]">
          {row.others}
        </p>
      </div>
      <m.p
        className="text-sm font-medium leading-snug text-foreground sm:text-[15px]"
        style={reduce ? undefined : { opacity: answerOpacity }}
      >
        <span className="text-muted-foreground/60 sm:hidden">aqsha · </span>
        {row.aqsha}
      </m.p>
    </div>
  );
}

/**
 * WhyAqshaSection — "papan bukti": the page's single lighter `bg-card` band,
 * laid out like an evidence board. Top: asymmetric header. Then a full-width
 * strip of giant count-up numerals, two user complaints taped on as tilted
 * printouts (paper-grain + tape strip), and a ruled comparison ledger with
 * mono row numbers. Signature micro-interaction lives in LedgerRow
 * ("masalah dicoret"). No icons, no uppercase, no gradients.
 */
export function WhyAqshaSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="bandingin"
      className="w-full scroll-mt-[72px] bg-card py-28 sm:py-36 lg:py-44"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header: asymmetric two-column */}
        <div className="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-x-20">
          <div>
            <m.p
              className="text-[15px] leading-snug text-muted-foreground sm:text-base"
              initial={
                reduce ? false : { opacity: 0, clipPath: "inset(100% 0 0 0)", y: 6 }
              }
              whileInView={{ opacity: 1, clipPath: "inset(0% 0 0 0)", y: 0 }}
              viewport={inView}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              Bandingin sendiri
            </m.p>
            <m.h2
              className="font-heading mt-3 max-w-[min(100%,38rem)] text-[2.5rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={inView}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              Hal yang bikin pusing di tool lain — beres di Aqsha.
            </m.h2>
          </div>
          <m.p
            className="max-w-md text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug lg:pb-2"
            initial={reduce ? false : { opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={inView}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Perplexity, ChatGPT, dan kawan-kawannya sering ngasih referensi
            palsu — judul yang nggak ada, kutipan yang nggak pernah ditulis.
            Ini bukan kami yang ngomong: keluhan ini datang dari penggunanya
            sendiri.
          </m.p>
        </div>

        {/* Stats strip: giant numerals across the band */}
        <m.div
          className="mt-16 grid gap-x-10 gap-y-10 border-t border-border pt-10 sm:mt-20 sm:grid-cols-3 sm:pt-12"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={inView}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className="font-heading block text-6xl font-normal leading-none text-foreground sm:text-7xl lg:text-8xl">
                <CountUp to={stat.value} suffix={stat.suffix} />
              </span>
              <p className="mt-4 max-w-[17rem] text-sm leading-snug text-muted-foreground sm:text-[15px]">
                {stat.label}
              </p>
            </div>
          ))}
        </m.div>

        {/* Quotes: printouts taped to the board */}
        <div className="mt-20 grid gap-8 sm:mt-24 lg:grid-cols-2 lg:gap-12">
          {quotes.map((quote) => (
            <PinnedQuote key={quote.text.slice(0, 40)} quote={quote} />
          ))}
        </div>

        {/* Comparison ledger */}
        <m.div
          className="mt-20 sm:mt-24"
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={inView}
          transition={{ duration: 0.5 }}
        >
          <div className="hidden border-b border-foreground/40 pb-3 sm:grid sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-8">
            <span aria-hidden className="font-mono text-xs text-muted-foreground/60">
              no
            </span>
            <p className="text-sm text-muted-foreground">Di tool lain</p>
            <p className="text-sm font-medium text-foreground">Di Aqsha</p>
          </div>
          <p className="border-b border-foreground/40 pb-3 text-sm text-muted-foreground sm:hidden">
            Di mana masalahnya muncul
          </p>
          {comparisonRows.map((row, index) => (
            <LedgerRow key={row.problem} row={row} index={index} />
          ))}
        </m.div>

        {/* Disclaimer */}
        <m.p
          className="mt-10 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:mt-12 sm:text-[13px]"
          initial={reduce ? false : { opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={inView}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          Berdasarkan keluhan publik pengguna riset di komunitas seperti
          Reddit (2024–2025), dari 880 sinyal pada 80 thread. Nama produk
          lain adalah milik masing-masing pemiliknya; perbandingan dibuat
          untuk menggambarkan keluhan umum, bukan klaim mutlak.
        </m.p>
      </div>
    </section>
  );
}
