import express from 'express'
import { auth } from '../middlewares/auth.js';
import { generatArticle } from '../controllers/aiController.js';

const aiRouter = express.Router();

aiRouter.post('/generate-article',auth, generatArticle)

export default aiRouter