import { Deezer } from "deezer-sdk";
import { type ApiHandler } from "../../../types.js";
import { sessionDZ } from "../../../deemixApp.js";
import { logger } from "../../../helpers/logger.js";

const path: ApiHandler["path"] = "/addToQueueByIds";

const MAX_IDS_PER_REQUEST = 500;
const typeMap: Record<string, string> = {
	album: "album",
	albums: "album",
	playlist: "playlist",
	playlists: "playlist",
	artist: "artist",
	artists: "artist",
	track: "track",
	tracks: "track",
};

const handler: ApiHandler["handler"] = async (req, res) => {
	if (!sessionDZ[req.session.id]) sessionDZ[req.session.id] = new Deezer();
	const deemix = req.app.get("deemix");
	const dz = sessionDZ[req.session.id];
	const { type, ids, bitrate } = req.body || {};
	const normalizedType = typeMap[type];

	if (!normalizedType) {
		res.status(400).send({
			result: false,
			error: { code: "InvalidType", message: "Unsupported resource type." },
		});
		return;
	}

	if (!Array.isArray(ids) || ids.length === 0) {
		res.status(400).send({
			result: false,
			error: { code: "InvalidIds", message: "No resource ids provided." },
		});
		return;
	}

	if (ids.length > MAX_IDS_PER_REQUEST) {
		res.status(413).send({
			result: false,
			error: {
				code: "TooManyItems",
				message: `Too many items for one request. Max is ${MAX_IDS_PER_REQUEST}.`,
			},
		});
		return;
	}

	const invalidIds = ids.filter((id: unknown) => !/^\d+$/.test(String(id)));
	if (invalidIds.length > 0) {
		res.status(400).send({
			result: false,
			error: {
				code: "InvalidIds",
				message: "One or more ids were invalid.",
				invalidIds: invalidIds.slice(0, 10),
			},
		});
		return;
	}

	let resolvedBitrate = bitrate;
	if (resolvedBitrate === "null" || !resolvedBitrate)
		resolvedBitrate = deemix.getSettings().settings.maxBitrate;
	resolvedBitrate = Number(resolvedBitrate);

	const urls = ids.map(
		(id: string | number) => `https://www.deezer.com/${normalizedType}/${id}`
	);

	const results: any[] = [];
	const errors: any[] = [];

	// Process all URLs in a single addToQueue call for better performance
	// This reduces the number of API requests to Deezer significantly
	try {
		const obj = await deemix.addToQueue(dz, urls, resolvedBitrate);
		if (obj) results.push(...(Array.isArray(obj) ? obj : [obj]));
	} catch (e: any) {
		// NotLoggedIn / CantStream are fatal — stop processing
		if (e.name === "NotLoggedIn" || e.name === "CantStream") {
			res.send({
				result: false,
				errid: e.name,
				data: { type, ids, bitrate },
			});
			if (e.name === "NotLoggedIn") {
				deemix.listener.send("queueError" + e.name);
			} else {
				deemix.listener.send("queueError" + e.name, e.bitrate);
			}
			return;
		}
		// Non-fatal errors (e.g. invalid link) — log and continue
		logger.error(e);
		errors.push({ urls, error: e.message || e.name });
	}

	res.send({
		result: true,
		data: { type, count: results.length, errors: errors.length, obj: results },
	});
};
const apiHandler: ApiHandler = { path, handler };

export default apiHandler;
