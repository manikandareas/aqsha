<script lang="ts">
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import PasswordPanel from '../security/PasswordPanel.svelte';
	import ActiveDevicesPanel from '../security/ActiveDevicesPanel.svelte';
	// Temporarily disabled — uncomment (here + the markup below) to re-enable; the panel file remains
	// fully ported (TOTP enroll via Clerk frontend SDK + @svelte-put/qr + reverification). This mirrors
	// web's security-page.tsx, where TwoFactorPanel is likewise commented out (SET-6 decision record).
	// import TwoFactorPanel from '../security/TwoFactorPanel.svelte';

	// Port 1:1 from apps/web/features/settings/security-page.tsx.
</script>

<SettingsHeader section="security" />
<PasswordPanel />
<!-- <TwoFactorPanel /> -->
<ActiveDevicesPanel />
