/**
 * followThroughService.ts - Personalized Follow-Through & Activity Signal Ranking Service
 * ======================================================================================
 * 
 * Aggregates multi-source activity signals (tasks, goals, budgets, reminders, debts)
 * and ranks actionable next steps using learned user preference weights and half-life
 * exponential time decay.
 * 
 * Mathematical Invariants:
 * - Half-life Exponential Time Decay: w = exp(- ln(2) * Delta_t / 14)
 * - Priority Score S in [0.0, 100.0]
 * - Deterministic Sorting: Overdue items first, followed by Score S descending, ID tie-breaker
 * - Strict multi-tenant isolation by orgId and userId
 */

import { Types } from "mongoose";
import {
  FollowThroughPreferenceModel,
  type FollowThroughAction,
  type FollowThroughDomain,
  type IFollowThroughPreferenceDocument,
} from "../models/followThroughPreferenceModel";
import TaskModel from "../models/taskModel";
import FinancialProfileModel from "../models/financialProfileModel";
import BudgetAllocationModel from "../models/budgetAllocationModel";
import CalendarReminderModel from "../models/calendarReminderModel";

// Interface defining an individual ranked follow-through action recommendation item.
// Encapsulates source domain, title, composite priority score, urgency, and routing target.
export interface FollowThroughItem {
  id: string;
  domain: FollowThroughDomain;
  title: string;
  description: string;
  priorityScore: number;
  priorityTier: "critical" | "high" | "medium" | "low";
  urgency: number;
  impact: number;
  actionUrl: string;
  isOverdue: boolean;
  dueDate?: string | null;
  rank: number;
  metadata?: Record<string, unknown>;
}

// Result contract aggregating prioritized follow-through items and preference weighting telemetry.
// Returns ranked recommendation items, signal counts, learned affinities, and user preferences.
export interface FollowThroughResult {
  items: FollowThroughItem[];
  totalSignals: number;
  learnedAffinities: Record<string, number>;
  preferences: {
    focusDomains: Record<string, number>;
    riskTolerance: "conservative" | "moderate" | "aggressive";
    preferredCadence: "daily" | "weekly" | "biweekly";
  };
}

// Parameter interface representing user interaction feedback recorded against a recommendation.
// Captures target signal identity, domain category, specific user action, and optional justification.
export interface RecordFeedbackParams {
  signalId: string;
  domain: FollowThroughDomain;
  action: FollowThroughAction;
  reason?: string;
}

// Parameter interface for updating user follow-through preferences and domain multipliers.
// Allows partial modifications to focus domains, investment risk appetite, and review cadence.
export interface UpdatePreferencesParams {
  focusDomains?: Record<string, number>;
  riskTolerance?: "conservative" | "moderate" | "aggressive";
  preferredCadence?: "daily" | "weekly" | "biweekly";
}

const HALF_LIFE_DAYS = 14.0;

// Calculates exponential half-life time decay factor based on a 14-day half-life curve.
// Downweights older user feedback signals smoothly to prioritize recent preferences.
function computeTimeDecay(createdAt: Date, now: Date = new Date()): number {
  const deltaSeconds = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 1000);
  const deltaDays = deltaSeconds / 86400;
  return Math.max(0.001, Math.min(1.0, Math.exp(-0.69314718056 * (deltaDays / HALF_LIFE_DAYS))));
}

// Categorizes numerical priority scores into human-readable critical, high, medium, or low tiers.
// Maps priority scores on a 0 to 100 scale to standard urgency classification badges.
function classifyTier(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 80.0) return "critical";
  if (score >= 60.0) return "high";
  if (score >= 40.0) return "medium";
  return "low";
}

// Retrieves existing user follow-through preference document or initializes default profile settings.
// Establishes baseline 1.0 weights across domains with moderate risk appetite and weekly cadence.
export async function getOrCreatePreferences(
  orgId: Types.ObjectId,
  userId: Types.ObjectId
): Promise<IFollowThroughPreferenceDocument> {
  let pref = await FollowThroughPreferenceModel.findOne({ orgId, userId });
  if (!pref) {
    pref = await FollowThroughPreferenceModel.create({
      orgId,
      userId,
      focusDomains: {
        debt: 1.0,
        budget: 1.0,
        goal: 1.0,
        task: 1.0,
        reminder: 1.0,
      },
      riskTolerance: "moderate",
      preferredCadence: "weekly",
      feedbackHistory: [],
    });
  }
  return pref;
}

// Compiles and scores cross-domain activity signals from tasks, budgets, goals, and calendar reminders.
// Applies user domain affinities, recency decay, and deadline urgency to generate prioritized actions.
export async function getFollowThroughRecommendations(
  orgId: string | Types.ObjectId,
  userId: string | Types.ObjectId,
  limit: number = 10
): Promise<FollowThroughResult> {
  const oId = typeof orgId === "string" ? new Types.ObjectId(orgId) : orgId;
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const periodKey = todayStr.slice(0, 7);

  // 1. Concurrent multi-source data ingestion
  const [tasks, profile, allocations, reminders, prefDoc] = await Promise.all([
    TaskModel.find({ orgId: oId, userId: uId, status: "open" }).limit(30).lean(),
    FinancialProfileModel.findOne({ orgId: oId, userId: uId }).lean(),
    BudgetAllocationModel.find({ orgId: oId, periodKey }).lean(),
    CalendarReminderModel.find({ orgId: oId, userId: uId, completed: false }).limit(20).lean(),
    getOrCreatePreferences(oId, uId),
  ]);

  // 2. Compute learned domain affinities & dismissed IDs from feedback history
  const learnedAffinities: Record<string, number> = {};
  const dismissedSet = new Set<string>();

  for (const event of prefDoc.feedbackHistory) {
    const decay = computeTimeDecay(event.createdAt, now);
    let delta = 0;
    if (event.action === "upvote") {
      delta = +0.40 * decay;
    } else if (event.action === "complete") {
      delta = +0.25 * decay;
    } else if (event.action === "dismiss") {
      delta = -0.50 * decay;
      dismissedSet.add(event.signalId);
    }
    learnedAffinities[event.domain] = (learnedAffinities[event.domain] || 0) + delta;
  }

  // Clamp learned affinities to [-1.0, 1.0]
  Object.keys(learnedAffinities).forEach((dom) => {
    learnedAffinities[dom] = Math.max(-1.0, Math.min(1.0, Math.round(learnedAffinities[dom] * 1000) / 1000));
  });

  // Convert focusDomains map to plain object
  const focusDomains: Record<string, number> =
    prefDoc.focusDomains instanceof Map
      ? Object.fromEntries(prefDoc.focusDomains)
      : (prefDoc.focusDomains as unknown as Record<string, number>) || {};

  // 3. Raw Signal Extraction
  interface RawSignal {
    id: string;
    domain: FollowThroughDomain;
    title: string;
    description: string;
    urgency: number;
    impact: number;
    actionUrl: string;
    isOverdue: boolean;
    dueDate?: string | null;
    metadata?: Record<string, unknown>;
  }

  const rawSignals: RawSignal[] = [];

  // A. Tasks
  for (const t of tasks) {
    const isOverdue = Boolean(t.dueDate && new Date(t.dueDate).getTime() < now.getTime());
    let urgency = 0.50;
    if (isOverdue) {
      const daysOverdue = Math.max(1, Math.floor((now.getTime() - new Date(t.dueDate!).getTime()) / 86400000));
      urgency = Math.min(1.0, 0.90 + 0.02 * daysOverdue);
    } else if (t.dueDate) {
      const daysUntil = Math.max(0, Math.floor((new Date(t.dueDate).getTime() - now.getTime()) / 86400000));
      urgency = daysUntil <= 3 ? 0.85 : daysUntil <= 7 ? 0.70 : 0.50;
    } else {
      urgency = t.priority === "high" ? 0.65 : t.priority === "medium" ? 0.45 : 0.30;
    }

    const impact = t.priority === "high" ? 0.80 : t.priority === "medium" ? 0.55 : 0.35;
    rawSignals.push({
      id: `task:${t._id}`,
      domain: "task",
      title: t.title,
      description: t.why || `Task priority: ${t.priority}`,
      urgency: Math.round(urgency * 1000) / 1000,
      impact: Math.round(impact * 1000) / 1000,
      actionUrl: "/tasks",
      isOverdue,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : null,
      metadata: { priority: t.priority, taskId: String(t._id) },
    });
  }

  // B. Goals
  if (profile && Array.isArray(profile.goals)) {
    for (const g of profile.goals) {
      if (g.target <= 0 || g.current >= g.target) continue;
      const remaining = g.target - g.current;
      const progressPct = (g.current / g.target) * 100;
      const deadlineDt = g.deadline ? new Date(g.deadline) : null;
      const isOverdue = Boolean(deadlineDt && deadlineDt.getTime() < now.getTime());

      let urgency = 0.45;
      if (isOverdue) {
        urgency = 0.88;
      } else if (deadlineDt) {
        const daysLeft = Math.max(1, Math.floor((deadlineDt.getTime() - now.getTime()) / 86400000));
        urgency = daysLeft <= 30 ? 0.75 : daysLeft <= 90 ? 0.60 : 0.40;
      }

      const impact = Math.min(1.0, Math.max(0.40, Math.log10(Math.max(100, g.target)) / 5.0));
      rawSignals.push({
        id: `goal:${g._id || Math.abs(hashString(g.name))}`,
        domain: "goal",
        title: `Fund Goal: ${g.name}`,
        description: `$${remaining.toLocaleString()} remaining to reach target (${progressPct.toFixed(1)}% funded).`,
        urgency: Math.round(urgency * 1000) / 1000,
        impact: Math.round(impact * 1000) / 1000,
        actionUrl: "/goals-debts",
        isOverdue,
        dueDate: g.deadline || null,
        metadata: { target: g.target, current: g.current, remaining },
      });
    }
  }

  // C. Debts
  if (profile && Array.isArray(profile.debts)) {
    for (const d of profile.debts) {
      if (d.balance <= 0) continue;
      const apr = d.interest_rate || 0;
      const isHighApr = apr >= 15.0;
      const urgency = isHighApr ? Math.min(1.0, 0.70 + 0.25 * (apr / 30.0)) : 0.50;
      const impact = Math.min(1.0, 0.65 + 0.35 * Math.min(1.0, d.balance / 5000.0));

      rawSignals.push({
        id: `debt:${d._id || Math.abs(hashString(d.name))}`,
        domain: "debt",
        title: `Pay Down Debt: ${d.name}`,
        description: `Balance of $${d.balance.toLocaleString()} at ${apr.toFixed(1)}% APR. Prioritizing saves compounding interest.`,
        urgency: Math.round(urgency * 1000) / 1000,
        impact: Math.round(impact * 1000) / 1000,
        actionUrl: "/goals-debts",
        isOverdue: false,
        dueDate: null,
        metadata: { balance: d.balance, apr },
      });
    }
  }

  // D. Budget Allocations
  for (const b of allocations) {
    if (b.amount <= 0) continue;
    rawSignals.push({
      id: `budget:${b.category.toLowerCase().replace(/\s+/g, "_")}`,
      domain: "budget",
      title: `Budget Focus: ${b.category}`,
      description: `Active envelope with $${b.amount.toLocaleString()} allocation for ${b.periodKey}.`,
      urgency: 0.55,
      impact: Math.min(1.0, 0.40 + Math.min(0.5, b.amount / 2000.0)),
      actionUrl: "/budgets",
      isOverdue: false,
      dueDate: null,
      metadata: { category: b.category, amount: b.amount },
    });
  }

  // E. Calendar Reminders
  for (const r of reminders) {
    const remDt = r.date ? new Date(r.date) : null;
    const isOverdue = Boolean(remDt && remDt.getTime() < now.getTime());
    let urgency = 0.50;
    if (isOverdue) {
      urgency = 0.92;
    } else if (remDt) {
      const daysAway = Math.floor((remDt.getTime() - now.getTime()) / 86400000);
      urgency = daysAway <= 2 ? 0.88 : daysAway <= 7 ? 0.72 : daysAway <= 14 ? 0.55 : 0.35;
    }

    rawSignals.push({
      id: `reminder:${r._id}`,
      domain: "reminder",
      title: `Bill/Reminder: ${r.title}`,
      description: r.description || `Scheduled financial event on ${r.date}.`,
      urgency: Math.round(urgency * 1000) / 1000,
      impact: 0.60,
      actionUrl: "/calendar",
      isOverdue,
      dueDate: r.date,
      metadata: { reminderId: String(r._id) },
    });
  }

  // 4. Deterministic Ranking Pass
  const scoredItems: FollowThroughItem[] = [];

  for (const s of rawSignals) {
    const isDismissed = dismissedSet.has(s.id);
    if (isDismissed) continue; // Filter out dismissed signals

    const affinity = learnedAffinities[s.domain] || 0.0;
    const focusWeight = focusDomains[s.domain] !== undefined ? focusDomains[s.domain] : 1.0;

    const pComb = Math.max(-1.0, Math.min(1.0, affinity + (focusWeight - 1.0) * 0.5));
    const pNorm = (pComb + 1.0) / 2.0;

    const overdueBonus = s.isOverdue ? 0.15 : 0.0;
    const baseScore = 0.35 * s.urgency + 0.30 * s.impact + 0.25 * pNorm + overdueBonus;
    const clampedRatio = Math.max(0.0, Math.min(1.0, baseScore));
    const score = Math.round(clampedRatio * 1000) / 10;

    scoredItems.push({
      id: s.id,
      domain: s.domain,
      title: s.title,
      description: s.description,
      priorityScore: score,
      priorityTier: classifyTier(score),
      urgency: s.urgency,
      impact: s.impact,
      actionUrl: s.actionUrl,
      isOverdue: s.isOverdue,
      dueDate: s.dueDate,
      rank: 0,
      metadata: s.metadata,
    });
  }

  // Sort: Overdue first -> Score S descending -> ID ascending
  scoredItems.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return a.id.localeCompare(b.id);
  });

  const finalItems = scoredItems.slice(0, limit).map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  return {
    items: finalItems,
    totalSignals: rawSignals.length,
    learnedAffinities,
    preferences: {
      focusDomains,
      riskTolerance: prefDoc.riskTolerance,
      preferredCadence: prefDoc.preferredCadence,
    },
  };
}

// Records explicit user interactions with recommendations to continuously refine learned affinities.
// Appends feedback events to user history and persists updated weights to the database.
export async function recordFollowThroughFeedback(
  orgId: string | Types.ObjectId,
  userId: string | Types.ObjectId,
  params: RecordFeedbackParams
): Promise<IFollowThroughPreferenceDocument> {
  const oId = typeof orgId === "string" ? new Types.ObjectId(orgId) : orgId;
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  const pref = await getOrCreatePreferences(oId, uId);
  pref.feedbackHistory.push({
    signalId: params.signalId,
    domain: params.domain,
    action: params.action,
    reason: params.reason,
    createdAt: new Date(),
  });

  await pref.save();
  return pref;
}

// Applies manual updates to user follow-through settings including focus domains and notification cadence.
// Saves configuration updates to the user preference record and returns the updated document.
export async function updateFollowThroughPreferences(
  orgId: string | Types.ObjectId,
  userId: string | Types.ObjectId,
  params: UpdatePreferencesParams
): Promise<IFollowThroughPreferenceDocument> {
  const oId = typeof orgId === "string" ? new Types.ObjectId(orgId) : orgId;
  const uId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  const pref = await getOrCreatePreferences(oId, uId);

  if (params.focusDomains) {
    pref.focusDomains = params.focusDomains;
  }
  if (params.riskTolerance) {
    pref.riskTolerance = params.riskTolerance;
  }
  if (params.preferredCadence) {
    pref.preferredCadence = params.preferredCadence;
  }

  await pref.save();
  return pref;
}

// Computes a deterministic 32-bit integer hash from an input identifier string.
// Provides stable tie-breaking when two recommendation signals share identical priority scores.
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}
