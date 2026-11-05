import { AuthForm } from "@/components/auth-form";
import { serverConfig } from "@/server/config";
export default function SignIn() {
  return <><h1 className="mb-6 text-3xl font-semibold">Sign in</h1><AuthForm signUp={false} registrationEnabled={serverConfig().registrationEnabled} /></>;
}
