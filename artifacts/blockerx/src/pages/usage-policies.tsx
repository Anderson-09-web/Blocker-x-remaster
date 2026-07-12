export default function UsagePoliciesPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-16">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </a>
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Usage Policies</h1>
          <p className="text-muted-foreground text-sm">Last updated: June 2025</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. Acceptable use</h2>
            <p>
              Blocker X is a platform for hosting Discord bots. You may use it to run bots that comply
              with Discord's Terms of Service and Community Guidelines. Your bots must not harass,
              spam, or harm other users.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. Prohibited activities</h2>
            <p>The following are strictly prohibited:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Distributing malware, scrapers, or raid bots</li>
              <li>Using the platform to send unsolicited mass messages (DM spam)</li>
              <li>Attempting to circumvent rate limits or platform security measures</li>
              <li>Hosting bots that violate Discord's Terms of Service</li>
              <li>Using the AI assistant to generate harmful or illegal content</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. Resource limits</h2>
            <p>
              Free plan bots are subject to scheduled restarts and resource limits. Blocker Plus X bots
              run continuously without forced restarts. Abuse of platform resources may result in
              account suspension.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. AI assistant</h2>
            <p>
              The AI assistant (powered by Groq) is provided as a development aid. Free plan users
              are limited to 5 requests per day. Generated code is your responsibility — review it
              before deploying to production.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Enforcement</h2>
            <p>
              Violations may result in bot suspension, account termination, or a permanent ban.
              We reserve the right to terminate access at any time for violations of these policies.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">6. Contact</h2>
            <p>
              To report abuse or ask questions, reach us through the Discord server linked in the dashboard.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
