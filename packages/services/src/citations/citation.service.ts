import { citationCrudMethods } from "./citation-crud.methods";
import { citationRenderMethods } from "./citation-render.methods";
import { citationSearchBatchMethods } from "./citation-search-batch";

export type {
  CitationDetail,
  CitationDuplicateGroup,
  CitationListItem,
  CitationSettingsView,
  CreateFromArtifactResult,
} from "./citation-model";
export type {
  BulkSearchSaveItem,
  BulkSearchSaveResult,
  SearchSourceExportResult,
  SearchSourceInput,
} from "./citation-search-batch";

/**
 * Citation operations are composed here so callers retain one stable facade while
 * persistence, mutation, and rendering stay independently maintainable.
 */
export const CitationService = {
  ...citationCrudMethods,
  ...citationSearchBatchMethods,
  ...citationRenderMethods,
};
