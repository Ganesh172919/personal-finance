import { GrowthStory, IGrowthStory } from '../models/growthStoryModel';
import { FilterQuery } from 'mongoose';

// Service managing user growth and financial milestone story publications.
// Handles searching, filtering, aggregating categories, and engagement metrics.
// Provides repository operations for public and featured community narratives.
export class GrowthStoryService {
  // Fetches paginated lists of published financial growth stories.
  // Applies dynamic category filters, search terms, and popularity sorts.
  // Excludes long-form narrative bodies to optimize response payload weight.
  async getStories(params: {
    page?: number;
    limit?: number;
    category?: string;
    difficulty?: string;
    tag?: string;
    sort?: string;
    isFeatured?: boolean;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;

    const query: FilterQuery<IGrowthStory> = { isPublished: true };

    if (params.category) query.category = params.category;
    if (params.difficulty) query.difficulty = params.difficulty;
    if (params.tag) query.tags = params.tag;
    if (params.isFeatured !== undefined) query.isFeatured = params.isFeatured;
    if (params.search) {
      query.$text = { $search: params.search };
    }

    const sortOptions: any = {};
    switch (params.sort) {
      case 'popular':
        sortOptions.views = -1;
        sortOptions.publishedAt = -1;
        break;
      case 'trending':
        sortOptions.likes = -1;
        sortOptions.publishedAt = -1;
        break;
      case 'newest':
      default:
        sortOptions.publishedAt = -1;
        break;
    }

    if (params.search && !params.sort) {
      sortOptions.score = { $meta: "textScore" };
    }


    const [stories, total] = await Promise.all([
      GrowthStory.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('-journey') // Exclude the long markdown content for lists
        .lean(),
      GrowthStory.countDocuments(query),
    ]);

    return {
      stories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  // Retrieves a single growth story using its unique URL-friendly slug.
  // Optionally increments total views counter asynchronously upon retrieval.
  // Returns the full story document including detailed markdown journey notes.
  async getStoryBySlug(slug: string, incrementView: boolean = true) {
    const story = await GrowthStory.findOne({ slug, isPublished: true }).lean();

    if (!story) return null;

    if (incrementView) {
      await GrowthStory.updateOne({ _id: story._id }, { $inc: { views: 1 } });
    }

    return story;
  }

  // Aggregates story counts categorized by financial growth topic.
  // Computes distribution metrics across active published stories.
  // Returns sorted category summaries for catalog navigation interfaces.
  async getCategories() {
    return GrowthStory.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $project: { category: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
  }

  // Increments the positive engagement like count for a growth story.
  // Validates story existence and persists updated counts to the database.
  // Returns the updated total number of likes received by the story.
  async toggleLike(storyId: string) {
    const story = await GrowthStory.findById(storyId);
    if (!story) throw new Error('Story not found');

    story.likes = (story.likes || 0) + 1; 
    await story.save();
    return story.likes;
  }
  
  // Creates and persists a new growth story document in the database.
  // Generates unique URL slugs from story titles with collision avoidance.
  // Saves validated data attributes and returns the newly created model.
  async createStory(storyData: Partial<IGrowthStory>) {
      if (!storyData.slug && storyData.title) {
          storyData.slug = storyData.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '');
              
          const existing = await GrowthStory.findOne({ slug: storyData.slug });
          if (existing) {
              storyData.slug = `${storyData.slug}-${Date.now().toString().slice(-4)}`;
          }
      }
      
      const story = new GrowthStory(storyData);
      await story.save();
      return story;
  }
}

// Singleton instance of the growth story management service.
// Shared across HTTP controllers for content query and moderation workflows.
// Encapsulates database operations for the growth stories platform feature.
export const growthStoryService = new GrowthStoryService();
