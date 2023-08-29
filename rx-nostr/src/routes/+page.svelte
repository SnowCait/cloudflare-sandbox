<script lang="ts">
    import {createRxNostr} from 'rx-nostr';
	import { onMount } from 'svelte';
    const rxNostr = createRxNostr();

    onMount(async () => {
        await rxNostr.switchRelays(['wss://yabu.me']);
    })

    async function switchRelay() {
        await rxNostr.switchRelays(['wss://relay-jp.nostr.wirednet.jp'])
    }
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://kit.svelte.dev">kit.svelte.dev</a> to read the documentation</p>

<button on:click={switchRelay}>Switch relay</button>
