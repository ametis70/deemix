import type { DeemixApp } from "@/deemixApp.js";
import { logger } from "@/helpers/logger.js";
import { SyncStateManager } from "deemix";
import type { FavoriteItem } from "./FavoritesPoller.js";

export interface EnqueueResult {
	enqueued: number;
	skipped: number;
	failed: number;
}

export class DownloadOrchestrator {
	constructor(
		private deemixApp: DeemixApp,
		private stateManager: SyncStateManager
	) {}

	async enqueueItems(
		userId: string,
		sessionId: string,
		items: FavoriteItem[],
		batchSize: number
	): Promise<EnqueueResult> {
		const result: EnqueueResult = {
			enqueued: 0,
			skipped: 0,
			failed: 0,
		};

		const trackedItems = await this.stateManager.loadTrackedItems(userId);

		const itemsToEnqueue: FavoriteItem[] = [];
		for (const item of items) {
			const collectionKey = `${item.type}s` as keyof typeof trackedItems;
			const tracked = trackedItems[collectionKey][item.id];

			if (!tracked || tracked.status !== "success") {
				itemsToEnqueue.push(item);
			} else {
				result.skipped++;
			}
		}

		logger.info(
			`[Sync:Orchestrator] ${items.length} total items, ${itemsToEnqueue.length} to enqueue, ${result.skipped} already successful`
		);

		const { sessionDZ } = await import("@/deemixApp.js");
		const dz = sessionDZ[sessionId];

		if (!dz || !dz.loggedIn) {
			logger.error(
				`[Sync:Orchestrator] Session ${sessionId} invalid (missing=${!dz}, loggedIn=${dz?.loggedIn})`
			);
			throw new Error("Not logged in to Deezer");
		}

		const totalBatches = Math.ceil(itemsToEnqueue.length / batchSize);

		for (let i = 0; i < itemsToEnqueue.length; i += batchSize) {
			const batch = itemsToEnqueue.slice(i, i + batchSize);
			const batchNum = Math.floor(i / batchSize) + 1;
			logger.info(
				`[Sync:Orchestrator] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)`
			);

			for (const item of batch) {
				try {
					let url: string;
					switch (item.type) {
						case "track":
							url = `https://www.deezer.com/track/${item.id}`;
							break;
						case "album":
							url = `https://www.deezer.com/album/${item.id}`;
							break;
						case "playlist":
							url = `https://www.deezer.com/playlist/${item.id}`;
							break;
						case "artist":
							url = `https://www.deezer.com/artist/${item.id}`;
							break;
					}

					const bitrate = this.deemixApp.settings.maxBitrate;

					await this.deemixApp.addToQueue(dz, [url], bitrate, false);

					const collectionKey = `${item.type}s` as keyof typeof trackedItems;
					if (!trackedItems[collectionKey][item.id]) {
						trackedItems[collectionKey][item.id] = {
							id: item.id,
							type: item.type,
							title: item.title,
							artist: "artist" in item ? item.artist : undefined,
							status: "downloading",
							addedAt: new Date().toISOString(),
							syncedAt: null,
							retryCount: 0,
							lastError: null,
							lastAttemptAt: new Date().toISOString(),
						};
					} else {
						trackedItems[collectionKey][item.id].status = "downloading";
						trackedItems[collectionKey][item.id].lastAttemptAt =
							new Date().toISOString();
					}

					result.enqueued++;
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					logger.error(
						`[Sync:Orchestrator] Failed to enqueue ${item.type} "${item.title}" (${item.id}): ${errorMessage}`
					);
					result.failed++;

					const collectionKey = `${item.type}s` as keyof typeof trackedItems;
					if (!trackedItems[collectionKey][item.id]) {
						trackedItems[collectionKey][item.id] = {
							id: item.id,
							type: item.type,
							title: item.title,
							artist: "artist" in item ? item.artist : undefined,
							status: "failed",
							addedAt: new Date().toISOString(),
							syncedAt: null,
							retryCount: 1,
							lastError: errorMessage,
							lastAttemptAt: new Date().toISOString(),
						};
					} else {
						trackedItems[collectionKey][item.id].status = "failed";
						trackedItems[collectionKey][item.id].retryCount++;
						trackedItems[collectionKey][item.id].lastError = errorMessage;
						trackedItems[collectionKey][item.id].lastAttemptAt =
							new Date().toISOString();
					}
				}
			}

			await this.stateManager.saveTrackedItems(userId, trackedItems);
			logger.info(
				`[Sync:Orchestrator] Batch ${batchNum}/${totalBatches} complete — enqueued: ${result.enqueued}, failed: ${result.failed}`
			);
		}

		return result;
	}
}
