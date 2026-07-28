export * from './annotation-target-types';
export {
	buildBlockIndex,
	groupFragmentsIntoLines,
	groupLinesIntoBlocks
} from './annotation-fragments';
export { hitTestBlock, resolveVedivadBlockAtPoint } from './annotation-hit-test';
export { combineSemanticBlockRange, resolveSemanticAreaRange } from './annotation-drag-select';
export { blockToDraft } from './annotation-draft';
