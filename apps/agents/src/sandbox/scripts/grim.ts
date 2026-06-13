// Bundled R script for GRIM / GRIMMER consistency testing (scrutiny). Uploaded
// into the sandbox at runtime alongside a claims file. Reads an array of claims
// {label, mean, sd?, n, items} and emits, per claim, whether the reported mean
// (GRIM) and SD (GRIMMER) are arithmetically possible. Like statcheck.R it emits
// only the raw consistency flags — the outcome mapping happens in grimClassify.ts.

export const GRIM_SCRIPT_PATH = "/workspace/grim.R";
export const GRIM_CLAIMS_PATH = "/workspace/grim_claims.json";
export const GRIM_COMMAND = `Rscript ${GRIM_SCRIPT_PATH} ${GRIM_CLAIMS_PATH}`;

export const GRIM_R = String.raw`
suppressWarnings(suppressMessages({
  library(scrutiny)
  library(jsonlite)
}))

args <- commandArgs(trailingOnly = TRUE)
claims_path <- if (length(args) >= 1) args[1] else "/workspace/grim_claims.json"

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

results <- lapply(claims, function(c) {
  mean_str <- as.character(c$mean)
  n <- suppressWarnings(as.numeric(c$n))
  items <- if (!is.null(c$items)) suppressWarnings(as.numeric(c$items)) else 1
  has_sd <- !is.null(c$sd) && !is.na(suppressWarnings(as.numeric(c$sd)))

  grim_ok <- tryCatch(
    as.logical(scrutiny::grim(x = mean_str, n = n, items = items)),
    error = function(e) NA
  )

  grimmer_ok <- NA
  if (has_sd) {
    grimmer_ok <- tryCatch(
      as.logical(scrutiny::grimmer(
        x = mean_str,
        sd = as.character(c$sd),
        n = n,
        items = items
      )),
      error = function(e) NA
    )
  }

  list(
    label = c$label,
    mean = suppressWarnings(as.numeric(c$mean)),
    sd = if (has_sd) suppressWarnings(as.numeric(c$sd)) else NA,
    n = n,
    items = items,
    grimConsistent = grim_ok,
    grimmerConsistent = grimmer_ok
  )
})

emit(results)
`;
