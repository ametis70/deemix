<script setup lang="ts">
import { syncApi } from "@/utils/syncApi";
import { computed, onMounted, onUnmounted, ref } from "vue";

const status = ref<any>(null);
const pollInterval = ref<number | null>(null);

const enabled = computed(() => status.value?.status?.enabled || false);
const statusColor = computed(() => {
	if (!status.value) return "grey";
	const st = status.value.status?.status;
	if (st === "running") return "green";
	if (st === "error") return "red";
	return "grey";
});

const statusText = computed(() => {
	if (!status.value) return "Unknown";
	const st = status.value.status?.status;
	if (st === "running") return "Running";
	if (st === "error") return "Error";
	return "Idle";
});

const lastSync = computed(() => {
	const timestamp = status.value?.status?.lastSyncAt;
	if (!timestamp) return "Never";
	return new Date(timestamp).toLocaleString();
});

const lastSuccessfulSync = computed(() => {
	const timestamp = status.value?.status?.lastSuccessfulSyncAt;
	if (!timestamp) return "Never";
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
	}, 5000); // Poll every 5 seconds
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
	<div class="status-container">
		<h2>Sync Status</h2>

		<div class="status-header">
			<div class="status-badge" :class="`status-${statusColor}`">
				{{ statusText }}
			</div>
			<div class="status-info">
				<div>Last Sync: {{ lastSync }}</div>
				<div>Last Successful: {{ lastSuccessfulSync }}</div>
			</div>
		</div>

		<div class="statistics-grid">
			<div class="stat-card">
				<div class="stat-label">Total Synced</div>
				<div class="stat-value">{{ totalSynced }}</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">Total Failed</div>
				<div class="stat-value error">{{ totalFailed }}</div>
			</div>
			<div class="stat-card">
				<div class="stat-label">Last Run Duration</div>
				<div class="stat-value">{{ lastRunDuration }}</div>
			</div>
		</div>

		<div class="tracked-items">
			<h3>Tracked Items</h3>
			<div class="tracked-grid">
				<div class="tracked-item">
					<span class="tracked-label">New:</span>
					<span class="tracked-count">{{ trackedSummary.new }}</span>
				</div>
				<div class="tracked-item">
					<span class="tracked-label">Downloading:</span>
					<span class="tracked-count">{{ trackedSummary.downloading }}</span>
				</div>
				<div class="tracked-item">
					<span class="tracked-label">Success:</span>
					<span class="tracked-count success">{{
						trackedSummary.success
					}}</span>
				</div>
				<div class="tracked-item">
					<span class="tracked-label">Failed:</span>
					<span class="tracked-count error">{{ trackedSummary.failed }}</span>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.status-container {
	padding: 2rem;
	max-width: 800px;
}

.status-header {
	display: flex;
	align-items: center;
	gap: 1.5rem;
	margin-bottom: 2rem;
}

.status-badge {
	padding: 0.5rem 1rem;
	border-radius: 4px;
	font-weight: 600;
	text-transform: uppercase;
	font-size: 0.875rem;
}

.status-grey {
	background: #6c757d;
	color: white;
}

.status-green {
	background: #28a745;
	color: white;
}

.status-red {
	background: #dc3545;
	color: white;
}

.status-info {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.875rem;
	color: var(--secondary-text);
}

.statistics-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
	gap: 1rem;
	margin-bottom: 2rem;
}

.stat-card {
	background: var(--secondary-background);
	padding: 1.5rem;
	border-radius: 8px;
	text-align: center;
}

.stat-label {
	font-size: 0.875rem;
	color: var(--secondary-text);
	margin-bottom: 0.5rem;
}

.stat-value {
	font-size: 2rem;
	font-weight: 700;
	color: var(--foreground);
}

.stat-value.error {
	color: #dc3545;
}

.tracked-items {
	background: var(--secondary-background);
	padding: 1.5rem;
	border-radius: 8px;
}

.tracked-items h3 {
	margin-bottom: 1rem;
	font-size: 1.125rem;
}

.tracked-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
	gap: 1rem;
}

.tracked-item {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 0.75rem;
	background: var(--main-background);
	border-radius: 4px;
}

.tracked-label {
	font-size: 0.875rem;
	color: var(--secondary-text);
}

.tracked-count {
	font-size: 1.25rem;
	font-weight: 600;
	color: var(--foreground);
}

.tracked-count.success {
	color: #28a745;
}

.tracked-count.error {
	color: #dc3545;
}

h2 {
	margin-bottom: 1.5rem;
}
</style>
