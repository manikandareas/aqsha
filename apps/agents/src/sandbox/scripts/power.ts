// Bundled R script for PROSPECTIVE power analysis (pwr). Uploaded into the
// sandbox alongside a claims file. Reads an array of claims
// {label, test, n, effectSize, alpha?, tails?} and emits the power to detect the
// pre-specified effect at that N — never observed/post-hoc power. Supports the
// common, fully-specified cases (t-test, correlation, proportion); other tests
// emit null power and surface as not_computable. Outcome mapping lives in
// powerClassify.ts.

export const POWER_SCRIPT_PATH = "/workspace/power.R";
export const POWER_CLAIMS_PATH = "/workspace/power_claims.json";
export const POWER_COMMAND = `Rscript ${POWER_SCRIPT_PATH} ${POWER_CLAIMS_PATH}`;

export const POWER_R = String.raw`
suppressWarnings(suppressMessages({
  library(pwr)
  library(jsonlite)
}))

args <- commandArgs(trailingOnly = TRUE)
claims_path <- if (length(args) >= 1) args[1] else "/workspace/power_claims.json"

emit <- function(x) {
  cat(toJSON(x, dataframe = "rows", auto_unbox = TRUE, na = "null", digits = NA))
}

claims <- tryCatch(
  fromJSON(claims_path, simplifyDataFrame = FALSE),
  error = function(e) NULL
)

if (is.null(claims) || length(claims) == 0) {
  emit(list())
  quit(save = "no", status = 0)
}

calc_power <- function(c) {
  test <- tolower(as.character(c$test))
  n <- suppressWarnings(as.numeric(c$n))
  es <- suppressWarnings(as.numeric(c$effectSize))
  alpha <- if (!is.null(c$alpha)) suppressWarnings(as.numeric(c$alpha)) else 0.05
  tails <- if (!is.null(c$tails)) suppressWarnings(as.numeric(c$tails)) else 2
  alt <- if (!is.na(tails) && tails == 1) "greater" else "two.sided"
  tryCatch({
    if (test == "t") {
      pwr.t.test(n = n, d = es, sig.level = alpha, type = "two.sample", alternative = alt)$power
    } else if (test == "correlation") {
      pwr.r.test(n = n, r = es, sig.level = alpha, alternative = alt)$power
    } else if (test == "proportion") {
      pwr.p.test(h = es, n = n, sig.level = alpha, alternative = alt)$power
    } else {
      NA
    }
  }, error = function(e) NA)
}

results <- lapply(claims, function(c) {
  list(
    label = c$label,
    test = as.character(c$test),
    n = suppressWarnings(as.numeric(c$n)),
    effectSize = suppressWarnings(as.numeric(c$effectSize)),
    alpha = if (!is.null(c$alpha)) suppressWarnings(as.numeric(c$alpha)) else 0.05,
    power = calc_power(c)
  )
})

emit(results)
`;
