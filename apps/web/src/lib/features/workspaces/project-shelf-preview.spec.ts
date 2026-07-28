import { describe, expect, it } from 'vitest';
import { projectShelfPreview, typstSourceToShelfBlocks } from './project-shelf-preview';

/** Already-cleaned sneak-peek shape (what list returns after `previewFromTypstSource`). */
const cleaned = `#text(size: 18pt, weight: "bold")[Belajar Rust]

= Pendahuluan

Langkah-langkah Belajar Rust dari Nol dimulai dari instalasi toolchain.

== Instalasi & Setup Lingkungan

Pasang rustup, lalu verifikasi dengan cargo --version.
`;

describe('typstSourceToShelfBlocks', () => {
	it('keeps title, headings, and prose from cleaned source', () => {
		expect(typstSourceToShelfBlocks(cleaned)).toEqual([
			{ type: 'title', text: 'Belajar Rust' },
			{ type: 'heading', level: 1, text: 'Pendahuluan' },
			{
				type: 'paragraph',
				text: 'Langkah-langkah Belajar Rust dari Nol dimulai dari instalasi toolchain.'
			},
			{ type: 'heading', level: 2, text: 'Instalasi & Setup Lingkungan' },
			{ type: 'paragraph', text: 'Pasang rustup, lalu verifikasi dengan cargo --version.' }
		]);
	});

	it('caps blocks so the shelf card preview stays compact', () => {
		expect(typstSourceToShelfBlocks(cleaned, 8)).toHaveLength(5);
		expect(typstSourceToShelfBlocks(cleaned, 2)).toHaveLength(2);
	});

	it('skips leftover command lines', () => {
		expect(typstSourceToShelfBlocks('#align(center)[\n= Bab\n')).toEqual([
			{ type: 'heading', level: 1, text: 'Bab' }
		]);
	});
});

describe('projectShelfPreview', () => {
	it('returns soft-rendered document blocks', () => {
		const preview = projectShelfPreview({ documentPreview: cleaned });
		expect(preview?.blocks[0]).toEqual({ type: 'title', text: 'Belajar Rust' });
	});

	it('returns null when typst preview yields no readable blocks', () => {
		expect(projectShelfPreview({ documentPreview: '#align(center)[' })).toBeNull();
	});

	it('returns null when document preview is blank', () => {
		expect(projectShelfPreview({ documentPreview: null })).toBeNull();
	});
});
