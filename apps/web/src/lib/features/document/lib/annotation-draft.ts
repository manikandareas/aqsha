import type { AnnotationDraft } from './annotation-selection';
import type { SemanticBlock } from './annotation-target-types';

export function blockToDraft(block: SemanticBlock): AnnotationDraft {
	return { selectedText: block.text, page: block.page, rects: block.rects };
}
