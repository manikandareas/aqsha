<script lang="ts">
	// FrameChrome — dressing editorial untuk frame gambar besar: overlay paper-grain (golden CSS) +
	// empat tanda crosshair sudut. Dipakai hero frame & tiap FeatureFrame. Port `feature-frame.tsx`.
	const corners = ['left-3 top-3', 'right-3 top-3', 'bottom-3 left-3', 'bottom-3 right-3'] as const;
</script>

<div class="paper-grain pointer-events-none absolute inset-0"></div>
{#each corners as pos (pos)}
	<span aria-hidden="true" class="pointer-events-none absolute size-[3px] bg-foreground/50 {pos}"
	></span>
{/each}
