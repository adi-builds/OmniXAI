import express from 'express'
import multer from 'multer';
import { auth } from '../middlewares/auth.js';
import { generatArticle, generateBlogTitle, generateImage, removeImageBackground, removeImageObject, resumeReview } from '../controllers/aiController.js';

const aiRouter = express.Router();
const upload = multer({ dest: 'uploads/' });

aiRouter.post('/generate-article',auth, generatArticle)
aiRouter.post('/generate-blog-title',auth, generateBlogTitle)
aiRouter.post('/generate-image',auth, generateImage)
aiRouter.post('/reove-image-background',upload.single('image'),auth,removeImageBackground)
aiRouter.post('/reove-image-object',upload.single('image'),auth,removeImageObject)
aiRouter.post('/resume-review',upload.single('resume'),auth,resumeReview)

export default aiRouter
