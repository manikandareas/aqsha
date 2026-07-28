import { BookOpenIcon, FileTextIcon, GlobeIcon, type IconSvgElement } from '$lib/icons';

export {
	dedupeCards,
	faviconUrl,
	researchSourceToCard,
	sourceDomain,
	sourceHref,
	toCards
} from '@aqsha/chat-core/timeline';

export function originMeta(origin: string): { icon: IconSvgElement; label: string } {
	switch (origin) {
		case 'arxiv':
			return { icon: FileTextIcon, label: 'arXiv' };
		case 'doi':
			return { icon: BookOpenIcon, label: 'Makalah' };
		default:
			return { icon: GlobeIcon, label: 'Web' };
	}
}
