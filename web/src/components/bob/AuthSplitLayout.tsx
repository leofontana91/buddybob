import { BrandLogo } from "@/components/bob/BrandLogo";
import { RobotPresence } from "@/components/bob/RobotPresence";

/** Split scuro/chiaro come login (redesign Giornata). */
export function AuthSplitLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2">
      <section className="relative flex flex-col overflow-hidden bg-[var(--bob-ink)] px-10 py-14 lg:px-14">
        <BrandLogo variant="dark" wordmarkClassName="h-5 w-auto" />
        <h1 className="mt-auto max-w-[460px] font-[family-name:var(--font-poppins)] text-[clamp(32px,4vw,44px)] font-semibold leading-[1.12] tracking-[-0.035em] text-white">
          I tuoi robot,
          <br />
          la tua giornata,
          <br />
          una sola schermata.
        </h1>
        <p className="mt-[18px] max-w-[400px] text-[15px] leading-relaxed text-[var(--bob-muted-2)]">
          Accogli, accompagna e parla con i visitatori. BOB fa il lavoro
          operativo, tu vedi tutto da qui.
        </p>
        <div className="relative mt-10 flex h-[250px] items-end justify-center lg:mt-auto">
          <RobotPresence state="idle" size={200} />
        </div>
      </section>

      <section className="flex flex-col justify-center bg-white px-8 py-14 sm:px-14">
        <p className="bob-eyebrow">{eyebrow}</p>
        <h2 className="mt-3 font-[family-name:var(--font-poppins)] text-[34px] font-semibold tracking-[-0.03em]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-2 text-[14.5px] text-[var(--bob-muted)]">{subtitle}</p>
        ) : null}
        {children}
      </section>
    </main>
  );
}
