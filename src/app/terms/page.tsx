import Link from "next/link";

export const metadata = { title: "Terms of Use" };

const H = "mt-6 text-base font-semibold";

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-6 py-10 text-sm leading-relaxed md:max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Terms of Use</h1>
      <p className="text-muted-foreground">Last updated 2026-10-22</p>

      <h2 className={H}>Personal use</h2>
      <p>Jacked AF is for your own personal food and training tracking.</p>

      <h2 className={H}>Not medical advice</h2>
      <p>
        Calorie, nutrition and goal figures are approximations. They are not
        medical or dietary advice. Talk to a doctor or dietitian before changing
        your diet or training, especially if you have a health condition.
      </p>

      <h2 className={H}>AI estimates can be wrong</h2>
      <p>
        Estimates from meal descriptions and photos come from an AI model and
        can be off by a lot. Check them before you rely on them.
      </p>

      <h2 className={H}>Your account</h2>
      <p>
        You are responsible for your account and your password, and for what you
        log.
      </p>

      <h2 className={H}>Changes and ending the service</h2>
      <p>
        The service may change, or stop, at any time. It is provided as is,
        without warranties. Export your data if you want to keep a copy.
      </p>

      <h2 className={H}>Contact</h2>
      <p>
        <a href="mailto:kris.ilijay.perez@gmail.com" className="underline underline-offset-4">
          kris.ilijay.perez@gmail.com
        </a>
      </p>

      <p className="pt-4">
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
