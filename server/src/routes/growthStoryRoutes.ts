import { Router } from 'express';
import { growthStoryController } from '../controllers/growthStoryController';
import { optionalJwtAuth } from '../middleware/optionalJwtAuth';

const router = Router();

// Public routes
router.get('/', growthStoryController.getStories);
router.get('/featured', growthStoryController.getFeaturedStories);
router.get('/categories', growthStoryController.getCategories);
router.get('/:slug', growthStoryController.getStoryBySlug);

// Protected routes
router.post('/', optionalJwtAuth, growthStoryController.createStory);
router.post('/:id/like', optionalJwtAuth, growthStoryController.toggleLike);

export default router;
