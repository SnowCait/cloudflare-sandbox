import { Env } from './env';
import { WebSocketServer } from './WebSocketServer';

export { type Env, WebSocketServer };

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		console.debug('[request headers]', JSON.stringify(request.headers, null, 2));
		if (request.headers.get('Accept') === 'application/nostr+json') {
			const nip11 = {
				name: 'Nostr Relay Sandbox',
			};
			return new Response(JSON.stringify(nip11), {
				headers: {
					'Access-Control-Allow-Origin': '*',
				},
			});
		}

		const upgradeHeader = request.headers.get('Upgrade');
		if (!upgradeHeader || upgradeHeader !== 'websocket') {
			return new Response('Expected Upgrade: websocket', { status: 426 });
		}

		const id = env.WEBSOCKET_SERVER.idFromName('foo');
		const stub = env.WEBSOCKET_SERVER.get(id);
		return stub.fetch(request);
	},
};
