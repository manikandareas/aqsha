// Bundled R script for random-effects META-ANALYSIS (metafor). Uploaded into the
// sandbox alongside a studies file. Reads an array of studies and pools their
// effect sizes, computing heterogeneity (I²/Q/τ²) and publication-bias diagnostics
// (Egger's regression test + trim-and-fill), and writes forest + funnel plots.
//
// Each study supplies its effect size one of three ways (checked in order):
//   • pre-computed:  { label, yi, vi }            (vi = sampling variance) or { label, yi, sei }
//   • two-group mean: { label, mean1, sd1, n1, mean2, sd2, n2 }   → escalc SMD (Hedges' g)
//   • two-group binary: { label, events1, n1, events2, n2 }       → escalc log OR
// Effect-size data arrives IN the prompt/artifact (LLM-extracted, like GRIM/power
// claims) and is uploaded via the base64 path — NO sandbox egress is required;
// only the `metafor` package must be pre-baked in the snapshot. Parsing of the
// emitted JSON envelope lives in metaAnalysisClassify.ts.

export const META_SCRIPT_PATH = "/workspace/metaanalysis.R";
export const META_STUDIES_PATH = "/workspace/meta_studies.json";
export const META_FOREST_PATH = "/workspace/forest.png";
export const META_FUNNEL_PATH = "/workspace/funnel.png";
export const META_COMMAND = `Rscript ${META_SCRIPT_PATH} ${META_STUDIES_PATH}`;
// Read a generated plot back as single-line base64 (empty when the plot was not
// produced, e.g. too few studies). Used as extra session commands so the PNGs
// round-trip through stdout without a vendor-interface change.
export const META_FOREST_READ_COMMAND = `base64 -w0 ${META_FOREST_PATH} 2>/dev/null || true`;
export const META_FUNNEL_READ_COMMAND = `base64 -w0 ${META_FUNNEL_PATH} 2>/dev/null || true`;

export const META_R = String.raw`
suppressWarnings(suppressMessages({
  library(metafor)
  library(jsonlite)
}))

args <- commandArgs(trailingOnly = TRUE)
studies_path <- if (length(args) >= 1) args[1] else "/workspace/meta_studies.json"

emit <- function(x) {
  cat(toJSON(x, auto_unbox = TRUE, na = "null", digits = NA))
}

studies <- tryCatch(
  fromJSON(studies_path, simplifyDataFrame = FALSE),
  error = function(e) NULL
)

if (is.null(studies) || length(studies) == 0) {
  emit(list(status = "no_studies", k = 0))
  quit(save = "no", status = 0)
}

num <- function(v) if (is.null(v)) NA_real_ else suppressWarnings(as.numeric(v))

# Compute yi (effect size) + vi (sampling variance) per study, in priority order.
rows <- lapply(studies, function(s) {
  label <- if (!is.null(s$label)) as.character(s$label) else "(unlabeled)"
  yi <- num(s$yi); vi <- num(s$vi); sei <- num(s$sei)
  measure <- "GEN"
  if (!is.na(yi) && is.na(vi) && !is.na(sei)) vi <- sei^2
  if (is.na(yi) || is.na(vi)) {
    m1 <- num(s$mean1); sd1 <- num(s$sd1); n1 <- num(s$n1)
    m2 <- num(s$mean2); sd2 <- num(s$sd2); n2 <- num(s$n2)
    if (!any(is.na(c(m1, sd1, n1, m2, sd2, n2)))) {
      es <- tryCatch(escalc(measure = "SMD", m1i = m1, sd1i = sd1, n1i = n1,
                            m2i = m2, sd2i = sd2, n2i = n2),
                     error = function(e) NULL)
      if (!is.null(es)) { yi <- as.numeric(es$yi); vi <- as.numeric(es$vi); measure <- "SMD" }
    }
  }
  if (is.na(yi) || is.na(vi)) {
    e1 <- num(s$events1); en1 <- num(s$n1); e2 <- num(s$events2); en2 <- num(s$n2)
    if (!any(is.na(c(e1, en1, e2, en2)))) {
      es <- tryCatch(escalc(measure = "OR", ai = e1, n1i = en1, ci = e2, n2i = en2),
                     error = function(e) NULL)
      if (!is.null(es)) { yi <- as.numeric(es$yi); vi <- as.numeric(es$vi); measure <- "OR" }
    }
  }
  list(label = label, yi = yi, vi = vi, measure = measure)
})

labels  <- vapply(rows, function(r) r$label, character(1))
yis     <- vapply(rows, function(r) r$yi, numeric(1))
vis     <- vapply(rows, function(r) r$vi, numeric(1))
measures <- vapply(rows, function(r) r$measure, character(1))
keep <- !is.na(yis) & !is.na(vis) & vis > 0

labels <- labels[keep]; yis <- yis[keep]; vis <- vis[keep]
measure <- if (length(measures[keep]) > 0) names(sort(table(measures[keep]), decreasing = TRUE))[1] else "GEN"
k <- length(yis)

if (k < 2) {
  emit(list(status = "insufficient_studies", k = k, measure = measure))
  quit(save = "no", status = 0)
}

res <- tryCatch(rma(yi = yis, vi = vis, method = "REML"),
                error = function(e) NULL)
if (is.null(res)) {
  emit(list(status = "model_error", k = k, measure = measure))
  quit(save = "no", status = 0)
}

egger_p <- tryCatch({
  if (k >= 3) as.numeric(regtest(res, model = "lm")$pval) else NA_real_
}, error = function(e) NA_real_)

tf <- tryCatch(trimfill(res), error = function(e) NULL)
trimfill_estimate <- if (!is.null(tf)) as.numeric(tf$beta) else NA_real_
trimfill_imputed  <- if (!is.null(tf)) as.numeric(tf$k0) else NA_real_

# Plots — best-effort; absence simply yields empty base64 on read-back.
tryCatch({
  png("/workspace/forest.png", width = 1000, height = max(300, 60 * k), res = 120)
  forest(res, slab = labels)
  dev.off()
}, error = function(e) NULL)
tryCatch({
  png("/workspace/funnel.png", width = 800, height = 600, res = 120)
  funnel(res)
  dev.off()
}, error = function(e) NULL)

emit(list(
  status = "ok",
  k = k,
  measure = measure,
  pooledEstimate = as.numeric(res$beta),
  ciLower = as.numeric(res$ci.lb),
  ciUpper = as.numeric(res$ci.ub),
  pValue = as.numeric(res$pval),
  tau2 = as.numeric(res$tau2),
  i2 = as.numeric(res$I2),
  q = as.numeric(res$QE),
  qPValue = as.numeric(res$QEp),
  eggerPValue = egger_p,
  trimfillEstimate = trimfill_estimate,
  trimfillImputed = trimfill_imputed
))
`;
