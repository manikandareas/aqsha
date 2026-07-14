<script lang="ts">
	import * as Sidebar from './index.js';

	// Test-only fixture for sidebar-menu-button.svelte.spec.ts: two menu buttons, one active and
	// one not, inside a Sidebar.Provider (which supplies the `useSidebar()` context the button reads).
</script>

<Sidebar.Provider>
	<Sidebar.Menu>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton isActive={true} data-testid="active-button">Active</Sidebar.MenuButton>
		</Sidebar.MenuItem>
		<Sidebar.MenuItem>
			<Sidebar.MenuButton isActive={false} data-testid="inactive-button"
				>Inactive</Sidebar.MenuButton
			>
		</Sidebar.MenuItem>
	</Sidebar.Menu>
</Sidebar.Provider>
