<script lang="ts">
	import { page } from '$app/state';
	import SectionEditorPage from '$lib/features/sections/pages/SectionEditorPage.svelte';
</script>

<SectionEditorPage projectId={page.params.projectId!} sectionId={page.params.sectionId!} />
