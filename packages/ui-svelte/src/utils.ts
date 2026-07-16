import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';
import { defaultConfig } from 'tailwind-variants';

// The UI type staircase (--text-micro/label/control/field in tokens.css) must be classified as
// font-size utilities. A default-config merge reads `text-field` as a text COLOR, so a variant
// pairing `text-primary-foreground` with size `text-field` silently loses its color class.
const twMergeConfig = {
	extend: {
		classGroups: {
			'font-size': ['text-micro', 'text-label', 'text-control', 'text-field']
		}
	}
} as const;

const twMerge = extendTailwindMerge(twMergeConfig);

// tv() runs its own internal twMerge before `cn` ever sees the classes, so the same config must
// reach tailwind-variants too. Every component imports this module (for `cn`) before calling
// tv(), so the default is set before any variant list is merged.
defaultConfig.twMergeConfig = twMergeConfig;

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & {
	ref?: U | null;
};
