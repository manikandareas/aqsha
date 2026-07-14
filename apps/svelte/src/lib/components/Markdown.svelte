<script lang="ts">
	import { Streamdown } from 'svelte-streamdown';

	let { content, class: klass }: { content: string; class?: string } = $props();
</script>

<!--
  Streaming Markdown renderer (dealbreaker #3). `svelte-streamdown` handles incomplete/malformed
  Markdown mid-stream (`parseIncompleteMarkdown`), GFM tables, code (Shiki), math (KaTeX), Mermaid,
  and CJK out of the box.

  SECURITY: link/image URLs are restricted to an explicit allowlist. `javascript:` and `data:` are
  NOT in the list (and are excluded by the default `['*']` too, which only permits http/https), so
  script-bearing hrefs and data: payloads are stripped. Raw HTML is not executed — Streamdown renders
  Markdown, not a raw HTML passthrough. See markdown.svelte.spec.ts for the XSS corpus that pins this.
-->
<Streamdown
	{content}
	class={klass}
	parseIncompleteMarkdown={true}
	allowedLinkPrefixes={['https://', 'http://', 'mailto:', '/']}
	allowedImagePrefixes={['https://', 'http://', '/']}
/>
