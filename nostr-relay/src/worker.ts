import { Event, Filter } from 'nostr-tools';
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
const eventsStore: Event[] = [];

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Expected Upgrade: websocket', { status: 426 });
		}

		const webSocketPair = new WebSocketPair();
		const { 0: client, 1: server } = webSocketPair;

		server.accept();
		server.addEventListener('message', async (e) => {
			console.log(e.data);
			try {
				const [type, arg1, ...filters]: [string, string | Event, ...Filter[]] = JSON.parse(e.data as string);
				switch (type) {
					case 'EVENT': {
						if (typeof arg1 !== 'object') {
							throw new Error('Invalid EVENT');
						}
						eventsStore.unshift(arg1);
						server.send(JSON.stringify(['OK', arg1.id, true, '']));
						break;
					}
					case 'REQ': {
						console.log('[filters]', filters);

						if (filters.length === 0) {
							throw new Error('Invalid REQ');
						}

						const maxLimit = 5;
						const limit = Math.min(filters[0].limit ?? maxLimit, maxLimit);

						const events = eventsStore.slice(0, limit);
						console.log('[events]', events.length, eventsStore.length);

						for (const event of events) {
							server.send(JSON.stringify(['EVENT', event]));
						}

						server.send(JSON.stringify(['EOSE', arg1]));
						break;
					}
				}
			} catch (error) {
				console.error(error);
				server.send(JSON.stringify(['NOTICE', '']));
			}
		});

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	},
};
