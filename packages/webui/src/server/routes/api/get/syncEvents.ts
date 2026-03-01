import { sessionDZ } from "@/deemixApp.js";
import type { SyncService } from "@/sync/SyncService.js";
import type { ApiHandler } from "@/types.js";
import type { RequestHandler } from "express";

const path: ApiHandler["path"] = "/syncEvents";

const handler: RequestHandler = async (req, res) => {
	const dz = sessionDZ[req.session.id];
	if (!dz || !dz.currentUser) {
		return res.status(401).json({ error: "Not logged in" });
	}

	const userId = String(dz.currentUser.id);
	const syncService: SyncService = req.app.get("syncService");
	const limit = parseInt((req.query.limit as string) || "50", 10);

	if (isNaN(limit) || limit < 1 || limit > 1000) {
		return res.status(400).json({ error: "Invalid limit (must be 1-1000)" });
	}

	try {
		const stateManager = syncService["stateManager"];
		const events = await stateManager.getEvents(userId, limit);

		res.status(200).json({ events });
	} catch (error) {
		res
			.status(500)
			.json({ error: error instanceof Error ? error.message : String(error) });
	}
};

const apiHandler: ApiHandler = { path, handler };
export default apiHandler;
