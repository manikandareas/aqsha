import { afterEach, describe, expect, it } from 'vitest';
import { StickToBottom } from './conversation-state.svelte';

// Follow-bottom engine. Real Chromium (client project) so scrollHeight/scrollTop/clientHeight reflect
// true layout. Verifies: initial pin to bottom, un-follow on user scroll-up, re-pin on button.

const settle = () => new Promise((r) => setTimeout(r, 120));

function makeScroller(): HTMLElement {
	const scroller = document.createElement('div');
	scroller.style.height = '100px';
	scroller.style.overflowY = 'auto';
	const content = document.createElement('div');
	content.style.height = '600px';
	scroller.appendChild(content);
	document.body.appendChild(scroller);
	return scroller;
}

describe('StickToBottom', () => {
	const cleanups: Array<() => void> = [];
	afterEach(() => {
		while (cleanups.length) cleanups.pop()!();
		document.body.innerHTML = '';
	});

	it('pins to the bottom on attach (isAtBottom true)', async () => {
		const scroller = makeScroller();
		const stick = new StickToBottom();
		cleanups.push(stick.attachScroller(scroller));
		await settle();
		expect(scroller.scrollTop).toBeGreaterThan(0);
		expect(stick.isAtBottom).toBe(true);
	});

	it('un-follows when the user scrolls up, re-pins via scrollToBottom()', async () => {
		const scroller = makeScroller();
		const stick = new StickToBottom();
		cleanups.push(stick.attachScroller(scroller));
		await settle();

		// User scrolls up → not at bottom.
		scroller.scrollTop = 0;
		scroller.dispatchEvent(new Event('scroll'));
		await settle();
		expect(stick.isAtBottom).toBe(false);

		// Button press → re-pin.
		stick.scrollToBottom(false);
		await settle();
		expect(stick.isAtBottom).toBe(true);
	});
});
