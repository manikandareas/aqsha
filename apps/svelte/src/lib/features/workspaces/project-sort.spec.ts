import { describe, expect, it } from 'vitest';
import { sortWorkspaces, type ProjectSortId } from './project-sort';
import type { Workspace } from './types';

function workspace(id: string, name: string, createdAt: number, updatedAt: number): Workspace {
	return {
		id,
		ownerUserId: 'user-1',
		name,
		emoji: null,
		description: null,
		kind: 'paper',
		kindInfo: null,
		documentArtifactId: null,
		deadline: null,
		topicNote: null,
		status: 'active',
		archivedAt: null,
		createdAt,
		updatedAt
	};
}

const projects = [
	workspace('b', 'Beta', 20, 40),
	workspace('a', 'Alpha', 30, 10),
	workspace('c', 'Cakrawala', 10, 30)
];

describe('sortWorkspaces', () => {
	it.each<[ProjectSortId, string[]]>([
		['updated-desc', ['b', 'c', 'a']],
		['updated-asc', ['a', 'c', 'b']],
		['created-desc', ['a', 'b', 'c']],
		['name-asc', ['a', 'b', 'c']]
	])('sorts by %s without mutating the source', (sort, expectedIds) => {
		const sourceIds = projects.map((project) => project.id);
		const result = sortWorkspaces(projects, sort);

		expect(result.map((project) => project.id)).toEqual(expectedIds);
		expect(result).not.toBe(projects);
		expect(projects.map((project) => project.id)).toEqual(sourceIds);
	});
});
