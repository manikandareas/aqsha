"use client";

import { m, useReducedMotion } from "motion/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  TechnicalCrosshairFrame,
  TechnicalFrameHorizontalRule,
} from "@/features/marketing/components/technical-crosshair-frame";
import { WorkflowCodePanel } from "@/features/marketing/components/workflow-code-panel";
import { WorkflowCopyBlock } from "@/features/marketing/components/workflow-copy-block";
import { WorkflowDiagram } from "@/features/marketing/components/workflow-diagram";

const workflowTitleParts = [
  "A calmer way",
  "to produce",
  "source-backed work",
] as const;

export function WorkflowSection() {
  const reduce = useReducedMotion();

  return (
    <section
      id="workflow"
      className="w-full scroll-mt-[72px] bg-background py-12 sm:py-16 lg:py-20"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:py-5">
          <div className="min-w-0 max-w-2xl lg:max-w-[min(100%,40rem)]">
            <m.p
              className="text-[15px] leading-snug text-muted-foreground sm:text-base"
              initial={
                reduce
                  ? false
                  : { opacity: 0, clipPath: "inset(100% 0 0 0)", y: 6 }
              }
              whileInView={{ opacity: 1, clipPath: "inset(0% 0 0 0)", y: 0 }}
              viewport={{ once: true, amount: 0.9 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              How it works
            </m.p>
            <h2 className="font-heading mt-3 max-w-[min(100%,34rem)] text-[2.75rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-5xl sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05] xl:text-[3.5rem]">
              {workflowTitleParts.map((part, i) => (
                <span key={part}>
                  <m.span
                    className="inline-block"
                    initial={
                      reduce
                        ? false
                        : {
                            opacity: 0,
                            x: i % 2 === 0 ? -40 : 40,
                            skewX: i === 1 ? 3 : 0,
                          }
                    }
                    whileInView={{ opacity: 1, x: 0, skewX: 0 }}
                    viewport={{ once: true, amount: 0.55 }}
                    transition={{
                      delay: i * 0.11,
                      type: "spring",
                      stiffness: 160,
                      damping: 24,
                      mass: 0.85,
                    }}
                  >
                    {part}
                  </m.span>
                  {i < workflowTitleParts.length - 1 ? " " : null}
                </span>
              ))}
            </h2>
          </div>
          <m.div
            initial={reduce ? false : { opacity: 0, rotate: 4, y: 16 }}
            whileInView={{ opacity: 1, rotate: 0, y: 0 }}
            viewport={{ once: true, amount: 0.85 }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 16,
              delay: reduce ? 0 : 0.28,
            }}
            whileHover={reduce ? undefined : { rotate: -0.6, scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
          >
            <Button
              asChild
              variant="outline"
              className="h-10 w-fit shrink-0 rounded-full px-5 text-sm shadow-sm sm:h-11 sm:px-6 sm:text-base"
            >
              <Link href="#features">Explore the features</Link>
            </Button>
          </m.div>
        </div>

        <div className="relative -mx-4 mt-10 w-[calc(100%+2rem)] overflow-visible sm:-mx-6 sm:mt-12 sm:w-[calc(100%+3rem)] lg:-mx-8 lg:mt-14 lg:w-[calc(100%+4rem)]">
          <TechnicalCrosshairFrame contentClassName="">
            <>
              <div className="px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 pb-10 pt-8 sm:pb-12 sm:pt-10 lg:grid-cols-2 lg:items-start lg:gap-x-14 lg:gap-y-0 lg:pb-14 lg:pt-12 xl:gap-x-20">
                  <m.div
                    initial={reduce ? false : { opacity: 0, x: -36, filter: "blur(6px)" }}
                    whileInView={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    viewport={{ once: true, amount: 0.25, margin: "0px 0px -8% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 150,
                      damping: 24,
                    }}
                  >
                    <WorkflowCopyBlock
                      title="Start with a real question"
                      body="Open a thread for the problem you are trying to understand. Aqsha keeps the question, workspace, and research intent connected while the inquiry changes shape."
                      items={[
                        ["Ask in context", "Start from a workspace, paper, or blank thread"],
                        ["Name the scope", "Keep the research goal visible"],
                        ["Return later", "Pick up where the trail stopped"],
                      ]}
                    />
                  </m.div>
                  <m.div
                    initial={reduce ? false : { opacity: 0, x: 40, y: 12 }}
                    whileInView={{ opacity: 1, x: 0, y: 0 }}
                    viewport={{ once: true, amount: 0.25, margin: "0px 0px -8% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 170,
                      damping: 22,
                      delay: reduce ? 0 : 0.08,
                    }}
                  >
                    <WorkflowCodePanel
                      lines={[
                        <>
                          <span className="text-coral-foreground">thread</span>:{" "}
                          <span className="text-sky-foreground">
                            &quot;RAG evaluation methods&quot;
                          </span>
                        </>,
                        <>
                          <span className="text-coral-foreground">workspace</span>:{" "}
                          <span className="text-sky-foreground">
                            &quot;Grounded answer research&quot;
                          </span>
                        </>,
                        <>
                          <span className="text-coral-foreground">sources</span>: [
                        </>,
                        <>
                          {"  "}
                          <span className="text-sky-foreground">
                            &quot;Evaluation paper.pdf&quot;
                          </span>
                          ,
                        </>,
                        <>
                          {"  "}
                          <span className="text-sky-foreground">
                            &quot;Benchmark notes.md&quot;
                          </span>
                        </>,
                        <>]</>,
                      ]}
                    />
                  </m.div>
                </div>
              </div>

              <TechnicalFrameHorizontalRule />

              <div className="px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 py-10 sm:py-12 lg:grid-cols-2 lg:items-start lg:gap-x-14 lg:gap-y-0 lg:py-14 xl:gap-x-20">
                  <m.div
                    initial={reduce ? false : { opacity: 0, y: 48, scale: 0.97 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 130,
                      damping: 22,
                      mass: 0.9,
                    }}
                  >
                    <WorkflowCopyBlock
                      title="Collect evidence as you go"
                      body="Bring in papers, source notes, links, and follow-up questions while the answer is still forming. Useful context stays inspectable instead of becoming a loose chat transcript."
                      items={[
                        ["Source evidence", "Passages, papers, and saved URLs"],
                        ["Working notes", "Observations before they become claims"],
                        ["Open loops", "Doubts and gaps that need another pass"],
                      ]}
                    />
                  </m.div>
                  <m.div
                    initial={reduce ? false : { opacity: 0, y: -40, rotate: 1.2 }}
                    whileInView={{ opacity: 1, y: 0, rotate: 0 }}
                    viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 180,
                      damping: 20,
                      delay: reduce ? 0 : 0.1,
                    }}
                  >
                    <WorkflowDiagram />
                  </m.div>
                </div>
              </div>

              <TechnicalFrameHorizontalRule />

              <div className="px-4 sm:px-6 lg:px-8">
                <div className="grid gap-10 pb-8 pt-10 sm:pb-10 sm:pt-12 lg:grid-cols-2 lg:items-start lg:gap-x-14 lg:gap-y-0 lg:pb-12 lg:pt-14 xl:gap-x-20">
                  <m.div
                    initial={
                      reduce ? false : { opacity: 0, x: 32, rotateZ: -2.5, skewX: 2 }
                    }
                    whileInView={{ opacity: 1, x: 0, rotateZ: 0, skewX: 0 }}
                    viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 110,
                      damping: 20,
                    }}
                  >
                    <WorkflowCopyBlock
                      title="Turn findings into reusable output"
                      body="Save the answer, note, or artifact with its citations and unresolved questions still attached, so the next person can inspect the evidence before trusting the conclusion."
                      items={[
                        ["Cited answer", "Claims mapped back to sources"],
                        ["Research note", "Summary, assumptions, and remaining gaps"],
                        ["Workspace artifact", "Share it, inspect it, keep building"],
                      ]}
                    />
                  </m.div>
                  <m.div
                    initial={
                      reduce
                        ? false
                        : { opacity: 0, x: -28, scale: 0.96, filter: "contrast(0.92)" }
                    }
                    whileInView={{
                      opacity: 1,
                      x: 0,
                      scale: 1,
                      filter: "contrast(1)",
                    }}
                    viewport={{ once: true, amount: 0.22, margin: "0px 0px -10% 0px" }}
                    transition={{
                      type: "spring",
                      stiffness: 155,
                      damping: 23,
                      delay: reduce ? 0 : 0.09,
                    }}
                  >
                    <WorkflowCodePanel
                      lines={[
                        <>
                          <span className="text-coral-foreground">answer</span>:{" "}
                          <span className="text-sky-foreground">
                            &quot;Draft grounded synthesis&quot;
                          </span>
                        </>,
                        <>
                          <span className="text-coral-foreground">citations</span>:{" "}
                          <span className="text-sky-foreground">6</span>
                        </>,
                        <>
                          <span className="text-coral-foreground">openQuestions</span>: [
                        </>,
                        <>
                          {"  "}
                          <span className="text-sky-foreground">
                            &quot;dataset comparability&quot;
                          </span>
                        </>,
                        <>]</>,
                        <>
                          <span className="text-coral-foreground">artifact</span>:{" "}
                          <span className="text-sky-foreground">
                            &quot;RAG evaluation brief&quot;
                          </span>
                        </>,
                      ]}
                    />
                  </m.div>
                </div>
              </div>
            </>
          </TechnicalCrosshairFrame>
        </div>
      </div>
    </section>
  );
}
