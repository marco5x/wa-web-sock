import express from "express";
import { sendMessage } from "../controllers/baileys.controller.js";

const router = express.Router();

router.post("/send/:clientId", sendMessage);

export default router;