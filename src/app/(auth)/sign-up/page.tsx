import { AuthForm } from "@/components/auth-form";
import { serverConfig } from "@/server/config";
export default function SignUp() {
  return <><h1 className="mb-6 text-3xl font-semibold">Create account</h1><AuthForm signUp registrationEnabled={serverConfig().registrationEnabled} /></>;
}
