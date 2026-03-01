<script setup lang="ts">
import { syncApi } from "@/utils/syncApi";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const status = ref<any>(null);
const pollInterval = ref<number | null>(null);

const enabled = computed(() => status.value?.status?.enabled || false);

const statusBgClass = computed(() => {
	if (!status.value) return "bg-gray-500";
	const st = status.value.status?.status;
	if (st === "running") return "bg-green-600";
	if (st === "error") return "bg-red-600";
	return "bg-gray-500";
});

const statusText = computed(() => {
	if (!status.value) return t("sync.status.unknown");
	const st = status.value.status?.status;
	if (st === "running") return t("sync.status.running");
	if (st === "error") return t("sync.status.error");
	return t("sync.status.idle");
});

const lastSync = computed(() => {
	const timestamp = status.value?.status?.lastSyncAt;
	if (!timestamp) return t("sync.status.never");
	return new Date(timestamp).toLocaleString();
});

const lastSuccessfulSync = computed(() => {
	const timestamp = status.value?.status?.lastSuccessfulSyncAt;
	if (!timestamp) return t("sync.status.never");
	return new Date(timestamp).toLocaleString();
});

const totalSynced = computed(
	() => status.value?.status?.statistics?.totalSynced || 0
);
const totalFailed = computed(
	() => status.value?.status?.statistics?.totalFailed || 0
);
const lastRunDuration = computed(() => {
	const duration = status.value?.status?.statistics?.lastRunDuration || 0;
	return (duration / 1000).toFixed(1) + "s";
});

const trackedSummary = computed(
	() =>
		status.value?.trackedItemsSummary || {
			new: 0,
			downloading: 0,
			success: 0,
			failed: 0,
		}
);

async function loadStatus() {
	try {
		const response = await syncApi.getStatus();
		status.value = response;
	} catch (error) {
		console.error("Failed to load sync status:", error);
	}
}

function startPolling() {
	loadStatus();
	pollInterval.value = window.setInterval(() => {
		if (enabled.value) {
			loadStatus();
		}
	}, 5000);
}

function stopPolling() {
	if (pollInterval.value !== null) {
		clearInterval(pollInterval.value);
		pollInterval.value = null;
	}
}

onMounted(() => {
	startPolling();
});

onUnmounted(() => {
	stopPolling();
});
</script>

<template>
	<div>
		<h2 class="mb-6 text-2xl">{{ t("sync.status.title") }}</h2>

		<div class="mb-8 flex items-center gap-6">
			<span
				class="rounded px-3 py-1 text-sm font-semibold uppercase text-white"
				:class="statusBgClass"
			>
				{{ statusText }}
			</span>
			<div class="flex flex-col gap-1">
				<p class="text-sm text-[var(--secondary-text)]">
					{{ t("sync.status.lastSync") }}: {{ lastSync }}
				</p>
				<p class="text-sm text-[var(--secondary-text)]">
					{{ t("sync.status.lastSuccessful") }}: {{ lastSuccessfulSync }}
				</p>
			</div>
		</div>

		<div class="mb-8 grid grid-cols-3 gap-4">
			<div class="rounded-lg bg-[var(--secondary-background)] p-6 text-center">
				<div class="mb-2 text-sm text-[var(--secondary-text)]">
					{{ t("sync.status.totalSynced") }}
				</div>
				<div class="text-3xl font-bold">{{ totalSynced }}</div>
			</div>
			<div class="rounded-lg bg-[var(--secondary-background)] p-6 text-center">
				<div class="mb-2 text-sm text-[var(--secondary-text)]">
					{{ t("sync.status.totalFailed") }}
				</div>
				<div class="text-3xl font-bold text-red-500">
					{{ totalFailed }}
				</div>
			</div>
			<div class="rounded-lg bg-[var(--secondary-background)] p-6 text-center">
				<div class="mb-2 text-sm text-[var(--secondary-text)]">
					{{ t("sync.status.lastRunDuration") }}
				</div>
				<div class="text-3xl font-bold">{{ lastRunDuration }}</div>
			</div>
		</div>

		<div class="rounded-lg bg-[var(--secondary-background)] p-6">
			<h3 class="mb-4 text-lg font-medium">
				{{ t("sync.status.trackedItems") }}
			</h3>
			<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
				<div
					class="flex items-center justify-between rounded bg-[var(--main-background)] p-3"
				>
					<span class="text-sm text-[var(--secondary-text)]">{{
						t("sync.status.new")
					}}</span>
					<span class="text-xl font-semibold">{{ trackedSummary.new }}</span>
				</div>
				<div
					class="flex items-center justify-between rounded bg-[var(--main-background)] p-3"
				>
					<span class="text-sm text-[var(--secondary-text)]">{{
						t("sync.status.downloading")
					}}</span>
					<span class="text-xl font-semibold">{{
						trackedSummary.downloading
					}}</span>
				</div>
				<div
					class="flex items-center justify-between rounded bg-[var(--main-background)] p-3"
				>
					<span class="text-sm text-[var(--secondary-text)]">{{
						t("sync.status.success")
					}}</span>
					<span class="text-xl font-semibold text-green-500">{{
						trackedSummary.success
					}}</span>
				</div>
				<div
					class="flex items-center justify-between rounded bg-[var(--main-background)] p-3"
				>
					<span class="text-sm text-[var(--secondary-text)]">{{
						t("sync.status.failed")
					}}</span>
					<span class="text-xl font-semibold text-red-500">{{
						trackedSummary.failed
					}}</span>
				</div>
			</div>
		</div>
	</div>
</template>
