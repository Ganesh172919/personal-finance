import { Schema, model, Document, Types } from "mongoose";

export interface IFinancialGoal {
  _id?: Types.ObjectId;
  name: string;
  target: number;
  current: number;
  deadline: string;
  priority: number;
}

export interface IDebt {
  _id?: Types.ObjectId;
  name: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
  type: string;
}

export interface ITransaction {
  _id?: Types.ObjectId;
  amount: number;
  category: string;
  description: string;
  date: Date;
  type: 'income' | 'expense' | 'investment';
}

export interface IFinancialProfile {
  userId: Types.ObjectId;
  age: number;
  annual_income: number;
  monthly_expenses: number;
  savings: number;
  goals: IFinancialGoal[];
  debts: IDebt[];
  transactions: ITransaction[];
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
  investment_experience: 'beginner' | 'intermediate' | 'expert';
  transactionsCount?: number;
  transactionsUpdatedAt?: Date;
  transactionsMigratedAt?: Date;
}

export interface IFinancialProfileDocument extends IFinancialProfile, Document {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const financialProfileSchema = new Schema<IFinancialProfileDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    age: { type: Number, required: true },
    annual_income: { type: Number, required: true },
    monthly_expenses: { type: Number, required: true },
    savings: { type: Number, default: 0 },
    goals: [{
      name: { type: String, required: true },
      target: { type: Number, required: true },
      current: { type: Number, required: true },
      deadline: { type: String, required: true },
      priority: { type: Number, required: true }
    }],
    
    // ✅ FIX: Properly define the debts subdocument schema
    debts: [{
      name: { type: String, required: true },
      balance: { type: Number, required: true },
      interest_rate: { type: Number, required: true },
      minimum_payment: { type: Number, required: true },
      type: { type: String, required: true }
    }],

    transactions: [{
      amount: { type: Number, required: true },
      category: { type: String, required: true },
      description: { type: String, required: true },
      date: { type: Date, required: true },
      type: { 
        type: String, 
        enum: ['income', 'expense', 'investment'],
        required: true 
      }
    }],

    // New: transaction metadata used for cache invalidation and migration tracking.
    // Transactions are stored in the dedicated Transaction collection; this embedded array is legacy-only.
    transactionsCount: { type: Number, default: 0 },
    transactionsUpdatedAt: { type: Date, default: Date.now },
    transactionsMigratedAt: { type: Date },
    risk_tolerance: { 
      type: String, 
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    investment_experience: { 
      type: String,
      enum: ['beginner', 'intermediate', 'expert'],
      default: 'beginner'
    }
  },
  { timestamps: true }
);

const FinancialProfileModel = model<IFinancialProfileDocument>("FinancialProfile", financialProfileSchema);
export default FinancialProfileModel;
