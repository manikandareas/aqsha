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

const _selectUsers = createSelectSchema(table.users);
const _selectWorkspaces = createSelectSchema(table.workspaces);
const _selectSubscriptions = createSelectSchema(table.subscriptions);
const _selectWorkspaceMembers = createSelectSchema(table.workspaceMembers);
const _selectJournals = createSelectSchema(table.journals);
const _selectJournalVersions = createSelectSchema(table.journalVersions);
const _selectExports = createSelectSchema(table.exports);

export const dbModel = {
  insert: spreads({
    users: _insertUsers,
    workspaces: _insertWorkspaces,
    subscriptions: _insertSubscriptions,
    workspaceMembers: _insertWorkspaceMembers,
    journals: _insertJournals,
    journalVersions: _insertJournalVersions,
    exports: _insertExports,
  }),
  select: spreads({
    users: _selectUsers,
    workspaces: _selectWorkspaces,
    subscriptions: _selectSubscriptions,
    workspaceMembers: _selectWorkspaceMembers,
    journals: _selectJournals,
    journalVersions: _selectJournalVersions,
    exports: _selectExports,
  }),
} as const;
