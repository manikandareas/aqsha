import { gzipSync } from 'node:zlib';
import { readdir, readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const clientDir = new URL('.svelte-kit/output/client/', root);
const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', clientDir), 'utf8'));
const tolerance = 1.05;

const sourceForNode = (node) => `.svelte-kit/generated/client-optimized/nodes/${node}.js`;
const startSource = Object.keys(manifest).find((key) =>
	manifest[key].file.includes('/entry/start.')
);
const appSource = '.svelte-kit/generated/client-optimized/app.js';

if (!startSource || !manifest[appSource]) {
	throw new Error(
		'Manifest produksi SvelteKit belum tersedia. Jalankan bun run build terlebih dahulu.'
	);
}

const surfaces = [
	{ name: 'marketing', nodes: [0, 3, 12], jsKb: 150 },
	{ name: 'home', nodes: [0, 4, 6, 25], jsKb: 220 },
	{ name: 'library', nodes: [0, 4, 6, 28], jsKb: 250 },
	{ name: 'project', nodes: [0, 4, 6, 7, 29], jsKb: 375 },
	{ name: 'thread', nodes: [0, 4, 6, 7, 32], jsKb: 375 }
];

function collectGraph(entries) {
	const seen = new Set();
	const visit = (source) => {
		if (!source || seen.has(source)) return;
		seen.add(source);
		for (const imported of manifest[source]?.imports ?? []) visit(imported);
	};
	for (const entry of entries) visit(entry);
	return seen;
}

async function gzipBytes(files) {
	let total = 0;
	for (const file of files) {
		total += gzipSync(await readFile(new URL(file, clientDir))).byteLength;
	}
	return total;
}

const failures = [];
const report = [];
for (const surface of surfaces) {
	const graph = collectGraph([startSource, appSource, ...surface.nodes.map(sourceForNode)]);
	const jsFiles = [...graph].map((source) => manifest[source]?.file).filter(Boolean);
	const cssFiles = [...new Set([...graph].flatMap((source) => manifest[source]?.css ?? []))];
	const assetFiles = [...graph].flatMap((source) => manifest[source]?.assets ?? []);
	const jsKb = (await gzipBytes(jsFiles)) / 1024;
	const cssKb = (await gzipBytes(cssFiles)) / 1024;
	const typstInitial = [...jsFiles, ...assetFiles].filter((file) => /typst.*\.wasm$/i.test(file));

	report.push({
		surface: surface.name,
		jsGzipKb: Number(jsKb.toFixed(1)),
		jsBudgetKb: surface.jsKb,
		cssGzipKb: Number(cssKb.toFixed(1)),
		cssBudgetKb: 45,
		typstInitial
	});
	if (jsKb > surface.jsKb * tolerance) {
		failures.push(`${surface.name}: JS ${jsKb.toFixed(1)} KB > ${surface.jsKb} KB + 5%`);
	}
	if (cssKb > 45 * tolerance) {
		failures.push(`${surface.name}: CSS ${cssKb.toFixed(1)} KB > 45 KB + 5%`);
	}
	if (typstInitial.length > 0) {
		failures.push(`${surface.name}: Typst masuk initial graph (${typstInitial.join(', ')})`);
	}
}

const workerDir = new URL('_app/immutable/workers/', clientDir);
const typstWorkers = (await readdir(workerDir)).filter((file) =>
	/typst.*worker.*\.js$/i.test(file)
);
if (typstWorkers.length !== 1) {
	failures.push(`Typst worker: ditemukan ${typstWorkers.length}, diharapkan tepat 1`);
}

console.table(report);
console.log(`Typst worker: ${typstWorkers.join(', ') || 'tidak ditemukan'}`);
if (process.argv.includes('--report')) {
	await Bun.write(
		new URL('.svelte-kit/output/bundle-report.json', root),
		JSON.stringify({ report, typstWorkers }, null, 2)
	);
}
if (failures.length > 0) {
	throw new Error(`Bundle budget gagal:\n- ${failures.join('\n- ')}`);
}
