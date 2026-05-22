import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import FormData from "form-data";
import fs from "fs";
import { PDFParse } from "pdf-parse";

const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

const cleanTitleOption = (title) => String(title)
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^["']|["'],?$/g, "")
    .trim();

const isTitleOption = (title) => {
    if (!title) return false;
    if (/^[{\[\]},]+$/.test(title)) return false;
    if (/^"?titles"?\s*:?\s*\[?$/i.test(title)) return false;
    return /[a-zA-Z]/.test(title);
};

const parseTitleOptions = (content = "") => {
    const cleanedContent = content
        .replace(/```json|```/g, "")
        .replace(/[“”]/g, "\"")
        .replace(/[‘’]/g, "'")
        .trim();

    const toTitles = (titles) => titles
        .map(cleanTitleOption)
        .filter(isTitleOption)
        .slice(0, 8);

    try {
        const parsed = JSON.parse(cleanedContent);
        const titles = Array.isArray(parsed) ? parsed : parsed.titles;
        if (Array.isArray(titles)) {
            return toTitles(titles);
        }
    } catch {
        // Fall back to parsing plain text below.
    }

    const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            const titles = Array.isArray(parsed) ? parsed : parsed.titles;
            if (Array.isArray(titles)) {
                return toTitles(titles);
            }
        } catch {
            // Continue to looser parsing.
        }
    }

    const quotedTitles = [...cleanedContent.matchAll(/"([^"]+)"/g)]
        .map((match) => match[1])
        .filter((title) => title.toLowerCase() !== "titles");

    if (quotedTitles.length > 1) {
        return toTitles(quotedTitles);
    }

    const numberedTitles = [...cleanedContent.matchAll(/(?:^|\s)(?:\d{1,2}[.)]\s+)(.*?)(?=(?:\s\d{1,2}[.)]\s+)|$)/gs)]
        .map((match) => match[1].trim())
        .filter(Boolean);

    if (numberedTitles.length > 1) {
        return numberedTitles.slice(0, 8);
    }

    return cleanedContent
        .split(/\r?\n/)
        .map(cleanTitleOption)
        .filter(isTitleOption)
        .slice(0, 8);
};

export const generatArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;
        const maxTokens = Math.min(Math.max(Number(length) || 1200, 800), 4000);
        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "You have reached your free usage limit." });
        }
        const response = await AI.chat.completions.create({
            model: "gemini-3.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: maxTokens,
        });

        const content = response.choices[0].message.content;

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},${prompt},${content}, 'article')`;

        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { free_usage: free_usage + 1 }
            });
        }

        res.json({ success: true, content });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const generateBlogTitle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { keyword, category } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;
        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "You have reached your free usage limit." });
        }
        const prompt = `Generate exactly 8 distinct, catchy blog title options for the keyword "${keyword}" in the ${category} category. Return valid JSON only in this format: {"titles":["title 1","title 2","title 3","title 4","title 5","title 6","title 7","title 8"]}`;
        const response = await AI.chat.completions.create({
            model: "gemini-3.5-flash",
            messages: [
                {
                    role: "system",
                    content: "You generate blog title options. Always return valid JSON only with a titles array containing exactly 8 complete title strings.",
                },
                { role: "user", content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 500,
        });

        const content = response.choices[0].message.content || "";
        const titles = parseTitleOptions(content);

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},${prompt},${content}, 'blog-title')`;

        if (plan !== "premium") {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: { free_usage: free_usage + 1 }
            });
        }

        res.json({ success: true, content, titles });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
};

export const generateImage = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, publish } = req.body;
        const plan = req.plan;

        if (plan !== "premium") {
            return res.json({ success: false, message: "This feature is only available to premium users." });
        }

        if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
            return res.status(400).json({ success: false, message: "Prompt is required." });
        }

        if (!process.env.CLIPDROP_API_KEY) {
            return res.status(500).json({ success: false, message: "CLIPDROP_API_KEY is missing." });
        }

        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.status(500).json({ success: false, message: "Cloudinary credentials are missing." });
        }

        const formData = new FormData();
        formData.append("prompt", prompt.trim());

        let response;
        try {
            response = await axios.post("https://clipdrop-api.co/text-to-image/v1", formData, {
                headers: {
                    "x-api-key": process.env.CLIPDROP_API_KEY,
                    ...formData.getHeaders()
                },
                responseType: "arraybuffer"
            });
        } catch (error) {
            const message = error.response?.data
                ? Buffer.from(error.response.data).toString("utf8")
                : error.message;

            console.log("Clipdrop image generation failed:", message);
            return res.status(error.response?.status || 500).json({
                success: false,
                service: "clipdrop",
                message
            });
        }

        const base64Image = `data:image/png;base64,${Buffer.from(response.data).toString("base64")}`;
        let secure_url;
        try {
            const uploadResult = await cloudinary.uploader.upload(base64Image, {
                folder: "omnix-ai/generated-images"
            });
            secure_url = uploadResult.secure_url;
        } catch (error) {
            const message = error.message || "Cloudinary upload failed.";

            console.log("Cloudinary upload failed:", message);
            return res.status(error.http_code || 500).json({
                success: false,
                service: "cloudinary",
                message
            });
        }

        await sql`INSERT INTO creations (user_id,prompt,content,type,publish) VALUES (${userId},${prompt},${secure_url}, 'image',${publish ?? false})`;

        res.json({ success: true, content: secure_url });
    } catch (error) {
        const message = error.response?.data
            ? Buffer.from(error.response.data).toString("utf8")
            : error.message;

        console.log(message);
        res.status(error.response?.status || 500).json({ success: false, message });
    }
};

export const generatImage = generateImage;

export const removeImageBackground = async (req, res) => {
    try {
        const { userId } = req.auth();
        const image = req.file;
        const plan = req.plan;

        if (plan !== "premium") {
            return res.json({ success: false, message: "This feature is only available to premium users." });
        }

        if (!image) {
            return res.status(400).json({ success: false, message: "Image is required." });
        }

        if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
            return res.status(500).json({ success: false, message: "Cloudinary credentials are missing." });
        }

        const { secure_url } = await cloudinary.uploader.upload(image.path, {
            background_removal: "cloudinary_ai"
        });

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},'Remove background from image',${secure_url}, 'image')`;

        res.json({ success: true, content: secure_url });
    } catch (error) {
        const message = error.response?.data
            ? Buffer.from(error.response.data).toString("utf8")
            : error.message;

        console.log(message);
        res.status(error.response?.status || 500).json({ success: false, message });
    }
};

export const removeImageObject = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { object } = req.body;
        const image = req.file;
        const plan = req.plan;

        if (plan !== "premium") {
            return res.json({ success: false, message: "This feature is only available to premium users." });
        }


        const { public_id } = await cloudinary.uploader.upload(image.path);

        const imageUrl = cloudinary.url(public_id,{
            transformation: [{effect: `gen_romove:${object}`}],
            resource_type: "image"
        })

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},${`Remove ${object} from image`},${imageUrl}, 'image')`;

        res.json({ success: true, content: imageUrl });
    } catch (error) {
        const message = error.response?.data
            ? Buffer.from(error.response.data).toString("utf8")
            : error.message;

        console.log(message);
        res.status(error.response?.status || 500).json({ success: false, message });
    }
};

export const resumeReview = async (req, res) => {
    try {
        const { userId } = req.auth();
        const resume = req.file;
        const plan = req.plan;

        if (plan !== "premium") {
            return res.json({ success: false, message: "This feature is only available to premium users." });
        }

        if (!resume) {
            return res.status(400).json({ success: false, message: "Resume file is required." });
        }

        if(resume.size > 5 * 1024 * 1024){
            return res.json({ success: false, message: "Resume size should be less than 5MB." });
        }

        const dataBuffer = fs.readFileSync(resume.path)
        const parser = new PDFParse({ data: dataBuffer })
        const pdfData = await parser.getText()
        await parser.destroy()

        const prompt = `Review the resume and provide constructive feedback on its strengths,weakness,and areas for imporovement. Resume Content:\n\n${pdfData.text}`

        const response = await AI.chat.completions.create({
            model: "gemini-3.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content = response.choices[0].message.content;
        

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},'Review the uploaded resume',${content}, 'resume-review')`;

        res.json({ success: true, content: content });
    } catch (error) {
        const message = error.response?.data
            ? Buffer.from(error.response.data).toString("utf8")
            : error.message;

        console.log(message);
        res.status(error.response?.status || 500).json({ success: false, message });
    }
}; 
