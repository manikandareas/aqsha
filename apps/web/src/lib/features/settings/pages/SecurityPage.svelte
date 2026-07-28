<script lang="ts">
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import PasswordPanel from '../security/PasswordPanel.svelte';
	import ActiveDevicesPanel from '../security/ActiveDevicesPanel.svelte';
	// Temporarily disabled — uncomment (here + the markup below) to re-enable; the panel file remains
	// fully implemented (TOTP enroll via Clerk frontend SDK + @svelte-put/qr + reverification).
	// import TwoFactorPanel from '../security/TwoFactorPanel.svelte';
</script>

<SettingsHeader section="security" />
<PasswordPanel />
<!-- <TwoFactorPanel /> -->
<ActiveDevicesPanel />
