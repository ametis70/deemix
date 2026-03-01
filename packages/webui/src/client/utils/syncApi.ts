import { fetchData, postToServer } from "./api-utils";

export interface SyncConfig {
	interval?: number;
	batchSize?: number;
	scope?: {
		tracks?: boolean;
		albums?: boolean;
		playlists?: boolean;
	};
	retry?: {
		maxAttempts?: number;
		baseDelay?: number;
	};
}

export const syncApi = {
	start: () => postToServer("syncStart"),
	stop: () => postToServer("syncStop"),
	configure: (config: SyncConfig) => postToServer("syncConfigure", config),
	getStatus: () => fetchData("syncStatus"),
	getEvents: (limit?: number) =>
		fetchData("syncEvents", limit ? { limit: limit.toString() } : {}),
	redownload: (itemId: string, itemType: string) =>
		postToServer("syncRedownload", { itemId, itemType }),
};
