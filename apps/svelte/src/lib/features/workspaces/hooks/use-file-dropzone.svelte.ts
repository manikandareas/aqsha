/**
 * Shared file-drag dropzone behaviour — port of
 * `apps/web/features/workspaces/hooks/use-file-dropzone.ts`. Highlights on drag, clears on
 * leave/drop, and hands dropped files off, so the "only react to Files, copy effect,
 * contains-based dragLeave" policy lives in one place.
 *
 * Usage:
 *   const dropzone = useFileDropzone((files) => enqueue([...files]));
 *   <div class:ring={dropzone.isDragOver} {...dropzone.dropzoneProps}>…</div>
 */
export function useFileDropzone(onFiles: (files: FileList) => void) {
	let isDragOver = $state(false);

	const show = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
		isDragOver = true;
	};

	return {
		get isDragOver() {
			return isDragOver;
		},
		dropzoneProps: {
			ondragenter: show,
			ondragover: show,
			ondragleave: (event: DragEvent) => {
				const currentTarget = event.currentTarget as Node | null;
				if (!currentTarget?.contains(event.relatedTarget as Node | null)) {
					isDragOver = false;
				}
			},
			ondrop: (event: DragEvent) => {
				if (!event.dataTransfer?.types.includes('Files')) return;
				event.preventDefault();
				isDragOver = false;
				onFiles(event.dataTransfer.files);
			}
		}
	};
}
