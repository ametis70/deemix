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

	let obj: any;

	try {
		obj = await deemix.addToQueue(dz, urls, resolvedBitrate);
	} catch (e: any) {
		res.send({ result: false, errid: e.name, data: { type, ids, bitrate } });
		switch (e.name) {
			case "NotLoggedIn":
				deemix.listener.send("queueError" + e.name);
				break;
			case "CantStream":
				deemix.listener.send("queueError" + e.name, e.bitrate);
				break;
			default:
				logger.error(e);
				break;
		}
		return;
	}

	res.send({ result: true, data: { type, count: urls.length, obj } });
};

const apiHandler: ApiHandler = { path, handler };

export default apiHandler;
