import { describe, expect, it } from 'vitest';
import { locateNormalizedText } from './annotation-reanchor';

describe('locateNormalizedText', () => {
	it('menemukan teks yang terpecah ke beberapa node', () => {
		expect(locateNormalizedText(['Metode pen', 'elitian ini'], 'metode penelitian')).toEqual({
			startNode: 0,
			endNode: 1
		});
	});

	it('mengabaikan perbedaan spasi dan huruf besar', () => {
		expect(locateNormalizedText(['  METODE   Penelitian '], 'metode penelitian')).toEqual({
			startNode: 0,
			endNode: 0
		});
	});

	it('mengembalikan null saat teks tak ada', () => {
		expect(locateNormalizedText(['Pendahuluan'], 'metode')).toBeNull();
	});

	it('mengembalikan null untuk needle kosong', () => {
		expect(locateNormalizedText(['apa pun'], '   ')).toBeNull();
	});

	it('menunjuk kemunculan pertama saat teks berulang', () => {
		expect(locateNormalizedText(['bab', 'bab'], 'bab')).toEqual({ startNode: 0, endNode: 0 });
	});
});
