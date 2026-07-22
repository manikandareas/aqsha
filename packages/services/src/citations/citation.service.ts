import { citationCrudMethods } from "./citation-crud.methods";
import { citationRenderMethods } from "./citation-render.methods";

export type {
  CitationDetail,
  CitationDuplicateGroup,
  CitationListItem,
  CitationSettingsView,
  CreateFromArtifactResult,
} from "./citation-model";

/**
 * Citation operations are composed here so callers retain one stable facade while
 * persistence, mutation, and rendering stay independently maintainable.
 */
export const CitationService = {
  ...citationCrudMethods,
  ...citationRenderMethods,
};
