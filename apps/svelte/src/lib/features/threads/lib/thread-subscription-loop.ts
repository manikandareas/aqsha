import type { ThreadSubscription } from './mastra-thread-client';

type SubscriptionLoopOptions = {
	getResourceId: () => string | null | undefined;
	connect: (resourceId: string) => Promise<ThreadSubscription>;
	onChunk: (chunk: unknown) => void;
	onConnected: () => void;
	onFailure: (attempt: number, error: unknown) => void;
};

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Owns the durable subscribe/reconnect lifecycle independently from reactive timeline state. */
export class ThreadSubscriptionLoop {
	readonly #options: SubscriptionLoopOptions;
	#subscription: ThreadSubscription | null = null;
	#cancelled = false;
	#started = false;
	#epoch = 0;

	constructor(options: SubscriptionLoopOptions) {
		this.#options = options;
	}

	start(): void {
		if (this.#started) return;
		this.#started = true;
		void this.#run();
	}

	destroy(): void {
		this.#cancelled = true;
		this.#epoch += 1;
		this.#subscription?.unsubscribe();
		this.#subscription = null;
	}

	cycle(): void {
		this.#epoch += 1;
		this.#subscription?.unsubscribe();
		this.#subscription = null;
	}

	abort(): Promise<boolean> | undefined {
		return this.#subscription?.abort();
	}

	async #run(): Promise<void> {
		let failures = 0;
		while (!this.#cancelled) {
			const resourceId = this.#options.getResourceId();
			if (!resourceId) {
				await delay(300);
				continue;
			}
			const epoch = this.#epoch;
			try {
				const subscription = await this.#options.connect(resourceId);
				if (this.#cancelled || epoch !== this.#epoch) {
					subscription.unsubscribe();
					continue;
				}
				this.#subscription = subscription;
				failures = 0;
				this.#options.onConnected();
				await subscription.processDataStream({
					onChunk: this.#options.onChunk,
					reconnect: { maxRetries: 20, delayMs: 1000 }
				});
				if (this.#cancelled) return;
				if (epoch !== this.#epoch) continue;
				await delay(1000);
			} catch (error) {
				if (this.#cancelled) return;
				this.#options.onFailure((failures += 1), error);
				await delay(1000);
			}
		}
	}
}
