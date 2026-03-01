<script setup lang="ts">
import { syncApi, type SyncConfig } from "@/utils/syncApi";
import { toast } from "@/utils/toasts";
import { computed, onMounted, ref } from "vue";

const loading = ref(false);
const status = ref<any>(null);

const enabled = computed(() => status.value?.status?.enabled || false);
const running = computed(() => status.value?.status?.running || false);

const interval = ref(900000); // 15 minutes default
const batchSize = ref(10);
const scopeTracks = ref(true);
const scopeAlbums = ref(true);
const scopePlaylists = ref(false);
const maxAttempts = ref(5);
const baseDelay = ref(60000); // 1 minute

const intervalMinutes = computed({
	get: () => Math.floor(interval.value / 60000),
	set: (val) => (interval.value = val * 60000),
});

const baseDelaySeconds = computed({
	get: () => Math.floor(baseDelay.value / 1000),
	set: (val) => (baseDelay.value = val * 1000),
});

async function loadStatus() {
	try {
		const response = await syncApi.getStatus();
		status.value = response;

		if (response.status?.settings) {
			interval.value = response.status.settings.interval;
			batchSize.value = response.status.settings.batchSize;
			scopeTracks.value = response.status.settings.scope.tracks;
			scopeAlbums.value = response.status.settings.scope.albums;
			scopePlaylists.value = response.status.settings.scope.playlists;
			maxAttempts.value = response.status.settings.retry.maxAttempts;
			baseDelay.value = response.status.settings.retry.baseDelay;
		}
	} catch (error) {
		console.error("Failed to load sync status:", error);
	}
}

async function toggleSync() {
	loading.value = true;
	try {
		if (enabled.value) {
			await syncApi.stop();
			toast("Sync stopped successfully", "check_circle");
		} else {
			await syncApi.start();
			toast("Sync started successfully", "check_circle");
		}
		await loadStatus();
	} catch (error) {
		toast(`Failed to toggle sync: ${error instanceof Error ? error.message : String(error)}`, "error");
	} finally {
		loading.value = false;
	}
}

async function saveConfig() {
	if (interval.value < 300000) {
		toast("Interval must be at least 5 minutes", "error");
		return;
	}
	
	if (batchSize.value < 1 || batchSize.value > 100) {
		toast("Batch size must be between 1 and 100", "error");
		return;
	}

	loading.value = true;
	try {
		const config: SyncConfig = {
			interval: interval.value,
			batchSize: batchSize.value,
			scope: {
				tracks: scopeTracks.value,
				albums: scopeAlbums.value,
				playlists: scopePlaylists.value,
			},
			retry: {
				maxAttempts: maxAttempts.value,
				baseDelay: baseDelay.value,
			},
		};

		await syncApi.configure(config);
		toast("Configuration saved successfully", "check_circle");
		await loadStatus();
	} catch (error) {
		toast(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`, "error");
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	loadStatus();
});
</script>

<template>
	<div class="settings-container">
		<h2>Sync Settings</h2>

		<div class="setting-group">
			<label class="toggle-label">
				<input
					type="checkbox"
					:checked="enabled"
					:disabled="loading"
					@change="toggleSync"
				/>
				<span>Enable Sync</span>
			</label>
			<p class="help-text">
				Automatically sync your Deezer favorites to downloads
			</p>
		</div>

		<div class="setting-group">
			<label>
				Sync Interval (minutes)
				<input
					v-model.number="intervalMinutes"
					type="number"
					:disabled="loading || running"
					min="5"
					step="1"
				/>
			</label>
			<p class="help-text">Minimum 5 minutes between sync runs</p>
		</div>

		<div class="setting-group">
			<label>
				Batch Size
				<input
					v-model.number="batchSize"
					type="number"
					:disabled="loading || running"
					min="1"
					max="100"
					step="1"
				/>
			</label>
			<p class="help-text">
				Number of items to download per sync cycle (1-100)
			</p>
		</div>

		<div class="setting-group">
			<h3>What to Sync</h3>
			<label class="checkbox-label">
				<input
					v-model="scopeTracks"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span>Tracks</span>
			</label>
			<label class="checkbox-label">
				<input
					v-model="scopeAlbums"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span>Albums</span>
			</label>
			<label class="checkbox-label">
				<input
					v-model="scopePlaylists"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span>Playlists</span>
			</label>
		</div>

		<div class="setting-group">
			<h3>Retry Settings</h3>
			<label>
				Max Retry Attempts
				<input
					v-model.number="maxAttempts"
					type="number"
					:disabled="loading || running"
					min="1"
					max="10"
					step="1"
				/>
			</label>
			<label>
				Base Delay (seconds)
				<input
					v-model.number="baseDelaySeconds"
					type="number"
					:disabled="loading || running"
					min="1"
					step="1"
				/>
			</label>
		</div>

		<button
			:disabled="loading || running"
			class="btn btn-primary"
			@click="saveConfig"
		>
			{{ loading ? "Saving..." : "Save Configuration" }}
		</button>
	</div>
</template>

<style scoped>
.settings-container {
	padding: 2rem;
	max-width: 600px;
}

.setting-group {
	margin-bottom: 2rem;
}

.setting-group label {
	display: block;
	margin-bottom: 0.5rem;
	font-weight: 500;
}

.setting-group input[type="number"] {
	width: 100%;
	padding: 0.5rem;
	border: 1px solid var(--foreground);
	border-radius: 4px;
	background: var(--secondary-background);
	color: var(--foreground);
	margin-top: 0.25rem;
}

.toggle-label,
.checkbox-label {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	cursor: pointer;
	margin-bottom: 0.5rem;
}

.toggle-label input,
.checkbox-label input {
	width: auto;
}

.help-text {
	font-size: 0.875rem;
	color: var(--secondary-text);
	margin-top: 0.25rem;
}

.btn {
	padding: 0.75rem 1.5rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 1rem;
	transition: opacity 0.2s;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-primary {
	background: var(--primary-color);
	color: var(--primary-text);
}

.btn-primary:hover:not(:disabled) {
	opacity: 0.9;
}

h2 {
	margin-bottom: 1.5rem;
}

h3 {
	margin-bottom: 1rem;
	font-size: 1.125rem;
}
</style>
