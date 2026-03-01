import changeAccount from "./changeAccount.js";
import addToQueueByIds from "./addToQueueByIds.js";
import loginArl from "./loginArl.js";
import addToQueue from "./addToQueue.js";
import loginEmail from "./loginEmail.js";
import cancelAllDownloads from "./cancelAllDownloads.js";
import removeFinishedDownloads from "./removeFinishedDownloads.js";
import removeFromQueue from "./removeFromQueue.js";
import logout from "./logout.js";
import saveSettings from "./saveSettings.js";
import retryDownload from "./retryDownload.js";
import syncStart from "./syncStart.js";
import syncStop from "./syncStop.js";
import syncConfigure from "./syncConfigure.js";
import syncRedownload from "./syncRedownload.js";

export default [
	changeAccount,
	loginArl,
	addToQueue,
	addToQueueByIds,
	loginEmail,
	cancelAllDownloads,
	removeFinishedDownloads,
	removeFromQueue,
	logout,
	saveSettings,
	retryDownload,
	syncStart,
	syncStop,
	syncConfigure,
	syncRedownload,
];
