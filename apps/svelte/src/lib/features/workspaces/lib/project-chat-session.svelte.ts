type ThreadIdFactory = () => string;

/**
 * Lifecycle sesi chat panel. Satu model menggantikan kombinasi
 * active/draft/restore + string codec di provider.
 */
export type ProjectChatPhase =
	| { kind: 'draft'; threadId: string }
	| { kind: 'restoring'; threadId: string }
	| { kind: 'restore_failed'; threadId: string }
	| { kind: 'accepted'; threadId: string }
	| { kind: 'ready'; threadId: string };

/** State sesi panel yang sengaja hidup di atas view responsive yang dapat di-remount. */
export class ProjectChatSession {
	readonly #createThreadId: ThreadIdFactory;
	#phase = $state.raw<ProjectChatPhase>({ kind: 'draft', threadId: '' });
	#runtimeRevision = $state(0);

	constructor(initialThreadId: string | null, createThreadId: ThreadIdFactory) {
		this.#createThreadId = createThreadId;
		this.#phase = initialThreadId
			? { kind: 'restoring', threadId: initialThreadId }
			: { kind: 'draft', threadId: createThreadId() };
	}

	get phase(): ProjectChatPhase {
		return this.#phase;
	}

	get threadId(): string {
		return this.#phase.threadId;
	}

	/** Null hanya saat draft murni — dipakai chrome (open-full, switcher title). */
	get activeThreadId(): string | null {
		return this.#phase.kind === 'draft' ? null : this.#phase.threadId;
	}

	/** Thread yang history-nya perlu di-fetch (restoring / retry setelah gagal). */
	get restoreThreadId(): string | null {
		const { kind, threadId } = this.#phase;
		return kind === 'restoring' || kind === 'restore_failed' ? threadId : null;
	}

	/** Berubah hanya saat runtime agent harus diganti, bukan saat draft dipromosikan. */
	get runtimeRevision(): number {
		return this.#runtimeRevision;
	}

	/** Sources/stats/artifacts aman di-fetch — hanya setelah phase `ready`. */
	get threadPersisted(): boolean {
		return this.#phase.kind === 'ready';
	}

	get canRunAgent(): boolean {
		const { kind } = this.#phase;
		return kind === 'draft' || kind === 'accepted' || kind === 'ready';
	}

	/** Identity agent: revision + threadId — promote draft→accepted tidak mengganti agent. */
	get agentIdentityKey(): string {
		return `${this.#runtimeRevision}:${this.#phase.threadId}`;
	}

	/** Setelah Mastra ack — draft → accepted (URL). Tidak menyalakan query sekunder. */
	promote(threadId: string): boolean {
		if (this.#phase.threadId !== threadId || this.#phase.kind !== 'draft') return false;
		this.#phase = { kind: 'accepted', threadId };
		return true;
	}

	/**
	 * Setelah turn settle — hanya accepted → ready.
	 * Failed draft (settle tanpa accept) tetap draft.
	 */
	markReady(): boolean {
		if (this.#phase.kind !== 'accepted') return false;
		this.#phase = { kind: 'ready', threadId: this.#phase.threadId };
		return true;
	}

	markRestored(): boolean {
		if (this.#phase.kind !== 'restoring') return false;
		this.#phase = { kind: 'ready', threadId: this.#phase.threadId };
		return true;
	}

	markRestoreFailed(): boolean {
		if (this.#phase.kind !== 'restoring') return false;
		this.#phase = { kind: 'restore_failed', threadId: this.#phase.threadId };
		return true;
	}

	retryRestore(): boolean {
		if (this.#phase.kind !== 'restore_failed') return false;
		this.#phase = { kind: 'restoring', threadId: this.#phase.threadId };
		return true;
	}

	select(threadId: string): boolean {
		if (threadId === this.#phase.threadId && this.#phase.kind !== 'draft') return false;
		this.#phase = { kind: 'restoring', threadId };
		this.#runtimeRevision += 1;
		return true;
	}

	startNew(): void {
		this.#phase = { kind: 'draft', threadId: this.#createThreadId() };
		this.#runtimeRevision += 1;
	}
}
