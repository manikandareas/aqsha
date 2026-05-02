import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import { table } from "./schema";
import { spreads } from "./utils";

const _insertUsers = createInsertSchema(table.users);
const _insertSessions = createInsertSchema(table.sessions);
const _insertAccounts = createInsertSchema(table.accounts);
const _insertVerifications = createInsertSchema(table.verifications);
const _insertSubscriptions = createInsertSchema(table.subscriptions);
const _insertJournals = createInsertSchema(table.journals);
const _insertJournalVersions = createInsertSchema(table.journalVersions);
const _insertExports = createInsertSchema(table.exports);
const _insertChatThreads = createInsertSchema(table.chatThreads);
const _insertChatMessages = createInsertSchema(table.chatMessages);
const _insertChatSources = createInsertSchema(table.chatSources);
const _insertAgentRuns = createInsertSchema(table.agentRuns);
const _insertAgentEvents = createInsertSchema(table.agentEvents);

const _selectUsers = createSelectSchema(table.users);
const _selectSessions = createSelectSchema(table.sessions);
const _selectAccounts = createSelectSchema(table.accounts);
const _selectVerifications = createSelectSchema(table.verifications);
const _selectSubscriptions = createSelectSchema(table.subscriptions);
const _selectJournals = createSelectSchema(table.journals);
const _selectJournalVersions = createSelectSchema(table.journalVersions);
const _selectExports = createSelectSchema(table.exports);
const _selectChatThreads = createSelectSchema(table.chatThreads);
const _selectChatMessages = createSelectSchema(table.chatMessages);
const _selectChatSources = createSelectSchema(table.chatSources);
const _selectAgentRuns = createSelectSchema(table.agentRuns);
const _selectAgentEvents = createSelectSchema(table.agentEvents);

export const dbModel = {
  insert: spreads({
    users: _insertUsers,
    sessions: _insertSessions,
    accounts: _insertAccounts,
    verifications: _insertVerifications,
    subscriptions: _insertSubscriptions,
    journals: _insertJournals,
    journalVersions: _insertJournalVersions,
    exports: _insertExports,
    chatThreads: _insertChatThreads,
    chatMessages: _insertChatMessages,
    chatSources: _insertChatSources,
    agentRuns: _insertAgentRuns,
    agentEvents: _insertAgentEvents,
  }),
  select: spreads({
    users: _selectUsers,
    sessions: _selectSessions,
    accounts: _selectAccounts,
    verifications: _selectVerifications,
    subscriptions: _selectSubscriptions,
    journals: _selectJournals,
    journalVersions: _selectJournalVersions,
    exports: _selectExports,
    chatThreads: _selectChatThreads,
    chatMessages: _selectChatMessages,
    chatSources: _selectChatSources,
    agentRuns: _selectAgentRuns,
    agentEvents: _selectAgentEvents,
  }),
} as const;
