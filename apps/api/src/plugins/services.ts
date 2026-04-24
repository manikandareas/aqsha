import { Elysia } from "elysia";
import { database } from "../database/client";
import { AgentModelManager } from "../modules/agents/model-manager";
import { AgentRepository } from "../modules/agents/repository";
import { AgentService } from "../modules/agents/service";
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
const agentRepository = new AgentRepository(database);

const userService = new UserService(userRepository);
const workspaceService = new WorkspaceService(workspaceRepository);
const journalService = new JournalService(journalRepository);
const sessionService = new SessionService(userService, workspaceService);
const agentModelManager = new AgentModelManager();
const agentService = new AgentService(agentRepository, agentModelManager);

export const servicesPlugin = new Elysia({
  name: "plugin.services",
}).decorate({
  agentService,
  journalService,
  sessionService,
  userService,
  workspaceService,
});
