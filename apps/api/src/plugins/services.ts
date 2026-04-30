import { Elysia } from "elysia";
import { database } from "../database/client";
import { DrizzleChatStore } from "../modules/chat/repository";
import { ChatService } from "../modules/chat/service";
import { JournalRepository } from "../modules/journals/repository";
import { JournalService } from "../modules/journals/service";
import { SessionService } from "../modules/session/service";
import { UserRepository } from "../modules/users/repository";
import { UserService } from "../modules/users/service";
import { WorkspaceRepository } from "../modules/workspaces/repository";
import { WorkspaceService } from "../modules/workspaces/service";

const userRepository = new UserRepository(database);
const workspaceRepository = new WorkspaceRepository(database);
const journalRepository = new JournalRepository(database);
const chatStore = new DrizzleChatStore(database);

const userService = new UserService(userRepository);
const workspaceService = new WorkspaceService(workspaceRepository);
const journalService = new JournalService(journalRepository);
const chatService = new ChatService(chatStore);
const sessionService = new SessionService(userService, workspaceService);

export const servicesPlugin = new Elysia({
  name: "plugin.services",
}).decorate({
  chatService,
  journalService,
  sessionService,
  userService,
  workspaceService,
});
