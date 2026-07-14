<script lang="ts">
	import { Avatar, AvatarImage, AvatarFallback, AvatarGroup } from '$lib/components/ui/avatar';

	// Ring pemisah = warna kartu (bukan background), agar celah overlap menyatu mulus
	// dengan permukaan tombol outline (bg-card) — separasi hanya terlihat saat tumpang tindih.
</script>

<AvatarGroup class="*:data-[slot=avatar]:ring-card">
	<Avatar class="size-7">
		<AvatarImage src="/general-agent.png" alt="" />
		<AvatarFallback>A</AvatarFallback>
	</Avatar>
	<Avatar class="size-7">
		<AvatarImage src="/pro-agent.png" alt="" />
		<AvatarFallback>A</AvatarFallback>
	</Avatar>
</AvatarGroup>
