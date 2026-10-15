import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/authOptions";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "staff" || session?.user?.role === "admin") redirect("/admin");
  redirect("/login");
}
