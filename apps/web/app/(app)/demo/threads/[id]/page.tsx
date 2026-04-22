import { NavActions } from "@/components/nav-actions";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import React from "react";
import {
  Search,
  ChevronDown,
  MoveUpRight,
  Info,
  Plus,
  ArrowUp,
  Filter,
  GitMerge,
  Sparkles,
  Database,
  SearchCode,
} from "lucide-react";

export default function DetailThreadPage() {
  return (
    <React.Fragment>
      <header className="flex h-14 shrink-0 items-center gap-2">
        <div className="flex flex-1 items-center gap-2 px-3">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage className="line-clamp-1">
                  Project Management & Task Tracking
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="ml-auto px-3">
          <NavActions />
        </div>
      </header>

      {/* PAGE CONTENT */}
      <main className="flex flex-1 flex-col relative w-full max-w-3xl mx-auto pt-8 pb-40 px-4">
        {/* User Query Bubble */}
        <div className="flex justify-end mb-8">
          <div className="bg-primary text-primary-foreground px-5 py-3.5 rounded-3xl rounded-tr-sm text-[15px] font-medium shadow-sm max-w-[85%] leading-relaxed">
            Compare randomized vs observational evidence on intermittent fasting
          </div>
        </div>

        {/* System Response */}
        <div className="flex flex-col gap-4 px-4">
          {/* Avatar and Context */}
          <div className="flex items-center gap-2 text-sm">
            <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-semibold">Deep</span>
            <span className="text-muted-foreground flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors">
              · 17 searches <ChevronDown className="w-3.5 h-3.5" />
            </span>
          </div>

          {/* Results Card */}
          <div className="border-border border-l overflow-hidden">
            {/* Metrics */}
            <div className="flex items-center gap-8 p-6">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[26px] font-bold tracking-tight">
                  235.3M{" "}
                  <Info className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                </div>
                <div className="text-[13px] text-muted-foreground font-medium">
                  Retrieved
                </div>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[26px] font-bold tracking-tight">
                  962{" "}
                  <Info className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                </div>
                <div className="text-[13px] text-muted-foreground font-medium">
                  Eligible
                </div>
              </div>
              <Separator orientation="vertical" className="h-12" />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[26px] font-bold tracking-tight">
                  50{" "}
                  <Info className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
                </div>
                <div className="text-[13px] text-muted-foreground font-medium">
                  Included
                </div>
              </div>
            </div>

            <Separator />

            {/* List of items inside card */}
            <div className="p-6 flex flex-col gap-8">
              {/* Primary Search Result */}
              <div className="flex items-start gap-3.5 group cursor-pointer">
                <div className="mt-0.5 rounded-full bg-blue-500/10 p-1.5 flex items-center justify-center">
                  <Search className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-[15px] font-medium group-hover:underline underline-offset-4">
                    Compare randomized vs observational evidence on intermittent
                    fasting
                  </span>
                  <span className="text-[13px] font-bold text-muted-foreground">
                    24K
                  </span>
                  <MoveUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>

              {/* Explore citation graph */}
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold text-[15px]">
                  Explore citation graph
                </h3>
                <p className="text-[14px] text-muted-foreground mb-1 leading-relaxed">
                  Discover additional papers by following citation connections
                  between the initial results.
                </p>
                <div className="flex items-center gap-3 group cursor-pointer w-fit hover:bg-muted/60 py-1.5 px-2.5 -ml-2.5 rounded-md transition-colors">
                  <GitMerge className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-[14px] font-medium text-foreground">
                    Graph
                  </span>
                  <span className="text-[14px] text-muted-foreground">
                    50 seeds
                  </span>
                  <span className="text-[14px] font-bold text-foreground">
                    861
                  </span>
                </div>
              </div>

              {/* Distinguish study designs */}
              <div className="flex flex-col gap-3.5">
                <div>
                  <h3 className="font-semibold text-[15px] mb-1">
                    Distinguish study designs
                  </h3>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Separate literature on intermittent fasting by randomized
                    controlled trials (RCTs) and observational studies.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    {
                      text: "Intermittent fasting randomized controlled trial outcomes",
                      count: "17.8M",
                    },
                    {
                      text: "Intermittent fasting observational study cardiometabolic effects",
                      count: "51M",
                    },
                    {
                      text: "Intermittent fasting weight loss evidence from RCTs and cohort studies",
                      count: "4.3M",
                      underline: true,
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 group cursor-pointer"
                    >
                      <div className="mt-0.5">
                        <SearchCode className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                      <div className="flex-1 flex items-center gap-2.5">
                        <span
                          className={`text-[14px] ${item.underline ? "underline underline-offset-4 text-foreground" : "text-muted-foreground"} group-hover:text-foreground transition-colors`}
                        >
                          {item.text}
                        </span>
                        <span className="text-[13px] font-bold text-muted-foreground">
                          {item.count}
                        </span>
                        <MoveUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rephrase for methodology */}
              <div className="flex flex-col gap-3.5">
                <div>
                  <h3 className="font-semibold text-[15px] mb-1">
                    Background on evidence hierarchies
                  </h3>
                  <p className="text-[14px] text-muted-foreground leading-relaxed">
                    Retrieve foundational work on strengths and limitations of
                    RCTs vs observational studies in nutrition research.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    {
                      text: "strengths and limitations of randomized controlled trials in nutrition research",
                      count: "13M",
                    },
                    {
                      text: "observational studies versus RCTs in dietary intervention evidence",
                      count: "12.6M",
                    },
                    {
                      text: "evidence hierarchies in nutrition science: RCTs and observational studies",
                      count: "15.9M",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3.5 group cursor-pointer"
                    >
                      <div className="mt-0.5">
                        <SearchCode className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </div>
                      <div className="flex-1 flex items-center gap-2.5">
                        <span
                          className={`text-[14px] text-muted-foreground group-hover:text-foreground transition-colors`}
                        >
                          {item.text}
                        </span>
                        <span className="text-[13px] font-bold text-muted-foreground">
                          {item.count}
                        </span>
                        <MoveUpRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Read Papers Button */}
                <div className="flex items-center gap-2 mt-2 group cursor-pointer w-fit">
                  <div className="flex items-center gap-2 text-foreground font-semibold text-[14px]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-eye"
                    >
                      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    Read
                  </div>
                  <span className="text-muted-foreground text-[14px]">
                    Papers
                  </span>
                  <span className="text-foreground font-bold text-[14px]">
                    50
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground -rotate-90 group-hover:text-foreground transition-colors" />
                </div>
              </div>
            </div>
          </div>

          {/* Article Section */}
          <div className="flex flex-col gap-6 mt-8">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight text-foreground">
              Randomized vs Observational Evidence on Intermittent Fasting: A
              Comparative Review
            </h1>

            <div className="flex flex-col gap-4">
              <h2 className="text-[20px] font-bold tracking-tight text-foreground">
                1. Introduction
              </h2>

              <p className="text-[16px] leading-relaxed text-muted-foreground">
                Intermittent fasting (IF) has become a widely studied dietary
                intervention for weight loss and metabolic health, with evidence
                emerging from both randomized controlled trials (RCTs) and
                observational studies. The highest-quality evidence comes from
                RCTs, which consistently show that IF regimens—including
                alternate-day fasting, time-restricted eating, and the 5:2
                diet—are effective for weight loss and improving cardiometabolic
                risk factors, but generally perform similarly to continuous
                energy restriction (CER) when calorie intake is matched{" "}
                <span className="inline-flex items-center gap-1.5 align-middle mx-1">
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 1
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 2
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 3
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 4
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[10px] font-medium cursor-pointer border border-transparent transition-colors uppercase tracking-wider">
                    +4 MORE
                  </span>
                </span>
                . Observational studies, while less common and more prone to
                bias, often report similar benefits but may overestimate effects
                due to confounding factors{" "}
                <span className="inline-flex items-center gap-1.5 align-middle mx-1">
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 9
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 10
                  </span>
                </span>
                . Recent umbrella reviews and meta-analyses of RCTs provide
                high-certainty evidence for modest reductions in body weight,
                fat mass, waist circumference, and improvements in lipid
                profiles and glycemic control with IF compared to
                non-intervention diets or CER{" "}
                <span className="inline-flex items-center gap-1.5 align-middle mx-1">
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 1
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 2
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 11
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 4
                  </span>
                </span>
                . However, the long-term sustainability and superiority of IF
                over other dietary approaches remain uncertain due to limited
                long-term data and heterogeneity in study designs{" "}
                <span className="inline-flex items-center gap-1.5 align-middle mx-1">
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 12
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 13
                  </span>
                </span>
                . Overall, randomized evidence supports the safety and efficacy
                of IF for weight management and metabolic health in adults with
                overweight or obesity{" "}
                <span className="inline-flex items-center gap-1.5 align-middle mx-1">
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 1
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 2
                  </span>
                  <span className="inline-flex items-center justify-center bg-muted hover:bg-muted/80 text-muted-foreground rounded-[4px] px-1.5 py-0.5 text-[11px] font-semibold cursor-pointer border border-transparent transition-colors">
                    <MoveUpRight className="w-3 h-3 mr-0.5 opacity-70" /> 4
                  </span>
                </span>
                , while observational data are supportive but less robust.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Input Area */}
        <div className="fixed bottom-6 w-full max-w-3xl z-20">
          <div className="bg-card/95 backdrop-blur-md border shadow-3xl shadow-red-700 rounded-3xl p-3 flex flex-col gap-3">
            <input
              type="text"
              placeholder="Ask a follow up..."
              className="bg-transparent border-none outline-none text-[15px] placeholder:text-muted-foreground/70 w-full px-3 pt-2 pb-3 focus:ring-0 text-foreground"
            />
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8 rounded-full bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 px-3.5 dark:text-blue-400 dark:hover:bg-blue-500/20">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Pro
                </button>
                <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8 rounded-full px-3.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground">
                  <Database className="w-3.5 h-3.5 mr-1.5" />
                  Deep
                </button>
                <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent hover:bg-muted/50 hover:text-foreground h-8 rounded-full px-3.5 gap-1.5">
                  Corpus{" "}
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-transparent hover:bg-muted/50 hover:text-foreground h-8 w-8 rounded-full">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="inline-flex items-center justify-center whitespace-nowrap text-[14px] font-semibold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-muted/50 h-8 rounded-full px-3">
                  <Filter className="w-4 h-4 mr-1.5" />
                  Filter
                </button>
                <button className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-sm">
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </React.Fragment>
  );
}
