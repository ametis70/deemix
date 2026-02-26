import { toast } from "@/utils/toasts";

const QUEUE_REQUEST_FAILED = "Failed to add items to the queue.";
const MAX_IDS_PER_REQUEST = 500;

async function postQueueRequest(endpoint: string, data?: Record<string, any>) {
	const url = new URL(
		`${window.location.origin}${location.base}api/${endpoint}`
	);

	const response = await fetch(url, {
		body: JSON.stringify(data),
		headers: {
			"Content-Type": "application/json",
		},
		method: "POST",
	});

	let responseJson: any = null;
	try {
		responseJson = await response.json();
	} catch {
		responseJson = null;
	}

	if (!response.ok) {
		const message = responseJson?.error?.message || QUEUE_REQUEST_FAILED;
		throw new Error(message.toString());
	}

	return responseJson;
}

export async function sendAddToQueue(url: string, bitrate?: number) {
	if (!url) throw new Error("No URL given to sendAddToQueue function!");

	try {
		await postQueueRequest("addToQueue", { url, bitrate });
	} catch (error: any) {
		toast(error?.message || QUEUE_REQUEST_FAILED, "error");
	}
}

export async function sendAddToQueueByIds(
	ids: Array<number | string>,
	type: string,
	bitrate?: number
) {
	if (!ids || ids.length === 0) throw new Error("No ids provided.");

	const batches: Array<Array<number | string>> = [];
	for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
		batches.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
	}

	for (const batch of batches) {
		try {
			const responseJson = await postQueueRequest("addToQueueByIds", {
				ids: batch,
				type,
				bitrate,
			});

			if (responseJson?.result === false) {
				return;
			}
		} catch (error: any) {
			toast(error?.message || QUEUE_REQUEST_FAILED, "error");
			return;
		}
	}
}

export function aggregateDownloadLinks(releases: { link: string }[]): string {
	const links = releases.map((release) => release.link);

	return links.join(";");
}
