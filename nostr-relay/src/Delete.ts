import { Event } from "nostr-tools";
import { Env } from "./env";

export async function deleteEvent(event: Event, env: Env): Promise<void> {
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
