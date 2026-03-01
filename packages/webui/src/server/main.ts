import { DeemixApp } from "@/deemixApp.js";
import { logger, removeOldLogs } from "@/helpers/logger.js";
import { loadLoginCredentials } from "@/helpers/loginStorage.js";
import cookieParser from "cookie-parser";
import { utils, type Listener, SyncStateManager } from "deemix";
import express, { type Express } from "express";
import session from "express-session";
import memorystore from "memorystore";
import morgan from "morgan";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import ViteExpress from "vite-express";
import { WebSocket, WebSocketServer } from "ws";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { normalizePort } from "./helpers/port.js";
import { getErrorCb, getListeningCb } from "./helpers/server-callbacks.js";
import { registerApis } from "./routes/api/register.js";
import indexRouter from "./routes/index.js";
import type { Arguments } from "./types.js";
import { registerWebsocket } from "./websocket/index.js";
import { SyncService } from "./sync/SyncService.js";

const MemoryStore = memorystore(session);

// TODO: Remove type assertion while keeping correct types
const argv = yargs(hideBin(process.argv)).options({
	port: { type: "string", default: "6595" },
	host: { type: "string", default: "0.0.0.0" },
	locationbase: { type: "string", default: "/" },
	singleuser: { type: "boolean", default: false },
}).argv as Arguments;

const serverPort = process.env.DEEMIX_SERVER_PORT ?? argv.port;
const deemixHost = process.env.DEEMIX_HOST ?? argv.host;
const isSingleUser =
	process.env.DEEMIX_SINGLE_USER === undefined
		? !!argv.singleuser
		: process.env.DEEMIX_SINGLE_USER === "true";

const app: Express = express();

if (isSingleUser) loadLoginCredentials();

app.set("isSingleUser", isSingleUser);

/* === Deemix App === */
const listener: Listener = {
	send: (key: string, data?: any) => {
		const logLine = utils.formatListener(key, data);
		if (logLine) logger.info(logLine);
		if (["downloadInfo", "downloadWarn"].includes(key)) return;
		wss.clients.forEach((client) => {
			if (client.readyState === WebSocket.OPEN) {
				client.send(JSON.stringify({ key, data }));
			}
		});
	},
};
const deemixApp = new DeemixApp(listener);

/* === Sync Service === */
const configFolder = utils.getConfigFolder();
const stateManager = new SyncStateManager(configFolder);
const syncService = new SyncService(deemixApp, stateManager, configFolder);

/* === Middlewares === */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(cookieParser());
app.use(
	// @ts-expect-error
	session({
		store: new MemoryStore({
			checkPeriod: 86400000, // prune expired entries every 24h
		}),
		secret: "U2hoLCBpdHMgYSBzZWNyZXQh",
		resave: true,
		saveUninitialized: true,
	})
);

if (process.env.NODE_ENV === "development") {
	app.use(morgan("dev"));
}

/* === Routes === */
app.use("/", indexRouter);

/* === APIs === */
registerApis(app);

/* === Config === */
app.set("port", serverPort);
app.set("deemix", deemixApp);
app.set("syncService", syncService);

/* === Server port === */
const server = app.listen({
	port: normalizePort(serverPort),
	host: deemixHost,
});
const wss = new WebSocketServer({ server });

if (process.env.NODE_ENV === "production") {
	const publicPath = join(dirname(fileURLToPath(import.meta.url)), "public");
	app.use(express.static(publicPath));
	app.get("*", (_, res) => {
		res.sendFile(join(publicPath, "index.html"));
	});
} else {
	ViteExpress.bind(app, server);
}

/* === Server callbacks === */
server.on("error", getErrorCb(serverPort));
server.on("listening", getListeningCb(server));
registerWebsocket(wss, deemixApp);

/* === Sync Service Initialization === */
syncService.initializeAllUsers().catch((error) => {
	logger.error(
		`Failed to initialize sync service: ${error instanceof Error ? error.message : String(error)}`
	);
});

/* === Remove Old logs files === */
removeOldLogs(5);

/* === Shutdown handlers === */
const gracefulShutdown = async (signal: string) => {
	logger.info(`${signal} received, shutting down gracefully...`);
	try {
		await syncService.shutdown();
		logger.info("Sync service shut down successfully");
	} catch (error) {
		logger.error(
			`Error during sync service shutdown: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	server.close(() => {
		logger.info("HTTP server closed");
		process.exit(0);
	});
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

export { app, deemixApp, server };
