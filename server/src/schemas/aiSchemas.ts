import { z } from "zod";

const riskToleranceSchema = z.enum(["conservative", "moderate", "aggressive"]);
const investmentExperienceSchema = z.enum(["beginner", "intermediate", "expert"]);

const financialGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    target: z.number().nonnegative(),
    current: z.number().nonnegative(),
    deadline: z.string().trim().min(1).max(64),
    priority: z.number().int().positive().max(10)
  })
  .strict();

const debtSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    balance: z.number().nonnegative(),
    interest_rate: z.number().min(0).max(100),
    minimum_payment: z.number().nonnegative(),
    type: z.string().trim().min(1).max(60)
  })
  .strict();

const transactionSchema = z
  .object({
    amount: z.number(),
    category: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(250),
    date: z.coerce.date(),
    type: z.enum(["income", "expense", "investment"])
  })
  .strict();

export const processCommandBodySchema = z
  .object({
    command: z.string().trim().min(1, "Command is required").max(4000)
  })
  .strict();

export const whatIfScenarioBodySchema = z
  .object({
    parameters: z
      .object({
        type: z.enum(["expense", "income", "investment"]).optional(),
        expense: z.number().nonnegative().optional(),
        income: z.number().nonnegative().optional(),
        description: z.string().trim().max(500).optional()
      })
      .strict()
  })
  .strict();

export const updateFinancialProfileBodySchema = z
  .object({
    age: z.number().int().positive().max(120).optional(),
    annual_income: z.number().nonnegative().optional(),
    monthly_expenses: z.number().nonnegative().optional(),
    savings: z.number().optional(),
    goals: z.array(financialGoalSchema).optional(),
    debts: z.array(debtSchema).optional(),
    transactions: z.array(transactionSchema).optional(),
    risk_tolerance: riskToleranceSchema.optional(),
    investment_experience: investmentExperienceSchema.optional()
  })
  .strict();

export const addInvestmentBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().max(60).optional(),
    amount: z.number().positive(),
    date: z.coerce.date().optional()
  })
  .strict();
