import { ResetPassword } from "@/components/password-recovery";

export const metadata = { referrer: "no-referrer" };
export default function Page() {
  return <><h1 className="mb-6 text-3xl font-semibold">Reset your password</h1><ResetPassword /></>;
}
