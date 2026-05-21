import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import FormData from "form-data";

const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generatArticle = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;
        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "You have reached your free usage limit." });
        }
        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: length,
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
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;
        if (plan !== "premium" && free_usage >= 10) {
            return res.json({ success: false, message: "You have reached your free usage limit." });
        }
        const response = await AI.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 100,
        });

        const content = response.choices[0].message.content;

        await sql`INSERT INTO creations (user_id,prompt,content,type) VALUES (${userId},${prompt},${content}, 'blog-title')`;

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
