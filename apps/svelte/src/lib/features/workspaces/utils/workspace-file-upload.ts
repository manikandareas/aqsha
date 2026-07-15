import {
	isAllowedWorkspaceUploadFile,
	UPLOAD_REJECTED_MESSAGE,
	WORKSPACE_UPLOAD_ACCEPT
} from './artifact-upload-policy';
import { readableApiErrorMessage } from '$lib/errors';

export { isAllowedWorkspaceUploadFile, UPLOAD_REJECTED_MESSAGE, WORKSPACE_UPLOAD_ACCEPT };

export const MAX_WORKSPACE_UPLOAD_FILES = 20;
export const WORKSPACE_UPLOAD_CONCURRENCY = 3;

export type WorkspaceUploadStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'failed';

export type WorkspaceUploadProgressEvent = {
	file: File;
	index: number;
	status: WorkspaceUploadStatus;
	progress: number;
	error?: string;
};

export type WorkspaceUploadResult =
	{ ok: true; file: File; index: number } | { ok: false; file: File; index: number; error: string };

export function validateWorkspaceUploadBatch(files: File[]) {
	if (files.length > MAX_WORKSPACE_UPLOAD_FILES) {
		throw new Error(`Maksimal ${MAX_WORKSPACE_UPLOAD_FILES} file dalam satu upload.`);
	}
}

export function getFailedWorkspaceUploadFiles(results: WorkspaceUploadResult[]) {
	return results
		.filter((result): result is Extract<WorkspaceUploadResult, { ok: false }> => !result.ok)
		.map((result) => result.file);
}

export async function runLimitedConcurrency<T>(
	items: T[],
	concurrency: number,
	worker: (item: T, index: number) => Promise<void>
) {
	if (items.length === 0) return;

	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, concurrency), items.length);
	const runNext = async (): Promise<void> => {
		const index = nextIndex;
		if (index >= items.length) return;
		nextIndex += 1;
		await worker(items[index] as T, index);
		return runNext();
	};

	await Promise.all(Array.from({ length: workerCount }, () => runNext()));
}

/**
 * Multi-file upload: validasi batch + gating tipe + konkurensi terbatas, lalu
 * delegasikan tiap file ke `uploadFile` (V2: presign → PUT → finalize via mutation
 * `uploadArtifact`). Progress biner (uploading → complete) karena `fetch` PUT tak
 * mengekspos progress byte.
 */
export async function uploadWorkspaceFiles({
	files,
	uploadFile,
	onFileChange
}: {
	files: File[];
	uploadFile: (args: { file: File }) => Promise<unknown>;
	onFileChange?: (event: WorkspaceUploadProgressEvent) => void;
}) {
	validateWorkspaceUploadBatch(files);

	const results: WorkspaceUploadResult[] = files.map((file, index) => ({
		ok: false,
		file,
		index,
		error: 'Upload belum dimulai.'
	}));

	await runLimitedConcurrency(files, WORKSPACE_UPLOAD_CONCURRENCY, async (file, index) => {
		if (!isAllowedWorkspaceUploadFile(file)) {
			onFileChange?.({
				file,
				index,
				status: 'failed',
				progress: 0,
				error: UPLOAD_REJECTED_MESSAGE
			});
			results[index] = { ok: false, file, index, error: UPLOAD_REJECTED_MESSAGE };
			return;
		}
		try {
			// Satu fase in-flight: presign + PUT + finalize (yang meng-ekstrak teks +
			// RAG inline) jalan sebagai satu await. `fetch` PUT tak mengekspos progress
			// byte, jadi labelnya "processing" (bukan "uploading 0%" yang menyesatkan).
			// ponytail: split uploading/indexing kalau byte-upload file besar perlu bar.
			onFileChange?.({ file, index, status: 'processing', progress: 0 });
			await uploadFile({ file });
			onFileChange?.({ file, index, status: 'complete', progress: 100 });
			results[index] = { ok: true, file, index };
		} catch (error) {
			const message = readableApiErrorMessage(error, 'Upload gagal.');
			onFileChange?.({ file, index, status: 'failed', progress: 0, error: message });
			results[index] = { ok: false, file, index, error: message };
		}
	});

	return results;
}
