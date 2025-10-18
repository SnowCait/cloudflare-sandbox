/**
 * Welcome to Cloudflare Workers!
 *
 * This is a template for a Scheduled Worker: a Worker that can run on a
 * configurable interval:
 * https://developers.cloudflare.com/workers/platform/triggers/cron-triggers/
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Run `curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"` to see your Worker in action
 * - Run `npm run deploy` to publish your Worker
 *
 * Bind resources to your Worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Octokit } from '@octokit/rest';

export default {
	async fetch(req) {
		const url = new URL(req.url);
		url.pathname = '/__scheduled';
		url.searchParams.append('cron', '* * * * *');
		return new Response(`To test the scheduled handler, ensure you have used the "--test-scheduled" then try running "curl ${url.href}".`);
	},

	// The scheduled handler is invoked at the interval set in our wrangler.jsonc's
	// [[triggers]] configuration.
	async scheduled(event, env, ctx): Promise<void> {
		const excludeRepositories: string[] = env.EXCLUDE_REPOSITORIES;
		const octokit = new Octokit();

		const limit = await octokit.rateLimit.get();
		console.log(limit.data);

		const search = await octokit.search.repos({ q: 'topic:nostr', sort: 'updated', order: 'desc' });
		console.log(search.data.total_count);

		for (const repository of search.data.items.filter((repo) => !excludeRepositories.includes(repo.full_name)).slice(0, 5)) {
			const commit = await octokit.repos.getCommit({
				owner: repository.owner?.login ?? '',
				repo: repository.name,
				ref: repository.default_branch,
			});
			console.log(`[${repository.full_name}]`, commit.data.commit.message, commit.data.html_url);
		}
	},
} satisfies ExportedHandler<Env>;
