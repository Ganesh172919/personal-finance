import { Router } from 'express';
import { blogController } from '../controllers/blogController';
import { optionalJwtAuth } from '../middleware/optionalJwtAuth';

const router = Router();

// Public routes
router.get('/', blogController.getPosts);
router.get('/featured', blogController.getFeaturedPosts);
router.get('/categories', blogController.getCategories);
router.get('/:slug', blogController.getPostBySlug);

// Protected routes
router.post('/', optionalJwtAuth, blogController.createPost);
router.post('/:id/like', optionalJwtAuth, blogController.toggleLike);

export default router;
