<script setup lang="ts">
import SyncSettings from "@/components/SyncSettings.vue";
import SyncStatus from "@/components/SyncStatus.vue";
import SyncEventLog from "@/components/SyncEventLog.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<template>
	<div>
		<h1 class="mb-8 text-5xl">{{ t("sync.title") }}</h1>
		<p class="secondary-text mb-8">{{ t("sync.subtitle") }}</p>

		<div class="flex flex-col gap-8">
			<SyncSettings />
			<SyncStatus />
			<SyncEventLog />
		</div>
	</div>
</template>
