import { Elysia } from "elysia";
import { database } from "../database/client";
import { AgentsService } from "../modules/agents/service";
import { DrizzleChatStore } from "../modules/chat/repository";
import { ChatService } from "../modules/chat/service";
import { JournalRepository } from "../modules/journals/repository";
import { JournalService } from "../modules/journals/service";
import { SessionService } from "../modules/session/service";
import { UserRepository } from "../modules/users/repository";
import { UserService } from "../modules/users/service";

const userRepository = new UserRepository(database);
const journalRepository = new JournalRepository(database);
const chatStore = new DrizzleChatStore(database);

const userService = new UserService(userRepository);
const journalService = new JournalService(journalRepository, userService);
const chatService = new ChatService(chatStore, userService);
const sessionService = new SessionService(userService);
const agentsService = new AgentsService();

export const servicesPlugin = new Elysia({
  name: "plugin.services",
}).decorate({
  agentsService,
  chatService,
  journalService,
  sessionService,
  userService,
});
