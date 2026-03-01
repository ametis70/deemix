import type { TrackedItem, BrokenAlbum } from "deemix";
import type { FavoriteAlbum } from "./FavoritesPoller.js";

export class BrokenAlbumDetector {
	async detectChanges(
		trackedAlbums: TrackedItem[],
		currentFavorites: FavoriteAlbum[]
	): Promise<BrokenAlbum[]> {
		const brokenAlbums: BrokenAlbum[] = [];

		// Create a map of current favorite IDs for O(1) lookup
		const currentIds = new Set(currentFavorites.map((a) => a.id));

		// Create a map for title/artist lookup
		const currentByTitleArtist = new Map<string, FavoriteAlbum>();
		for (const fav of currentFavorites) {
			const key = `${fav.title.toLowerCase()}|${fav.artist.toLowerCase()}`;
			currentByTitleArtist.set(key, fav);
		}

		// For each tracked album
		for (const tracked of trackedAlbums) {
			// Skip if not an album
			if (tracked.type !== "album") {
				continue;
			}

			// If tracked.id is NOT in current favorites
			if (!currentIds.has(tracked.id)) {
				// Try to find album by title/artist match (case-insensitive)
				const key = `${tracked.title.toLowerCase()}|${(tracked.artist || "").toLowerCase()}`;
				const possibleMatch = currentByTitleArtist.get(key);

				// If found with different ID, it's a broken album
				if (possibleMatch && possibleMatch.id !== tracked.id) {
					brokenAlbums.push({
						originalId: tracked.id,
						detectedId: possibleMatch.id,
						title: tracked.title,
						detectedAt: new Date().toISOString(),
						status: "unresolved",
					});
				}
			}
		}

		return brokenAlbums;
	}
}
