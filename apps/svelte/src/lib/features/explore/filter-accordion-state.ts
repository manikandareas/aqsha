import type { LiteratureFilterCategoryId } from './literature-search-types';

export type FilterAccordionState = {
	initialized: boolean;
	open: Partial<Record<LiteratureFilterCategoryId, boolean>>;
};

type Category = { id: LiteratureFilterCategoryId; label: string };

export function reconcileFilterAccordionState(
	state: FilterAccordionState,
	categories: Category[]
): FilterAccordionState {
	if (categories.length === 0) return state;

	const validIds = new Set(categories.map((category) => category.id));
	const open = Object.fromEntries(
		Object.entries(state.open).filter(([id]) => validIds.has(id as LiteratureFilterCategoryId))
	) as FilterAccordionState['open'];

	if (state.initialized) return { initialized: true, open };

	const defaultId = validIds.has('publication') ? 'publication' : categories[0]!.id;
	return { initialized: true, open: { ...open, [defaultId]: true } };
}
