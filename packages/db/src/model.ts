import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { table } from "./schema";
import { spreads } from "./utils";

const _insertUsers = createInsertSchema(table.users);
const _insertSessions = createInsertSchema(table.sessions);
const _insertAccounts = createInsertSchema(table.accounts);
const _insertVerifications = createInsertSchema(table.verifications);
const _insertWorkspaces = createInsertSchema(table.workspaces);
const _insertSubscriptions = createInsertSchema(table.subscriptions);
const _insertWorkspaceMembers = createInsertSchema(table.workspaceMembers);
const _insertJournals = createInsertSchema(table.journals);
const _insertJournalVersions = createInsertSchema(table.journalVersions);
const _insertExports = createInsertSchema(table.exports);
const _insertAgentThreads = createInsertSchema(table.agentThreads);
const _insertAgentMessages = createInsertSchema(table.agentMessages);
const _insertAgentRuns = createInsertSchema(table.agentRuns);
const _insertAgentEvents = createInsertSchema(table.agentEvents);

const _selectUsers = createSelectSchema(table.users);
const _selectSessions = createSelectSchema(table.sessions);
const _selectAccounts = createSelectSchema(table.accounts);
const _selectVerifications = createSelectSchema(table.verifications);
const _selectWorkspaces = createSelectSchema(table.workspaces);
const _selectSubscriptions = createSelectSchema(table.subscriptions);
const _selectWorkspaceMembers = createSelectSchema(table.workspaceMembers);
const _selectJournals = createSelectSchema(table.journals);
const _selectJournalVersions = createSelectSchema(table.journalVersions);
const _selectExports = createSelectSchema(table.exports);
const _selectAgentThreads = createSelectSchema(table.agentThreads);
const _selectAgentMessages = createSelectSchema(table.agentMessages);
const _selectAgentRuns = createSelectSchema(table.agentRuns);
const _selectAgentEvents = createSelectSchema(table.agentEvents);

export const dbModel = {
  insert: spreads({
    users: _insertUsers,
    sessions: _insertSessions,
    accounts: _insertAccounts,
    verifications: _insertVerifications,
    workspaces: _insertWorkspaces,
    subscriptions: _insertSubscriptions,
    workspaceMembers: _insertWorkspaceMembers,
    journals: _insertJournals,
    journalVersions: _insertJournalVersions,
    exports: _insertExports,
    agentThreads: _insertAgentThreads,
    agentMessages: _insertAgentMessages,
    agentRuns: _insertAgentRuns,
    agentEvents: _insertAgentEvents,
  }),
  select: spreads({
    users: _selectUsers,
    sessions: _selectSessions,
    accounts: _selectAccounts,
    verifications: _selectVerifications,
    workspaces: _selectWorkspaces,
    subscriptions: _selectSubscriptions,
    workspaceMembers: _selectWorkspaceMembers,
    journals: _selectJournals,
    journalVersions: _selectJournalVersions,
    exports: _selectExports,
    agentThreads: _selectAgentThreads,
    agentMessages: _selectAgentMessages,
    agentRuns: _selectAgentRuns,
    agentEvents: _selectAgentEvents,
  }),
} as const;
