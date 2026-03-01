import mongoose, { Document, Schema } from 'mongoose';

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: 'investing' | 'budgeting' | 'tax-planning' | 'debt-management' | 'retirement' | 'insurance' | 'real-estate' | 'market-news' | 'personal-growth';
  tags: string[];
  coverImage: string;
  author: {
    name: string;
    avatar: string;
    bio: string;
  };
  readTime: number;
  likes: number;
  views: number;
  isFeatured: boolean;
  isPublished: boolean;
  publishedAt: Date;
  userId?: mongoose.Types.ObjectId; // Link to the user who created it
  relatedPosts: mongoose.Types.ObjectId[];
  seoMeta: {
    metaTitle: string;
    metaDescription: string;
    keywords: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: { type: String, required: true, maxlength: 300 },
    content: { type: String, required: true },
    category: {
      type: String,
      required: true,
      enum: [
        'investing',
        'budgeting',
        'tax-planning',
        'debt-management',
        'retirement',
        'insurance',
        'real-estate',
        'market-news',
        'personal-growth',
      ],
    },
    tags: [{ type: String }],
    coverImage: { type: String, required: true },
    author: {
      name: { type: String, required: true },
      avatar: { type: String, required: true },
      bio: { type: String, required: true },
    },
    readTime: { type: Number, required: true, default: 5 },
    likes: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: true },
    publishedAt: { type: Date, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    relatedPosts: [{ type: Schema.Types.ObjectId, ref: 'BlogPost' }],
    seoMeta: {
      metaTitle: { type: String },
      metaDescription: { type: String },
      keywords: [{ type: String }],
    },
  },
  { timestamps: true }
);

// Indexes
blogPostSchema.index({ category: 1 });
blogPostSchema.index({ tags: 1 });
blogPostSchema.index({ isPublished: 1, publishedAt: -1 });
blogPostSchema.index({ title: 'text', content: 'text', tags: 'text' }); // Full-text search

export const BlogPost = mongoose.model<IBlogPost>('BlogPost', blogPostSchema);
