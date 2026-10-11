import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import { isAppLocale } from "@/i18n/routing";

export default async function SignUpPage({
  params,
}: PageProps<"/[locale]/auth/sign-up">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <AuthForm mode="sign-up" />;
}
