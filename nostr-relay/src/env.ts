import { WebSocketServer } from "./WebSocketServer";

export interface Env {
	DB: D1Database;
	WEBSOCKET_SERVER: DurableObjectNamespace<WebSocketServer>;
}
