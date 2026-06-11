// Bundled R script for statcheck p-value consistency checking, stored as a
// string so it is versioned with our code and uploaded into the ephemeral
// Daytona sandbox at runtime (the Convex isolate cannot read loose repo files,
// and statcheck has no native JSON emitter — we drive jsonlite ourselves).
//
// The script recomputes, for every APA-style NHST result it can parse, the
// exact p-value from the test statistic + degrees of freedom, then emits the
// RAW reported vs recomputed numbers as JSON. It deliberately does NOT decide
// "consistent/discrepant" — that interpretation (with an explicit tolerance)
// happens deterministically in `statcheckClassify.ts` so the raw numbers and
// the verdict never get entangled (the determinism invariant).

export const STATCHECK_SCRIPT_PATH = "/workspace/check.R";
export const STATCHECK_INPUT_PATH = "/workspace/input.txt";
export const STATCHECK_COMMAND = `Rscript ${STATCHECK_SCRIPT_PATH} ${STATCHECK_INPUT_PATH}`;

export const STATCHECK_R = String.raw`
suppressWarnings(suppressMessages({
  library(statcheck)
  library(jsonlite)
}))

args <- commandArgs(trailingOnly = TRUE)
input_path <- if (length(args) >= 1) args[1] else "/workspace/input.txt"
txt <- paste(readLines(input_path, warn = FALSE), collapse = "\n")

emit <- function(x) {
  cat(toJSON(x, dataframe = "rows", auto_unbox = TRUE, na = "null", digits = NA))
}

res <- tryCatch(
  suppressWarnings(suppressMessages(statcheck(txt))),
  error = function(e) NULL
)

if (is.null(res) || nrow(res) == 0) {
  emit(list())
  quit(save = "no", status = 0)
}

# statcheck column names drift slightly across versions; pull each defensively.
col <- function(df, name) if (name %in% names(df)) df[[name]] else rep(NA, nrow(df))

out <- data.frame(
  source = as.character(col(res, "Source")),
  statistic = as.character(col(res, "Statistic")),
  df1 = suppressWarnings(as.numeric(col(res, "df1"))),
  df2 = suppressWarnings(as.numeric(col(res, "df2"))),
  testValue = suppressWarnings(as.numeric(col(res, "Value"))),
  reportedComparison = as.character(col(res, "Reported.Comparison")),
  reportedPValue = suppressWarnings(as.numeric(col(res, "Reported.P.Value"))),
  computedPValue = suppressWarnings(as.numeric(col(res, "Computed"))),
  raw = as.character(col(res, "Raw")),
  statcheckError = as.logical(col(res, "Error")),
  statcheckDecisionError = as.logical(col(res, "DecisionError")),
  oneTailedInTxt = as.logical(col(res, "OneTailedInTxt")),
  stringsAsFactors = FALSE
)

emit(out)
`;
