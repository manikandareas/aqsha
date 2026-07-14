import { getContext, setContext } from 'svelte';

/**
 * Factory context bertipe (plan §3.5 — pakai `createContext`, bukan `setContext/getContext` telanjang).
 * Scope per-tree/per-request (bukan module-level mutable state → tak bocor lintas user saat SSR).
 * `get()` throw bila belum di-`set` di parent; `getOptional()` untuk kasus opsional.
 */
export function createContext<T>(name: string) {
	const key = Symbol(name);
	return {
		set(value: T): T {
			return setContext(key, value);
		},
		get(): T {
			const value = getContext<T | undefined>(key);
			if (value === undefined) {
				throw new Error(`Context "${name}" belum di-set di parent tree.`);
			}
			return value;
		},
		getOptional(): T | undefined {
			return getContext<T | undefined>(key);
		}
	};
}
