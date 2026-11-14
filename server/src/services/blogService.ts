import { BlogPost, IBlogPost } from '../models/blogPostModel';
import { FilterQuery, Types } from 'mongoose';

// Encapsulates core business logic for managing published blog publications.
// Handles post discovery, pagination, category taxonomy aggregation, and reader engagement.
// Operates against the MongoDB blog post collection with projection optimizations.
export class BlogService {
  /**
   * Fetch paginated list of published blog posts.
   */
  // Queries paginated blog posts matching category, tag, search text, or featured flags.
  // Applies dynamic sorting options including popularity, trending metrics, or recency.
  // Omits heavy article body content from listing projections to accelerate client payload speeds.
  async getPosts(params: {
    page?: number;
    limit?: number;
    category?: string;
    tag?: string;
    sort?: string;
    isFeatured?: boolean;
    search?: string;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.max(1, Math.min(100, params.limit || 10));
    const skip = (page - 1) * limit;

    const query: FilterQuery<IBlogPost> = { isPublished: true };

    if (params.category) query.category = params.category;
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
    
    // Sort by search score if searching and no explicit sort provided
    if (params.search && !params.sort) {
      sortOptions.score = { $meta: "textScore" };
    }

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .select('-content') // Don't send full content in list view
        .lean(),
      BlogPost.countDocuments(query),
    ]);

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Fetch a single post by slug and increment views
   */
  // Retrieves a comprehensive blog post record identified by its unique URL slug.
  // Populates related post previews and optionally increments article view counters.
  // Returns the fully populated blog post document or null if no published post matches.
  async getPostBySlug(slug: string, incrementView: boolean = true) {
    const post = await BlogPost.findOne({ slug, isPublished: true })
      .populate('relatedPosts', 'title slug excerpt coverImage category readTime publishedAt author')
      .lean();

    if (!post) {
      return null;
    }

    if (incrementView) {
      await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
    }

    return post;
  }

  /**
   * Get category counts
   */
  // Aggregates published blog articles into distinct category groupings with post counts.
  // Uses an efficient MongoDB aggregation pipeline to compute category frequency distributions.
  // Returns categories sorted in descending order of article volume for navigation filters.
  async getCategories() {
    return BlogPost.aggregate([
      { $match: { isPublished: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $project: { category: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
  }

  /**
   * Toggle like on a blog post
   */
  // Records user engagement by incrementing the like counter for a targeted blog post.
  // Validates post existence before persisting updated interaction statistics.
  // Returns the updated total count of likes recorded for the article.
  async toggleLike(postId: string) {
    const post = await BlogPost.findById(postId);
    if (!post) throw new Error('Post not found');

    post.likes = (post.likes || 0) + 1; // Simplified for MVP (real world: track users who liked)
    await post.save();
    return post.likes;
  }
  
  /**
   * Create a new blog post
   */
  // Persists a newly authored blog post record with automated slug generation.
  // Converts post titles into URL-friendly slugs while resolving slug collision conflicts.
  // Saves and returns the newly instantiated blog post document model.
  async createPost(postData: Partial<IBlogPost>) {
    // Basic slug generation if not provided
    if (!postData.slug && postData.title) {
        postData.slug = postData.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '');
            
        // Handle collisions simply for MVP
        const existing = await BlogPost.findOne({ slug: postData.slug });
        if (existing) {
            postData.slug = `${postData.slug}-${Date.now().toString().slice(-4)}`;
        }
    }
    
    const post = new BlogPost(postData);
    await post.save();
    return post;
  }
}

// Instantiates and exports singleton instance of the blog service class.
// Provides a shared operational service interface across API controller endpoints.
// Avoids repeated instantiation overhead across incoming HTTP request lifecycles.
export const blogService = new BlogService();
