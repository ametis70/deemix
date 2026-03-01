<script setup lang="ts">
import { syncApi, type SyncConfig } from "@/utils/syncApi";
import { toast } from "@/utils/toasts";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const loading = ref(false);
const syncing = ref(false);
const status = ref<any>(null);

const enabled = computed(() => status.value?.status?.enabled || false);
const running = computed(() => status.value?.status?.running || false);

const interval = ref(900000);
const batchSize = ref(10);
const scopeTracks = ref(true);
const scopeAlbums = ref(true);
const scopePlaylists = ref(false);
const scopeArtists = ref(true);
const maxAttempts = ref(5);
const baseDelay = ref(60000);

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
			scopeArtists.value = response.status.settings.scope.artists;
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
			toast(t("sync.toasts.syncStopped"), "check_circle");
		} else {
			await syncApi.start();
			toast(t("sync.toasts.syncStarted"), "check_circle");
		}
		await loadStatus();
	} catch (error) {
		toast(
			`Failed to toggle sync: ${error instanceof Error ? error.message : String(error)}`,
			"error"
		);
	} finally {
		loading.value = false;
	}
}

async function triggerSync() {
	syncing.value = true;
	try {
		await syncApi.triggerNow();
		toast(t("sync.toasts.syncTriggered"), "check_circle");
		await loadStatus();
	} catch (error) {
		toast(
			`Failed to trigger sync: ${error instanceof Error ? error.message : String(error)}`,
			"error"
		);
	} finally {
		syncing.value = false;
	}
}

async function saveConfig() {
	if (interval.value < 300000) {
		toast(t("sync.toasts.intervalTooShort"), "error");
		return;
	}

	if (batchSize.value < 1 || batchSize.value > 100) {
		toast(t("sync.toasts.batchSizeInvalid"), "error");
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
				artists: scopeArtists.value,
			},
			retry: {
				maxAttempts: maxAttempts.value,
				baseDelay: baseDelay.value,
			},
		};

		await syncApi.configure(config);
		toast(t("sync.toasts.configSaved"), "check_circle");
		await loadStatus();
	} catch (error) {
		toast(
			`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`,
			"error"
		);
	} finally {
		loading.value = false;
	}
}

onMounted(() => {
	loadStatus();
});
</script>

<template>
	<div>
		<h2 class="mb-6 text-2xl">{{ t("sync.settings.title") }}</h2>

		<div class="mb-8">
			<label class="with-checkbox">
				<input
					type="checkbox"
					:checked="enabled"
					:disabled="loading"
					@change="toggleSync"
				/>
				<span class="checkbox-text">{{ t("sync.settings.enableSync") }}</span>
			</label>
			<p class="secondary-text mt-1 text-sm">
				{{ t("sync.settings.enableSyncHelp") }}
			</p>
		</div>

		<div class="mb-8">
			<label>
				{{ t("sync.settings.interval") }}
				<input
					v-model.number="intervalMinutes"
					type="number"
					:disabled="loading || running"
					min="5"
					step="1"
				/>
			</label>
			<p class="secondary-text mt-1 text-sm">
				{{ t("sync.settings.intervalHelp") }}
			</p>
		</div>

		<div class="mb-8">
			<label>
				{{ t("sync.settings.batchSize") }}
				<input
					v-model.number="batchSize"
					type="number"
					:disabled="loading || running"
					min="1"
					max="100"
					step="1"
				/>
			</label>
			<p class="secondary-text mt-1 text-sm">
				{{ t("sync.settings.batchSizeHelp") }}
			</p>
		</div>

		<div class="mb-8">
			<h3 class="mb-4 text-lg font-medium">
				{{ t("sync.settings.whatToSync") }}
			</h3>
			<label class="with-checkbox">
				<input
					v-model="scopeTracks"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span class="checkbox-text">{{ t("sync.settings.tracks") }}</span>
			</label>
			<label class="with-checkbox">
				<input
					v-model="scopeAlbums"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span class="checkbox-text">{{ t("sync.settings.albums") }}</span>
			</label>
			<label class="with-checkbox">
				<input
					v-model="scopePlaylists"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span class="checkbox-text">{{ t("sync.settings.playlists") }}</span>
			</label>
			<label class="with-checkbox">
				<input
					v-model="scopeArtists"
					type="checkbox"
					:disabled="loading || running"
				/>
				<span class="checkbox-text">{{ t("sync.settings.artists") }}</span>
			</label>
		</div>

		<div class="mb-8">
			<h3 class="mb-4 text-lg font-medium">
				{{ t("sync.settings.retrySettings") }}
			</h3>
			<label>
				{{ t("sync.settings.maxRetryAttempts") }}
				<input
					v-model.number="maxAttempts"
					type="number"
					:disabled="loading || running"
					min="1"
					max="10"
					step="1"
				/>
			</label>
			<label class="mt-4 block">
				{{ t("sync.settings.baseDelay") }}
				<input
					v-model.number="baseDelaySeconds"
					type="number"
					:disabled="loading || running"
					min="1"
					step="1"
				/>
			</label>
		</div>

		<div class="mt-8 flex gap-2">
			<button
				:disabled="syncing || !enabled"
				class="btn btn-primary"
				@click="triggerSync"
			>
				{{ syncing ? t("sync.settings.syncing") : t("sync.settings.syncNow") }}
			</button>
			<button
				:disabled="loading || running"
				class="btn btn-primary"
				@click="saveConfig"
			>
				{{
					loading ? t("sync.settings.saving") : t("sync.settings.saveConfig")
				}}
			</button>
		</div>
	</div>
</template>
