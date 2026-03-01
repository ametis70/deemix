import type { DeemixApp } from "@/deemixApp.js";
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

		// Load tracked items to check status
		const trackedItems = await this.stateManager.loadTrackedItems(userId);

		// Filter items that haven't been successfully downloaded
		const itemsToEnqueue: FavoriteItem[] = [];
		for (const item of items) {
			const collectionKey = `${item.type}s` as keyof typeof trackedItems;
			const tracked = trackedItems[collectionKey][item.id];

			if (!tracked || tracked.status !== "success") {
				itemsToEnqueue.push(item);
			} else {
				result.skipped++;
			}

			// Respect batch size
			if (itemsToEnqueue.length >= batchSize) {
				break;
			}
		}

		// Get Deezer client for this session
		const { sessionDZ } = await import("@/deemixApp.js");
		const dz = sessionDZ[sessionId];

		if (!dz || !dz.loggedIn) {
			throw new Error("Not logged in to Deezer");
		}

		// Enqueue each item
		for (const item of itemsToEnqueue) {
			try {
				// Convert to Deezer URL format
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
				}

				// Use default bitrate from settings
				const bitrate = this.deemixApp.settings.maxBitrate;

				// Add to queue
				await this.deemixApp.addToQueue(dz, [url], bitrate, false);

				// Update tracked item status to 'downloading'
				const collectionKey = `${item.type}s` as keyof typeof trackedItems;
				if (!trackedItems[collectionKey][item.id]) {
					trackedItems[collectionKey][item.id] = {
						id: item.id,
						type: item.type,
						title: item.title,
						artist: item.type === "playlist" ? undefined : item.artist,
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
				result.failed++;

				// Update tracked item with error
				const collectionKey = `${item.type}s` as keyof typeof trackedItems;
				if (!trackedItems[collectionKey][item.id]) {
					trackedItems[collectionKey][item.id] = {
						id: item.id,
						type: item.type,
						title: item.title,
						artist: item.type === "playlist" ? undefined : item.artist,
						status: "failed",
						addedAt: new Date().toISOString(),
						syncedAt: null,
						retryCount: 1,
						lastError: error instanceof Error ? error.message : String(error),
						lastAttemptAt: new Date().toISOString(),
					};
				} else {
					trackedItems[collectionKey][item.id].status = "failed";
					trackedItems[collectionKey][item.id].retryCount++;
					trackedItems[collectionKey][item.id].lastError =
						error instanceof Error ? error.message : String(error);
					trackedItems[collectionKey][item.id].lastAttemptAt =
						new Date().toISOString();
				}
			}
		}

		// Save updated tracked items
		await this.stateManager.saveTrackedItems(userId, trackedItems);

		return result;
	}
}
