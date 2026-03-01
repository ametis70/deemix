export interface SyncScope {
	tracks: boolean;
	albums: boolean;
	playlists: boolean;
}

export interface SyncRetryPolicy {
	maxAttempts: number;
	baseDelay: number;
}

export interface SyncSettings {
	interval: number;
	batchSize: number;
	scope: SyncScope;
	retry: SyncRetryPolicy;
}

export interface SyncStatistics {
	totalSynced: number;
	totalFailed: number;
	lastRunDuration: number;
}

export interface UserSyncState {
	userId: string;
	enabled: boolean;
	lastSyncAt: string | null;
	lastSuccessfulSyncAt: string | null;
	status: "idle" | "running" | "error";
	currentRunStartedAt: string | null;
	settings: SyncSettings;
	statistics: SyncStatistics;
}

export interface TrackedItem {
	id: string;
	type: "track" | "album" | "playlist";
	title: string;
	artist?: string;
	status: "new" | "downloading" | "success" | "failed";
	addedAt: string;
	syncedAt: string | null;
	retryCount: number;
	lastError: string | null;
	lastAttemptAt: string | null;
}

export interface TrackedItems {
	tracks: Record<string, TrackedItem>;
	albums: Record<string, TrackedItem>;
	playlists: Record<string, TrackedItem>;
}

export interface SyncEvent {
	id: string;
	timestamp: string;
	type:
		| "sync_started"
		| "sync_completed"
		| "sync_failed"
		| "item_downloaded"
		| "item_failed"
		| "broken_album_detected";
	severity: "info" | "warning" | "error";
	message: string;
	details?: {
		itemId?: string;
		itemType?: string;
		error?: string;
	};
}

export interface BrokenAlbum {
	originalId: string;
	detectedId: string | null;
	title: string;
	detectedAt: string;
	status: "unresolved" | "resolved";
}
