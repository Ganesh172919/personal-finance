import { z } from "zod";

const connectorKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._:-]{1,118}[a-z0-9]$/, "Invalid connector key");

export const integrationIdParamSchema = z
  .object({
    id: connectorKeySchema,
  })
  .strict();

export const integrationHistoryQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
  })
  .strict();

export const integrationSyncBodySchema = z
  .object({
    records_synced: z.number().int().min(0).max(1_000_000).optional(),
    simulate_error: z.boolean().optional(),
  })
  .strict();

export const integrationConnectBodySchema = z.object({}).strict().default({});

export const integrationDisconnectBodySchema = z.object({}).strict().default({});
