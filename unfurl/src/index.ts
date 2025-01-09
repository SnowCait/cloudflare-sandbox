import { unfurl } from "unfurl.js";

export default {
	async fetch(request): Promise<Response> {
		const url = new URL(request.url).searchParams.get('url');
		if (url === null) {
			return new Response(null, {status: 400})
		}
		const data = await unfurl(url)
		return new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json'
			}
		});
	},
} satisfies ExportedHandler<Env>;
