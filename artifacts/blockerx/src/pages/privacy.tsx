export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-16">
      <div className="max-w-2xl w-full space-y-8">
        <div>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </a>
        </div>
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm">Last updated: June 2025</p>
        </div>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">1. What we collect</h2>
            <p>
              When you sign in with Discord, we collect your Discord user ID, username, and avatar URL.
              We store bot files you upload, environment variables you set, deployment logs, and usage
              data for the AI assistant feature.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">2. How we use it</h2>
            <p>
              Your data is used solely to operate the platform: running your bots, storing your files,
              and providing the services you request. We do not sell your data to third parties.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">3. File storage</h2>
            <p>
              Bot files are stored in Cloudflare R2 object storage, scoped to your account. Only you
              and collaborators you explicitly invite can access your bot files.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">4. Session data</h2>
            <p>
              We use server-side sessions stored in PostgreSQL to keep you signed in. Sessions expire
              automatically after a period of inactivity.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">5. Data deletion</h2>
            <p>
              You can delete your account and all associated data at any time from the Settings page.
              This permanently removes your bots, files, and personal information.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-foreground">6. Contact</h2>
            <p>
              Questions about this policy? Reach us through the Discord server linked in the dashboard.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
