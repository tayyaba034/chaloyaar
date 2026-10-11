import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AuthForm } from "@/components/auth-form";
import { isAppLocale } from "@/i18n/routing";

export default async function SignInPage({
  params,
}: PageProps<"/[locale]/auth/sign-in">) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  return <AuthForm mode="sign-in" />;
}
