import type { Application, Router } from "express";

import type { Env } from "../config/env";

import aiRoutes from "./aiRoutes";
import authRoutes from "./authRoutes";
import blogRoutes from "./blogRoutes";
import chatRoutes from "./chatRoutes";
import configRoutes from "./configRoutes";
import financialDataRoutes from "./financialDataRoutes";
import financialJournalRoutes from "./financialJournalRoutes";
import growthStoryRoutes from "./growthStoryRoutes";
import internalToolsRoutes from "./internalToolsRoutes";
import mediaRoutes from "./mediaRoutes";
import monetizationRoutes from "./monetizationRoutes";
import publicShareRoutes from "./publicShareRoutes";
import receiptRoutes from "./receiptRoutes";
import taskRoutes from "./taskRoutes";
import v1Routes from "./v1Routes";

type MountedRoute = {
  path: string;
  router: Router;
};

const mountRoutes = (app: Application, routes: MountedRoute[]) => {
  routes.forEach(({ path, router }) => {
    app.use(path, router);
  });
};

export const getCanonicalApiRoutes = (env: Env): MountedRoute[] => {
  const routes: MountedRoute[] = [
    { path: "/api/internal/tools", router: internalToolsRoutes },
    { path: "/api/v1/auth", router: authRoutes },
    { path: "/api/v1/config", router: configRoutes },
    { path: "/api/v1/public", router: publicShareRoutes },
    { path: "/api/v1/blogs", router: blogRoutes },
    { path: "/api/v1/growth-stories", router: growthStoryRoutes },
    { path: "/api/v1", router: v1Routes },
  ];

  if (env.MONETIZATION_ENABLED) {
    routes.push({ path: "/api/v1", router: monetizationRoutes });
  }

  routes.push(
    { path: "/api/v1", router: aiRoutes },
    { path: "/api/v1/chat", router: chatRoutes },
    { path: "/api/v1", router: financialDataRoutes },
    { path: "/api/v1", router: receiptRoutes },
    { path: "/api/v1", router: financialJournalRoutes },
    { path: "/api/v1", router: mediaRoutes },
  );

  if (env.TASKS_ENABLED) {
    routes.push({ path: "/api/v1/tasks", router: taskRoutes });
  }

  return routes;
};

export const getLegacyApiRoutes = (env: Env): MountedRoute[] => {
  const routes: MountedRoute[] = [
    { path: "/api/auth", router: authRoutes },
    { path: "/api/config", router: configRoutes },
  ];

  if (env.MONETIZATION_ENABLED) {
    routes.push({ path: "/api", router: monetizationRoutes });
  }

  routes.push(
    { path: "/api", router: aiRoutes },
    { path: "/api/chat", router: chatRoutes },
    { path: "/api", router: financialDataRoutes },
    { path: "/api", router: receiptRoutes },
    { path: "/api", router: financialJournalRoutes },
    { path: "/api", router: mediaRoutes },
  );

  if (env.TASKS_ENABLED) {
    routes.push({ path: "/api/tasks", router: taskRoutes });
  }

  return routes;
};

export const mountCanonicalApiRoutes = (app: Application, env: Env) => {
  mountRoutes(app, getCanonicalApiRoutes(env));
};

export const mountLegacyApiRoutes = (app: Application, env: Env) => {
  mountRoutes(app, getLegacyApiRoutes(env));
};
