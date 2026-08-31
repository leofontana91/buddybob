import Image from "next/image";
import Link from "next/link";

type Variant = "dark" | "light" | "mark";

const WORDMARK = {
  dark: "/brand/bob-wordmark-white.png",
  light: "/brand/bob-wordmark.png",
} as const;

/** Logo BOB: marchio + wordmark (design Giornata). */
export function BrandLogo({
  variant = "dark",
  href,
  className = "",
  markClassName = "h-10 w-auto",
  wordmarkClassName = "h-4 w-auto",
  showWordmark = true,
}: {
  variant?: Variant;
  href?: string;
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
}) {
  const inner = (
    <span
      className={`inline-flex shrink-0 items-center gap-[11px] self-start ${className}`}
    >
      <Image
        src="/brand/bob-mark.png"
        alt=""
        width={40}
        height={56}
        className={markClassName}
        priority
      />
      {showWordmark ? (
        <Image
          src={WORDMARK[variant === "mark" ? "dark" : variant]}
          alt="BOB"
          width={72}
          height={16}
          className={`${wordmarkClassName} ${variant === "mark" ? "hidden" : ""}`}
          priority
        />
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex shrink-0 self-start">
        {inner}
      </Link>
    );
  }
  return inner;
}
