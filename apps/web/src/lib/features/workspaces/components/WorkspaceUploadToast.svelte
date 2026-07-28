<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../utils/artifact-upload-limits';
	import {
		MAX_WORKSPACE_UPLOAD_FILES,
		type WorkspaceUploadProgressEvent,
		type WorkspaceUploadResult
	} from '$lib/features/workspaces/utils/workspace-file-upload';
	import {
		isRetryableUploadItem,
		type UploadQueueItem
	} from '$lib/features/workspaces/components/workspace-upload-toast-model';
	import WorkspaceUploadToastView from './WorkspaceUploadToastView.svelte';

	/**
	 * Upload-queue controller. Renders nothing itself; it owns the queue state, drives a persistent sonner
	 * toast (`WorkspaceUploadToastView`), and exposes `enqueue(files, folderId)` via `bind:this`.
	 * `isUploadActive` is bindable and tracks whether the queue is actively uploading.
	 */
	type UploadFiles = (
		files: File[],
		folderId: 'root' | string,
		options?: {
			onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
		}
	) => Promise<WorkspaceUploadResult[]>;

	let {
		onUploadFiles,
		isUploadActive = $bindable(false)
	}: {
		onUploadFiles: UploadFiles;
		isUploadActive?: boolean;
	} = $props();

	const toastId = 'workspace-upload-queue';
	const completeDismissDelayMs = 5000;

	let items = $state<UploadQueueItem[]>([]);
	let isCollapsed = $state(false);

	// Synchronous guard: `$state` lands a tick late, so a plain flag keeps
	// `enqueue`/`retryFailedUploads` from double-firing, plus the delayed dismiss timer.
	let activeRef = false;
	let dismissTimer: ReturnType<typeof setTimeout> | null = null;

	const hasItems = $derived(items.length > 0);
	const hasFailed = $derived(items.some((item) => item.status === 'failed'));
	const allComplete = $derived(hasItems && items.every((item) => item.status === 'complete'));

	function clearDismissTimer() {
		if (dismissTimer) {
			clearTimeout(dismissTimer);
			dismissTimer = null;
		}
	}

	function updateItem(id: string, patch: Partial<UploadQueueItem>) {
		items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
	}

	async function runUpload(queueItems: UploadQueueItem[]) {
		if (queueItems.length === 0) return;

		activeRef = true;
		isUploadActive = true;
		clearDismissTimer();

		const ids = queueItems.map((item) => item.id);
		await onUploadFiles(
			queueItems.map((item) => item.file),
			queueItems[0]?.folderId ?? 'root',
			{
				onFileChange: (event) => {
					const id = ids[event.index];
					if (!id) return;
					updateItem(id, {
						status: event.status,
						progress: event.progress,
						error: event.error
					});
				}
			}
		);

		activeRef = false;
		isUploadActive = false;
	}

	export function enqueue(files: File[], folderId: 'root' | string) {
		if (files.length === 0) return;
		if (activeRef) {
			toast.error('Tunggu upload berjalan selesai sebelum menambahkan file lagi.');
			return;
		}
		if (files.length > MAX_WORKSPACE_UPLOAD_FILES) {
			toast.error(`Maksimal ${MAX_WORKSPACE_UPLOAD_FILES} file dalam satu upload.`);
			return;
		}

		const queueItems = files.map((file): UploadQueueItem => {
			const isOversized = file.size > MAX_UPLOAD_BYTES;
			return {
				id: createUploadItemId(),
				file,
				folderId,
				status: isOversized ? 'failed' : 'queued',
				progress: 0,
				error: isOversized ? `${file.name} melebihi batas ${MAX_UPLOAD_MB} MB.` : undefined
			};
		});
		items = queueItems;
		isCollapsed = false;

		const uploadable = queueItems.filter((item) => item.status !== 'failed');
		void runUpload(uploadable);
	}

	function dismissToast() {
		clearDismissTimer();
		items = [];
		isCollapsed = false;
		isUploadActive = false;
		activeRef = false;
		toast.dismiss(toastId);
	}

	function retryFailedUploads() {
		if (activeRef) return;
		const failed = items.filter(isRetryableUploadItem);
		if (failed.length === 0) return;

		items = items.map((item) =>
			isRetryableUploadItem(item)
				? { ...item, status: 'queued', progress: 0, error: undefined }
				: item
		);
		const queueItems = failed.map((item) => ({
			...item,
			status: 'queued' as const,
			progress: 0,
			error: undefined
		}));
		const ids = queueItems.map((item) => item.id);
		activeRef = true;
		isUploadActive = true;
		clearDismissTimer();
		void onUploadFiles(
			queueItems.map((item) => item.file),
			queueItems[0]?.folderId ?? 'root',
			{
				onFileChange: (event) => {
					const id = ids[event.index];
					if (!id) return;
					updateItem(id, {
						status: event.status,
						progress: event.progress,
						error: event.error
					});
				}
			}
		).finally(() => {
			activeRef = false;
			isUploadActive = false;
		});
	}

	function createUploadItemId() {
		if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
			return crypto.randomUUID();
		}
		return Math.random().toString(36).slice(2);
	}

	// Re-publish the sonner toast whenever queue/collapse/active state changes.
	// Re-calling `toast.custom` with the same id updates the live toast.
	$effect(() => {
		if (!hasItems) return;
		toast.custom(WorkspaceUploadToastView, {
			id: toastId,
			componentProps: {
				items,
				isUploadActive,
				isCollapsed,
				onDismiss: dismissToast,
				onToggleCollapsed: () => (isCollapsed = !isCollapsed),
				onRetryFailed: retryFailedUploads
			},
			class: '!w-auto !border-0 !bg-transparent !p-0 !shadow-none !ring-0',
			closeButton: false,
			duration: Number.POSITIVE_INFINITY,
			dismissible: false
		});
	});

	// Auto-dismiss the queue a few seconds after everything lands cleanly.
	$effect(() => {
		clearDismissTimer();
		if (!allComplete || hasFailed) return;
		dismissTimer = setTimeout(() => {
			items = [];
			isCollapsed = false;
			isUploadActive = false;
			activeRef = false;
			toast.dismiss(toastId);
		}, completeDismissDelayMs);
		return () => clearDismissTimer();
	});
</script>
