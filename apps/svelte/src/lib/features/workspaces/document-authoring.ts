/**
 * Blank-document authoring (creating an empty BlockNote document to write into) is DEFERRED to
 * the post-cutover editor redesign. Until an editor exists, a created document opens in a READ-ONLY reader,
 * so surfacing a "create document" affordance would trap the user in an un-editable blank
 * artifact. This flag hides those affordances so nothing promises editing then no-ops.
 *
 * Scope: this gates ONLY authored blank documents. Uploads and "save URL" create artifacts that
 * are read-only by design (papers, PDFs, links) and stay enabled.
 *
 * Redesign flips this to `true` once the editor is wired (and, if the engine changes, once the
 * create flow targets the new editor).
 */
export const DOCUMENT_AUTHORING_ENABLED = false;
