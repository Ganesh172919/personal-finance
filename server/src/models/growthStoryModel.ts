import mongoose, { Document, Schema } from 'mongoose';

export interface IGrowthStory extends Document {
  title: string;
  slug: string;
  persona: string;
  location: string;
  summary: string;
  challenge: string;
  journey: string;
  outcome: string;
  timeline: string;
  financialMetrics: {
    startingNetWorth: number;
    currentNetWorth: number;
    monthlyIncome: number;
    savingsRate: number;
    debtPaidOff: number;
    investmentReturns: number;
  };
  strategies: string[];
  tags: string[];
  category: 'debt-freedom' | 'wealth-building' | 'early-retirement' | 'side-hustle' | 'tax-optimization' | 'family-finance' | 'student-finance';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  isVerified: boolean;
  isFeatured: boolean;
  isPublished: boolean;
  coverImage: string;
  likes: number;
  views: number;
  readTime: number;
  userId?: mongoose.Types.ObjectId; // Link to user creating their own story
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const growthStorySchema = new Schema<IGrowthStory>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    persona: { type: String, required: true },
    location: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 200 },
    challenge: { type: String, required: true },
    journey: { type: String, required: true }, // Markdown content
    outcome: { type: String, required: true },
    timeline: { type: String, required: true },
    financialMetrics: {
      startingNetWorth: { type: Number, default: 0 },
      currentNetWorth: { type: Number, default: 0 },
      monthlyIncome: { type: Number, default: 0 },
      savingsRate: { type: Number, default: 0 },
      debtPaidOff: { type: Number, default: 0 },
      investmentReturns: { type: Number, default: 0 },
    },
    strategies: [{ type: String }],
    tags: [{ type: String }],
    category: {
      type: String,
      required: true,
      enum: [
        'debt-freedom',
        'wealth-building',
        'early-retirement',
        'side-hustle',
        'tax-optimization',
        'family-finance',
        'student-finance',
      ],
    },
    difficulty: {
      type: String,
      required: true,
      enum: ['beginner', 'intermediate', 'advanced'],
    },
    isVerified: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    coverImage: { type: String, required: true },
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    readTime: { type: Number, required: true, default: 5 },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Indexes
growthStorySchema.index({ category: 1 });
growthStorySchema.index({ difficulty: 1 });
growthStorySchema.index({ tags: 1 });
growthStorySchema.index({ isPublished: 1, publishedAt: -1 });
growthStorySchema.index({ title: 'text', summary: 'text', challenge: 'text', tags: 'text' });

export const GrowthStory = mongoose.model<IGrowthStory>('GrowthStory', growthStorySchema);
