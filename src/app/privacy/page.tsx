import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

const H = "mt-6 text-base font-semibold";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-3 px-6 py-10 text-sm leading-relaxed md:max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated 2026-10-22</p>
      <p>
        Jacked AF is a personal food and training log. This explains what it
        keeps about you and who handles it. It is written with Canadian privacy
        law (PIPEDA) in mind.
      </p>

      <h2 className={H}>What we keep</h2>
      <p>
        Your email address, used to sign you in. The things you log: food
        entries, foods and recipes you save, workouts and sets, weigh-ins, and
        your goals and settings.
      </p>
      <p>
        If you set up an automation on your phone to send health data, such as
        step counts, we keep what it sends. That is optional and off unless you
        set it up.
      </p>

      <h2 className={H}>Who handles it</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Supabase stores your account and data in its database.</li>
        <li>Vercel hosts the app.</li>
        <li>
          OpenAI receives what you ask it to estimate: the meal description you
          type, and a meal or food-label photo if you attach one. The photo is
          used for that estimate only. The app does not save it.
        </li>
        <li>
          Health Canada&apos;s Canadian Nutrient File is queried for food data.
          We download its food list and request foods by ID, so nothing about you
          is sent.
        </li>
        <li>
          Open Food Facts receives the barcode you scan or the text you search
          for, with no account details.
        </li>
      </ul>
      <p>
        Each of these providers handles data under its own policy, and some
        process it outside Canada.
      </p>

      <h2 className={H}>Cookies</h2>
      <p>
        Only three kinds: your sign-in session, your time zone, and a marker for
        a workout you have open. There are no analytics, ads or tracking.
      </p>

      <h2 className={H}>Your choices</h2>
      <p>
        You can export your data and delete your account from the Profile tab.
        Deleting your account removes your data. You can also ask to see or
        correct what we hold by writing to us.
      </p>

      <h2 className={H}>Contact</h2>
      <p>
        <a href="mailto:kris.ilijay.perez@gmail.com" className="underline underline-offset-4">
          kris.ilijay.perez@gmail.com
        </a>
      </p>

      <p className="pt-4">
        <Link href="/terms" className="underline underline-offset-4">
          Terms of Use
        </Link>
      </p>
    </main>
  );
}
