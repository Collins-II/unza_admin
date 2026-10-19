import { NextResponse } from "next/server";

import { requireAdminRole } from "@/lib/adminAuth";
import { connectToDatabase } from "@/lib/database";
import Announcement from "@/lib/database/models/Announcement";
import Notification from "@/lib/database/models/Notification";
import User from "@/lib/database/models/User";

export async function POST(request: Request) {
  const access = await requireAdminRole();
  if (access.response) return access.response;
  try {
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const priority = ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal";
    if (!title || !message) return NextResponse.json({ error: "Title and message are required." }, { status: 400 });

    await connectToDatabase();
    const audience = ["all", "students", "staff"].includes(body.audience) ? body.audience : "all";
    const roles = audience === "students" ? ["student"] : audience === "staff" ? ["staff", "admin"] : ["student", "staff", "admin"];
    await Announcement.create({ title, message, priority, audience, publishedBy: access.session?.user.id });
    const recipients = await User.find({ role: { $in: roles }, status: "active" }).select("_id").lean();
    if (recipients.length > 0) {
      await Notification.insertMany(recipients.map((recipient) => ({
        user: recipient._id,
        type: "system_announcement",
        priority,
        title,
        message,
        actionLabel: "View announcement",
      })));
    }
    return NextResponse.json({ sent: recipients.length, title, message }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to publish announcement." }, { status: 500 });
  }
}
