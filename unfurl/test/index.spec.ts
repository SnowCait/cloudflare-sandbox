import { describe, it, expect } from 'vitest';
import worker from '../src/index';

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('unfurl', () => {
	it('responds with JSON', async () => {
		const request = new IncomingRequest('https://example.com/?url=https://example.com/');
		const response = await worker.fetch(request);
		expect(await response.json()).toMatchObject({
			title: 'Example Domain',
			favicon: "https://example.com/favicon.ico"
		});
	});
});
