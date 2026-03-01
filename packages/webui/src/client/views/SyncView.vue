<script setup lang="ts">
import SyncSettings from "@/components/SyncSettings.vue";
import SyncStatus from "@/components/SyncStatus.vue";
import SyncEventLog from "@/components/SyncEventLog.vue";
</script>

<template>
	<div class="sync-page">
		<div class="sync-header">
			<h1>Deezer Favorites Sync</h1>
			<p class="subtitle">
				Automatically sync your Deezer favorites to local downloads
			</p>
		</div>

		<div class="sync-layout">
			<div class="sync-section">
				<SyncSettings />
			</div>

			<div class="sync-section">
				<SyncStatus />
			</div>

			<div class="sync-section">
				<SyncEventLog />
			</div>
		</div>
	</div>
</template>

<style scoped>
.sync-page {
	padding: 2rem;
	max-width: 1400px;
	margin: 0 auto;
}

.sync-header {
	margin-bottom: 2rem;
	text-align: center;
}

.sync-header h1 {
	font-size: 2rem;
	margin-bottom: 0.5rem;
	color: var(--foreground);
}

.subtitle {
	font-size: 1.125rem;
	color: var(--secondary-text);
}

.sync-layout {
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.sync-section {
	background: var(--main-background);
	border-radius: 8px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	overflow: hidden;
}

@media (min-width: 1024px) {
	.sync-layout {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	.sync-section:last-child {
		grid-column: 1 / -1;
	}
}
</style>
