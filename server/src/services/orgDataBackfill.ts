import mongoose from "mongoose";

import AgentOutputModel from "../models/agentOutputModel";
import AiResponseCacheModel from "../models/aiResponseCacheModel";
import ChatMessageModel from "../models/chatMessageModel";
import ChatSessionModel from "../models/chatSessionModel";
import DomainEventModel from "../models/domainEventModel";
import FinancialProfileModel from "../models/financialProfileModel";
import JournalEntryModel from "../models/journalEntryModel";
import ReceiptModel from "../models/receiptModel";
import TaskModel from "../models/taskModel";
import TransactionModel from "../models/transactionModel";

const lastBackfilledAtByUser = new Map<string, number>();
const BACKFILL_TTL_MS = 60 * 60 * 1000;

// Checks whether backfill routines should run for a given user identifier.
// Compares last backfilled execution timestamps against hourly TTL windows.
// Prevents redundant scanning and database updates on repeated user requests.
const shouldBackfill = (userId: string) => {
  const last = lastBackfilledAtByUser.get(userId);
  if (!last) return true;
  return Date.now() - last >= BACKFILL_TTL_MS;
};

// Backfills missing organization tenant IDs across all legacy user records.
// Scans profiles, transactions, tasks, chat logs, receipts, and domain events.
// Assigns the default personal organization identifier to orphan documents.
export const backfillLegacyOrgIdForUser = async (params: {
  userId: mongoose.Types.ObjectId;
  defaultOrgId: mongoose.Types.ObjectId;
}) => {
  const userIdStr = params.userId.toString();
  if (!shouldBackfill(userIdStr)) {
    return { ran: false };
  }

  lastBackfilledAtByUser.set(userIdStr, Date.now());

  const filter = { userId: params.userId, orgId: { $exists: false } };
  const update = { $set: { orgId: params.defaultOrgId } };

  await Promise.allSettled([
    FinancialProfileModel.updateMany(filter, update),
    TransactionModel.updateMany(filter, update),
    TaskModel.updateMany(filter, update),
    ChatSessionModel.updateMany(filter, update),
    ChatMessageModel.updateMany(filter, update),
    AgentOutputModel.updateMany(filter, update),
    ReceiptModel.updateMany(filter, update),
    JournalEntryModel.updateMany(filter, update),
    AiResponseCacheModel.updateMany(filter, update),
    DomainEventModel.updateMany(filter, update),
  ]);

  return { ran: true };
};

