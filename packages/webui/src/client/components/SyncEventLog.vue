<script setup lang="ts">
import { syncApi } from "@/utils/syncApi";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();

const events = ref<any[]>([]);
const loading = ref(false);
const limit = ref(50);

const severityBorderClass = (severity: string) => {
	if (severity === "error") return "border-l-red-500";
	if (severity === "warning") return "border-l-yellow-500";
	return "border-l-sky-500";
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
	<div>
		<h2 class="mb-6 text-2xl">{{ t("sync.events.title") }}</h2>

		<p
			v-if="loading && events.length === 0"
			class="p-8 text-center text-[var(--secondary-text)]"
		>
			{{ t("sync.events.loading") }}
		</p>

		<p
			v-else-if="events.length === 0"
			class="p-8 text-center text-[var(--secondary-text)]"
		>
			{{ t("sync.events.noEvents") }}
		</p>

		<div v-else class="mb-4 flex flex-col gap-4">
			<div
				v-for="event in events"
				:key="event.id"
				class="rounded border-l-4 bg-[var(--secondary-background)] p-4"
				:class="severityBorderClass(event.severity)"
			>
				<div class="mb-2 flex items-center justify-between text-sm">
					<span class="font-semibold uppercase">{{ event.type }}</span>
					<span class="text-[var(--secondary-text)]">{{
						formatTimestamp(event.timestamp)
					}}</span>
				</div>
				<div class="mb-2">{{ event.message }}</div>
				<div v-if="event.details">
					<details>
						<summary
							class="cursor-pointer text-sm text-[var(--secondary-text)]"
						>
							{{ t("sync.events.showDetails") }}
						</summary>
						<pre
							class="mt-2 overflow-x-auto rounded bg-[var(--main-background)] p-2 text-xs"
							>{{ JSON.stringify(event.details, null, 2) }}</pre
						>
					</details>
				</div>
			</div>
		</div>

		<button
			v-if="events.length > 0 && events.length % 50 === 0"
			:disabled="loading"
			class="btn btn-primary w-full"
			@click="loadMore"
		>
			{{ loading ? t("sync.events.loading") : t("sync.events.loadMore") }}
		</button>
	</div>
</template>
