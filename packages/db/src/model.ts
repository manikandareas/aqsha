import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { table } from "./schema";
import { spreads } from "./utils";

const _insertUsers = createInsertSchema(table.users);
const _insertWorkspaces = createInsertSchema(table.workspaces);
const _insertSubscriptions = createInsertSchema(table.subscriptions);
const _insertWorkspaceMembers = createInsertSchema(table.workspaceMembers);
const _insertJournals = createInsertSchema(table.journals);
const _insertJournalVersions = createInsertSchema(table.journalVersions);
const _insertExports = createInsertSchema(table.exports);
const _insertAgentSessions = createInsertSchema(table.agentSessions);
const _insertAgentMessages = createInsertSchema(table.agentMessages);
const _insertAgentRuns = createInsertSchema(table.agentRuns);
const _insertAgentEvents = createInsertSchema(table.agentEvents);
const _insertAgentResearchSessions = createInsertSchema(
  table.agentResearchSessions,
);
const _insertAgentResearchCandidateSources = createInsertSchema(
  table.agentResearchCandidateSources,
);
const _insertAgentResearchEvidenceItems = createInsertSchema(
  table.agentResearchEvidenceItems,
);
const _insertAgentResearchClaims = createInsertSchema(
  table.agentResearchClaims,
);

const _selectUsers = createSelectSchema(table.users);
const _selectWorkspaces = createSelectSchema(table.workspaces);
const _selectSubscriptions = createSelectSchema(table.subscriptions);
const _selectWorkspaceMembers = createSelectSchema(table.workspaceMembers);
const _selectJournals = createSelectSchema(table.journals);
const _selectJournalVersions = createSelectSchema(table.journalVersions);
const _selectExports = createSelectSchema(table.exports);
const _selectAgentSessions = createSelectSchema(table.agentSessions);
const _selectAgentMessages = createSelectSchema(table.agentMessages);
const _selectAgentRuns = createSelectSchema(table.agentRuns);
const _selectAgentEvents = createSelectSchema(table.agentEvents);
const _selectAgentResearchSessions = createSelectSchema(
  table.agentResearchSessions,
);
const _selectAgentResearchCandidateSources = createSelectSchema(
  table.agentResearchCandidateSources,
);
const _selectAgentResearchEvidenceItems = createSelectSchema(
  table.agentResearchEvidenceItems,
);
const _selectAgentResearchClaims = createSelectSchema(
  table.agentResearchClaims,
);

export const dbModel = {
  insert: spreads({
    users: _insertUsers,
    workspaces: _insertWorkspaces,
    subscriptions: _insertSubscriptions,
    workspaceMembers: _insertWorkspaceMembers,
    journals: _insertJournals,
    journalVersions: _insertJournalVersions,
    exports: _insertExports,
    agentSessions: _insertAgentSessions,
    agentMessages: _insertAgentMessages,
    agentRuns: _insertAgentRuns,
    agentEvents: _insertAgentEvents,
    agentResearchSessions: _insertAgentResearchSessions,
    agentResearchCandidateSources: _insertAgentResearchCandidateSources,
    agentResearchEvidenceItems: _insertAgentResearchEvidenceItems,
    agentResearchClaims: _insertAgentResearchClaims,
  }),
  select: spreads({
    users: _selectUsers,
    workspaces: _selectWorkspaces,
    subscriptions: _selectSubscriptions,
    workspaceMembers: _selectWorkspaceMembers,
    journals: _selectJournals,
    journalVersions: _selectJournalVersions,
    exports: _selectExports,
    agentSessions: _selectAgentSessions,
    agentMessages: _selectAgentMessages,
    agentRuns: _selectAgentRuns,
    agentEvents: _selectAgentEvents,
    agentResearchSessions: _selectAgentResearchSessions,
    agentResearchCandidateSources: _selectAgentResearchCandidateSources,
    agentResearchEvidenceItems: _selectAgentResearchEvidenceItems,
    agentResearchClaims: _selectAgentResearchClaims,
  }),
} as const;
