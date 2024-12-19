import { DurableObject } from "cloudflare:workers";
import { Event, Filter, matchFilter, verifyEvent } from 'nostr-tools';
import { Env } from "./env";
import { deleteEvent } from "./Delete";
import { RelaySubscriptions } from "./Relay";

export class WebSocketServer extends DurableObject {
	#subscriptions = new Map<WebSocket, RelaySubscriptions>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		for (const ws of this.ctx.getWebSockets()) {
			const subscriptions = ws.deserializeAttachment();
			console.debug('[restore]', ws, subscriptions)
			this.#subscriptions.set(ws, new Map(subscriptions))
		}
	}

	async fetch(request: Request): Promise<Response> {
		const webSocketPair = new WebSocketPair();
		const {0:client, 1:server} = webSocketPair;
		this.ctx.acceptWebSocket(server);

		this.#subscriptions.set(server, new Map())

		return new Response(null, {
			status: 101,
			webSocket: client
		})
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		const server = ws;
		const env = this.env as Env;
		console.log(message);
		try {
			const [type, arg1, ...filters]: [string, string | Event, ...Filter[]] = JSON.parse(message as string);
			switch (type) {
				case 'EVENT': {
					if (typeof arg1 !== 'object') {
						throw new Error('Invalid EVENT');
					}
					const event = arg1;
					if (!verifyEvent(event)) {
						server.send(JSON.stringify(['NOTICE', 'Invalid event']));
						break;
					}
					const {success, meta, error}= await env.DB.prepare('INSERT OR IGNORE INTO event (id, pubkey, created_at, kind, tags, content, sig) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
						.bind(event.id, event.pubkey, event.created_at, event.kind, JSON.stringify(event.tags), event.content, event.sig)
						.run();
					console.log('[insert]', {success, meta, error})
					if (event.kind === 5) {
						await deleteEvent(event, env);
					}
					// server.send(JSON.stringify(['OK', event.id, true, meta.changed_db ? '': 'duplicate: already have this event']));
					server.send(JSON.stringify(['OK', event.id, true, '']));

					// Broadcast
					console.debug('[broadcast]', this.#subscriptions.size)
					for (const [_server, subscriptions] of this.#subscriptions) {
						for (const [id, filter] of subscriptions) {
							if (matchFilter(filter, event)) {
								_server.send(JSON.stringify(['EVENT', id, event]))
							}
						}
					}
					break;
				}
				case 'REQ': {
					console.log('[filters]', filters);

					if (filters.length === 0) {
						throw new Error('Invalid REQ');
					}

					const subscriptionId = arg1 as string;

					const maxLimit = 5;
					const limit = Math.min(filters[0].limit ?? maxLimit, maxLimit);

					const filter = filters[0];

					const subscriptions = this.#subscriptions.get(ws)
					if (subscriptions === undefined) {
						server.send(JSON.stringify(['NOTICE', 'internal server error']));
						return;
					} else {
						subscriptions.set(subscriptionId, filter);
						this.#subscriptions.set(ws, subscriptions);
						server.serializeAttachment(subscriptions)
					}

					const wheres = [];
					const values: (string | number)[] = [];

					if (filter.ids !== undefined && filter.ids.length > 0) {
						wheres.push(`id IN (${Array.from({length: filter.ids.length}, () => '?').join(',')})`)
						values.push(...filter.ids)
					}

					if (filter.authors !== undefined && filter.authors.length > 0) {
						wheres.push(`authors IN (${Array.from({length: filter.authors.length}, () => '?').join(',')})`)
						values.push(...filter.authors)
					}

					if (filter.kinds !== undefined && filter.kinds.length > 0) {
						wheres.push(`kind IN (${Array.from({length: filter.kinds.length}, () => '?').join(',')})`)
						values.push(...filter.kinds)
					}

					if (filter.until !== undefined) {
						wheres.push('created_at <= ?');
						values.push(filter.until);
					}

					if (filter.since !== undefined) {
						wheres.push('created_at >= ?');
						values.push(filter.since);
					}

					if (filter.search !== undefined) {
						wheres.push('content LIKE ?');
						values.push(`%${filter.search.replaceAll('%', '\%')}%`);
					}

					values.push(limit);

					const {success, meta, results} = await env.DB
						.prepare(`SELECT * FROM event ${wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : ''} ORDER BY created_at DESC, id ASC LIMIT ?`)
						.bind(...values)
						.all();
					console.log('[select]', success, results.length, meta)

					for (const event of results) {
						event.tags = JSON.parse(event.tags as string);
						server.send(JSON.stringify(['EVENT', subscriptionId, event]));
					}

					server.send(JSON.stringify(['EOSE', subscriptionId]));
					break;
				}
				case 'CLOSE': {
					break;
				}
			}
		} catch (error) {
			console.error(error);
			server.send(JSON.stringify(['NOTICE', '']));
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
		console.debug('[close]', ws, code, reason)
		ws.close(code, reason);
	}
}
