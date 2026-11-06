import { ForgotPassword } from "@/components/password-recovery";
import { passwordEmailConfig } from "@/server/password-email";

export default function Page() {
  return <><h1 className="mb-6 text-3xl font-semibold">Forgot your password?</h1><ForgotPassword enabled={!!passwordEmailConfig()} /></>;
}
