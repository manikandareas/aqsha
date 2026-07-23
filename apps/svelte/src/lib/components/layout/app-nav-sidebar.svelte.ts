import { createContext } from '$lib/context';
import { useSidebar } from '$lib/components/ui/sidebar/context.svelte.js';

/**
 * AppShell left-nav sidebar. Distinct from nested `DetailSplitLayout` / side-panel
 * `Sidebar.Provider` instances so page headers can toggle the rail even inside a split.
 */
export const appNavSidebarContext = createContext<ReturnType<typeof useSidebar>>('app-nav-sidebar');
