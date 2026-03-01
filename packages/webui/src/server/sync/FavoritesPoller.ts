import type { Deezer } from "deezer-sdk";
import type { SyncScope } from "deemix";

export interface FavoriteTrack {
	id: string;
	type: "track";
	title: string;
	artist: string;
}

export interface FavoriteAlbum {
	id: string;
	type: "album";
	title: string;
	artist: string;
}

export interface FavoritePlaylist {
	id: string;
	type: "playlist";
	title: string;
}

export interface FavoriteArtist {
	id: string;
	type: "artist";
	title: string;
}

export type FavoriteItem =
	| FavoriteTrack
	| FavoriteAlbum
	| FavoritePlaylist
	| FavoriteArtist;

export interface FavoriteItems {
	tracks: FavoriteTrack[];
	albums: FavoriteAlbum[];
	playlists: FavoritePlaylist[];
	artists: FavoriteArtist[];
}

export class FavoritesPoller {
	constructor(
		private dz: Deezer,
		private scope: SyncScope
	) {}

	async fetchAllFavorites(): Promise<FavoriteItems> {
		if (!this.dz.loggedIn || !this.dz.currentUser) {
			throw new Error("Not logged in to Deezer");
		}

		const result: FavoriteItems = {
			tracks: [],
			albums: [],
			playlists: [],
			artists: [],
		};

		const userId = this.dz.currentUser.id;

		const promises: Promise<void>[] = [];

		if (this.scope.tracks) {
			promises.push(
				this.fetchFavoriteTracks().then((tracks) => {
					result.tracks = tracks;
				})
			);
		}

		if (this.scope.albums) {
			promises.push(
				this.fetchFavoriteAlbums(String(userId)).then((albums) => {
					result.albums = albums;
				})
			);
		}

		if (this.scope.playlists) {
			promises.push(
				this.fetchFavoritePlaylists(String(userId)).then((playlists) => {
					result.playlists = playlists;
				})
			);
		}

		if (this.scope.artists) {
			promises.push(
				this.fetchFavoriteArtists(String(userId)).then((artists) => {
					result.artists = artists;
				})
			);
		}

		await Promise.all(promises);

		return result;
	}

	private async fetchFavoriteTracks(): Promise<FavoriteTrack[]> {
		const tracks: FavoriteTrack[] = [];
		let start = 0;
		const batchSize = 1000;

		while (true) {
			const batch = await this.dz.gw.get_my_favorite_tracks({
				limit: batchSize,
				start,
			});

			if (!batch || batch.length === 0) {
				break;
			}

			for (const track of batch) {
				if (track && track.SNG_ID) {
					tracks.push({
						id: String(track.SNG_ID),
						type: "track",
						title: track.SNG_TITLE || "Unknown",
						artist: track.ART_NAME || "Unknown",
					});
				}
			}

			if (batch.length < batchSize) {
				break;
			}

			start += batchSize;
		}

		const seen = new Set<string>();
		return tracks.filter((track) => {
			if (seen.has(track.id)) {
				return false;
			}
			seen.add(track.id);
			return true;
		});
	}

	private async fetchFavoriteAlbums(userId: string): Promise<FavoriteAlbum[]> {
		const albums = await this.dz.gw.get_user_albums(userId, { limit: -1 });

		const result: FavoriteAlbum[] = [];

		for (const album of albums) {
			if (album && album.ALB_ID) {
				result.push({
					id: String(album.ALB_ID),
					type: "album",
					title: album.ALB_TITLE || "Unknown",
					artist: album.ART_NAME || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		return result.filter((album) => {
			if (seen.has(album.id)) {
				return false;
			}
			seen.add(album.id);
			return true;
		});
	}

	private async fetchFavoritePlaylists(
		userId: string
	): Promise<FavoritePlaylist[]> {
		const playlists = await this.dz.gw.get_user_playlists(userId, {
			limit: -1,
		});

		const result: FavoritePlaylist[] = [];

		for (const playlist of playlists) {
			if (playlist && playlist.PLAYLIST_ID) {
				result.push({
					id: String(playlist.PLAYLIST_ID),
					type: "playlist",
					title: playlist.TITLE || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		return result.filter((playlist) => {
			if (seen.has(playlist.id)) {
				return false;
			}
			seen.add(playlist.id);
			return true;
		});
	}

	private async fetchFavoriteArtists(
		userId: string
	): Promise<FavoriteArtist[]> {
		const artists = await this.dz.gw.get_user_artists(userId, { limit: -1 });

		const result: FavoriteArtist[] = [];

		for (const artist of artists) {
			if (artist && artist.id) {
				result.push({
					id: String(artist.id),
					type: "artist",
					title: artist.name || "Unknown",
				});
			}
		}

		const seen = new Set<string>();
		return result.filter((artist) => {
			if (seen.has(artist.id)) {
				return false;
			}
			seen.add(artist.id);
			return true;
		});
	}
}
