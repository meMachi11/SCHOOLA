import SchoolApp from "../components/school-app";
import { activateDemoLogins } from "../lib/school/demo-logins";
export const dynamic = "force-dynamic";
export default async function Home() {
  await activateDemoLogins();
  return <SchoolApp />;
}
