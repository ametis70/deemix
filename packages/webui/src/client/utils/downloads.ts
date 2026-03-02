import { toast } from "@/utils/toasts";

const QUEUE_REQUEST_FAILED = "Failed to add items to the queue.";
const MAX_IDS_PER_REQUEST = 500;

/**
 * Flag indicating a bulk queue operation is in progress.
 * When true, TheDownloadBar suppresses per-item "added to queue" toasts.
 */
export let isBulkAddActive = false;

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

	const totalCount = ids.length;
	const toastId = "bulk_queue_" + Date.now();

	// Show a single toast with the real total count upfront
	toast(`Processing ${totalCount} items...`, "loading", false, toastId);

	isBulkAddActive = true;

	try {
		const batches: Array<Array<number | string>> = [];
		for (let i = 0; i < ids.length; i += MAX_IDS_PER_REQUEST) {
			batches.push(ids.slice(i, i + MAX_IDS_PER_REQUEST));
		}

		let addedSoFar = 0;

		for (const batch of batches) {
			try {
				const responseJson = await postQueueRequest("addToQueueByIds", {
					ids: batch,
					type,
					bitrate,
				});

				if (responseJson?.result === false) {
					toast(
						`Failed after adding ${addedSoFar}/${totalCount} items to queue.`,
						"error",
						true,
						toastId
					);
					return;
				}

				addedSoFar += batch.length;

				if (addedSoFar < totalCount) {
					toast(
						`Added ${addedSoFar}/${totalCount} items to queue...`,
						"loading",
						false,
						toastId
					);
				}
			} catch (error: any) {
				toast(error?.message || QUEUE_REQUEST_FAILED, "error", true, toastId);
				return;
			}
		}

		toast(`Added ${totalCount} items to queue.`, "done", true, toastId);
	} finally {
		isBulkAddActive = false;
	}
}
export function aggregateDownloadLinks(releases: { link: string }[]): string {
	const links = releases.map((release) => release.link);

	return links.join(";");
}
