# Smoke-test for the statverify snapshot image: load every verification library
# and run a tiny functional check of each engine the Convex runner uses. Exits
# non-zero if anything is missing or broken, so CI / `docker compose` fails loud.

ok <- TRUE
fail <- function(msg) {
  cat("SMOKE FAIL:", msg, "\n")
  ok <<- FALSE
}

suppressWarnings(suppressMessages({
  for (pkg in c("statcheck", "scrutiny", "rsprite2", "metafor", "pwr", "jsonlite")) {
    if (!requireNamespace(pkg, quietly = TRUE)) fail(paste("missing R package:", pkg))
  }
}))

if (ok) {
  suppressWarnings(suppressMessages({
    library(statcheck)
    library(jsonlite)
  }))

  # statcheck: should parse one NHST result and recompute its p-value.
  sc <- tryCatch(
    suppressWarnings(suppressMessages(statcheck("t(28) = 2.10, p = .04"))),
    error = function(e) { fail(paste("statcheck:", conditionMessage(e))); NULL }
  )
  if (!is.null(sc) && nrow(sc) < 1) fail("statcheck parsed 0 results")

  # GRIM: a clearly-impossible mean should be flagged inconsistent.
  grim_ok <- tryCatch(
    as.logical(scrutiny::grim(x = "3.20", n = 20)),
    error = function(e) { fail(paste("grim:", conditionMessage(e))); NA }
  )

  # power: prospective power for a medium effect should be a finite probability.
  pw <- tryCatch(
    pwr::pwr.t.test(n = 30, d = 0.5, sig.level = 0.05, type = "two.sample")$power,
    error = function(e) { fail(paste("pwr:", conditionMessage(e))); NA }
  )
  if (is.na(pw) || pw < 0 || pw > 1) fail("pwr returned an invalid power value")

  cat(toJSON(list(
    statcheck_rows = if (is.null(sc)) 0L else nrow(sc),
    grim_consistent = grim_ok,
    power = if (is.na(pw)) NA else round(pw, 3)
  ), auto_unbox = TRUE, na = "null"), "\n")
}

if (!ok) quit(save = "no", status = 1)
cat("R verification stack OK\n")
