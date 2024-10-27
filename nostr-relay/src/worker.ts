import { Event, Filter, verifyEvent } from 'nostr-tools';

export interface Env {
	DB: D1Database
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		if (request.headers.get('Accept') === 'application/nostr+json') {
			const nip11 = {
				name: 'Nostr Relay Sandbox',
			};
			return new Response(JSON.stringify(nip11), {
				headers: {
					'Access-Control-Allow-Origin': '*'
				}
			});
		}

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
						server.send(JSON.stringify(['OK', event.id, true, meta.changed_db ? '': 'duplicate: already have this event']));
						server.send(JSON.stringify(['OK', event.id, true, '']));
						break;
					}
					case 'REQ': {
						console.log('[filters]', filters);

						if (filters.length === 0) {
							throw new Error('Invalid REQ');
						}

						const subscriptionId = arg1;

						const maxLimit = 5;
						const limit = Math.min(filters[0].limit ?? maxLimit, maxLimit);

						const filter = filters[0];
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
						server.send(JSON.stringify(['CLOSED', subscriptionId, 'unsupported: subscribing future events'])); // Temporary
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
		});

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	},
};

async function deleteEvent(event: Event, env: Env): Promise<void> {
	const ids = event.tags.filter(([name, content]) => name === 'e' && typeof content === 'string').map(([, id]) => id);
	if (ids.length > 0) {
		const {success, meta, error}= await env.DB.prepare('DELETE FROM event WHERE pubkey = ?1 AND id IN (?2)')
			.bind(event.pubkey, ids.join(','))
			.run();
		console.log('[delete]', {success, meta, error})
	}

	const addresses = event.tags.filter(([name, content]) => name === 'a' && typeof content === 'string').map(([, address]) => address);
	if (addresses.length > 0) {
		// TODO
		// const {success, meta, error}= await env.DB.prepare('DELETE FROM event WHERE pubkey = ?1 AND id IN ?2')
		// 	.bind(event.pubkey, ids.join(','))
		// 	.run();
		// console.log('[delete]', {success, meta, error})
	}
}
