import express from 'express'
import { auth } from '../middlewares/auth.js';
import { generatArticle, generateBlogTitle, generateImage } from '../controllers/aiController.js';

const aiRouter = express.Router();

aiRouter.post('/generate-article',auth, generatArticle)
aiRouter.post('/generate-blog-title',auth, generateBlogTitle)
aiRouter.post('/generate-image',auth, generateImage)

export default aiRouter
