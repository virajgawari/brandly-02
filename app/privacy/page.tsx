import type { Metadata } from "next";
import LegalPage from "@/components/auth/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="19 November 2026">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Your account: email address, name and password (stored hashed by our sign-in provider).</li>
          <li>Your brand: website and social links you give us, the brand profile we build from them, logos, product and brand photos, and the posts you create.</li>
          <li>How you use Brandly: edits, ratings and post metrics you enter, so we can show what works.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <ul>
          <li>To build your brand profile and generate posts, images and ideas for you.</li>
          <li>To publish or schedule posts to the channels you connect.</li>
          <li>To keep the service safe and working, including cost and error logs.</li>
        </ul>
      </section>
      <section>
        <h2>AI providers and other services</h2>
        <p>
          To generate content we send the relevant parts of your brand profile and prompts to AI model providers, and we use a database and
          hosting provider to store your data and a publishing service to post on your behalf. They process data only to provide those
          services to us.
        </p>
      </section>
      <section>
        <h2>Improving the AI (your choice)</h2>
        <p>
          At sign-up you can allow your edits and ratings to be used to improve Brandly&apos;s AI. It is off unless you tick it, and you can
          change it any time from the account menu. Turning it off stops future use.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You can edit your brand data in the app and delete a brand, which removes its posts and photos. To get a copy of your data or have
          your account deleted, contact us and we will do it. You may also withdraw consent at any time.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>Contact details to be added before launch.</p>
      </section>
    </LegalPage>
  );
}
