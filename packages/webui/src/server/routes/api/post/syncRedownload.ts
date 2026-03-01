import { sessionDZ } from "@/deemixApp.js";
import type { SyncService } from "@/sync/SyncService.js";
import type { ApiHandler } from "@/types.js";
import type { RequestHandler } from "express";

const path: ApiHandler["path"] = "/syncRedownload";

const handler: RequestHandler = async (req, res) => {
	const dz = sessionDZ[req.session.id];
	if (!dz || !dz.currentUser) {
		return res.status(401).json({ error: "Not logged in" });
	}

	const userId = String(dz.currentUser.id);
	const syncService: SyncService = req.app.get("syncService");

	const { itemId, itemType } = req.body;

	if (!itemId || typeof itemId !== "string") {
		return res.status(400).json({ error: "Missing or invalid itemId" });
	}

	if (!itemType || !["track", "album", "playlist"].includes(itemType)) {
		return res
			.status(400)
			.json({ error: "Invalid itemType (must be track, album, or playlist)" });
	}

	try {
		await syncService.redownloadItem(
			userId,
			itemId,
			itemType as "track" | "album" | "playlist"
		);
		res.status(200).json({ success: true });
	} catch (error) {
		res
			.status(500)
			.json({ error: error instanceof Error ? error.message : String(error) });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
