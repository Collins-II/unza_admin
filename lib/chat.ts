import { getServerSession } from "next-auth";
import mongoose from "mongoose";

import { authOptions } from "@/lib/authOptions";
import { connectToDatabase } from "@/lib/database";
import Conversation from "@/lib/database/models/Conversation";

export type ChatMember = { id: string; name: string; program?: string };

export type ChatConversation = {
  id: string;
  type: "direct" | "group";
  title: string;
  members: ChatMember[];
  lastMessage: { text: string; senderId: string; createdAt: string } | null;
  unread: number;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  deleted: boolean;
};

export const isObjectId = (value: unknown): value is string =>
  typeof value === "string" && mongoose.Types.ObjectId.isValid(value);

export async function getChatUserId() {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

/** Loads a conversation only if the user is a member of it. */
export async function getMemberConversation(conversationId: string, userId: string) {
  if (!isObjectId(conversationId)) return null;
  await connectToDatabase();
  return Conversation.findOne({ _id: conversationId, members: userId });
}
