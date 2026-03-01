<script setup lang="ts">
import { syncApi } from "@/utils/syncApi";
import { onMounted, ref } from "vue";

const events = ref<any[]>([]);
const loading = ref(false);
const limit = ref(50);

const severityClass = (severity: string) => {
	if (severity === "error") return "severity-error";
	if (severity === "warning") return "severity-warning";
	return "severity-info";
};

const formatTimestamp = (timestamp: string) => {
	return new Date(timestamp).toLocaleString();
};

async function loadEvents() {
	loading.value = true;
	try {
		const response = await syncApi.getEvents(limit.value);
		events.value = response.events || [];
	} catch (error) {
		console.error("Failed to load events:", error);
	} finally {
		loading.value = false;
	}
}

async function loadMore() {
	limit.value += 50;
	await loadEvents();
}

onMounted(() => {
	loadEvents();
});
</script>

<template>
	<div class="event-log-container">
		<h2>Event Log</h2>

		<div v-if="loading && events.length === 0" class="loading">
			Loading events...
		</div>

		<div v-else-if="events.length === 0" class="no-events">
			No events recorded yet
		</div>

		<div v-else class="events-list">
			<div
				v-for="event in events"
				:key="event.id"
				class="event-item"
				:class="severityClass(event.severity)"
			>
				<div class="event-header">
					<span class="event-type">{{ event.type }}</span>
					<span class="event-time">{{ formatTimestamp(event.timestamp) }}</span>
				</div>
				<div class="event-message">{{ event.message }}</div>
				<div v-if="event.details" class="event-details">
					<details>
						<summary>Show details</summary>
						<pre>{{ JSON.stringify(event.details, null, 2) }}</pre>
					</details>
				</div>
			</div>
		</div>

		<button
			v-if="events.length > 0 && events.length % 50 === 0"
			:disabled="loading"
			class="btn btn-secondary"
			@click="loadMore"
		>
			{{ loading ? "Loading..." : "Load More" }}
		</button>
	</div>
</template>

<style scoped>
.event-log-container {
	padding: 2rem;
	max-width: 1000px;
}

.loading,
.no-events {
	text-align: center;
	padding: 2rem;
	color: var(--secondary-text);
}

.events-list {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	margin-bottom: 1rem;
}

.event-item {
	background: var(--secondary-background);
	border-left: 4px solid;
	padding: 1rem;
	border-radius: 4px;
}

.severity-info {
	border-left-color: #17a2b8;
}

.severity-warning {
	border-left-color: #ffc107;
}

.severity-error {
	border-left-color: #dc3545;
}

.event-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.5rem;
	font-size: 0.875rem;
}

.event-type {
	font-weight: 600;
	text-transform: uppercase;
	color: var(--foreground);
}

.event-time {
	color: var(--secondary-text);
}

.event-message {
	color: var(--foreground);
	margin-bottom: 0.5rem;
}

.event-details {
	margin-top: 0.5rem;
}

.event-details summary {
	cursor: pointer;
	font-size: 0.875rem;
	color: var(--secondary-text);
	user-select: none;
}

.event-details pre {
	margin-top: 0.5rem;
	padding: 0.5rem;
	background: var(--main-background);
	border-radius: 4px;
	font-size: 0.75rem;
	overflow-x: auto;
}

.btn {
	padding: 0.75rem 1.5rem;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 1rem;
	transition: opacity 0.2s;
	width: 100%;
}

.btn:disabled {
	opacity: 0.5;
	cursor: not-allowed;
}

.btn-secondary {
	background: var(--secondary-background);
	color: var(--foreground);
	border: 1px solid var(--foreground);
}

.btn-secondary:hover:not(:disabled) {
	opacity: 0.9;
}

h2 {
	margin-bottom: 1.5rem;
}
</style>
