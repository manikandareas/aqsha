/**
 * Blank-document authoring at the LIBRARY (loose markdown documents) stays OFF: a document
 * created from the library opens in a read-only reader — the affordance would trap the user.
 * Document writing now lives in the CHAPTER EDITOR (sections/[sectionId], DOCX via SuperDoc)
 * and is not gated by this flag. This flag only gates the "create document" CTA in the library;
 * remove it if library authoring is decided dead for good.
 */
export const DOCUMENT_AUTHORING_ENABLED = false;
