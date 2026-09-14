export function PathGuideArt({
  kind,
}: {
  kind: "obstacle" | "gate" | "booster" | "coin" | "fork" | "rail";
}) {
  return (
    <svg viewBox="0 0 160 88" aria-hidden="true" focusable="false">
      <path d="m30 88 39-72h23l39 72" fill="#809384" opacity=".18" />
      <path d="m56 88 18-72m30 72L87 16" stroke="#b6d6ba" opacity=".12" />
      {kind === "fork" && (
        <>
          <path
            d="M80 84V57Q80 38 34 20M80 57Q80 38 126 20"
            fill="none"
            stroke="#dfc88f"
            strokeWidth="15"
          />
          <path d="m42 14-14 3 9 13m81-16 14 3-9 13" fill="none" stroke="#91d5b6" strokeWidth="5" />
          <rect x="64" y="21" width="32" height="20" rx="3" fill="#bb6260" />
          <path d="m72 24 16 14m0-14-16 14" stroke="#ffe2b1" strokeWidth="3" />
        </>
      )}
      {kind === "rail" && (
        <>
          <path
            d="m37 87 26-68m54 68L96 19M31 78h92M37 65h82M45 51h68M51 38h56"
            fill="none"
            stroke="#bbad87"
            strokeWidth="3"
          />
          <rect x="58" y="16" width="44" height="36" rx="8" fill="#a2d7ca" />
          <path d="m69 17-7-8m29 8 8-8M70 39h20" fill="none" stroke="#2b605b" strokeWidth="3" />
          <path d="M48 45h64l-7 29H55Z" fill="#d5a65d" stroke="#725c47" strokeWidth="3" />
          <circle cx="61" cy="77" r="6" fill="#284e4c" />
          <circle cx="99" cy="77" r="6" fill="#284e4c" />
          <path d="M70 56h20m-20 7h13" stroke="#fff1bd" strokeWidth="3" />
        </>
      )}
      {kind === "obstacle" && (
        <>
          <path d="m18 70 9-8h56l-8 8Z" fill="#fff0dd" />
          <path d="M18 70h57v16H18Z" fill="#b58982" />
          <path d="m75 70 8-8v16l-8 8Z" fill="#733e50" />
          <rect
            x="20"
            y="38"
            width="53"
            height="33"
            rx="3"
            fill="#f0d9cc"
            stroke="#a65761"
            strokeWidth="3"
          />
          <path
            d="M28 47h32m-32 8h23m-23 8h31"
            stroke="#733e50"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M96 76V23h39v53" stroke="#a65761" strokeWidth="7" fill="none" />
          <rect
            x="91"
            y="21"
            width="49"
            height="23"
            rx="3"
            fill="#f0d9cc"
            stroke="#a65761"
            strokeWidth="3"
          />
          <path d="M101 30h29m-29 7h21" stroke="#733e50" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === "gate" && (
        <>
          <path d="M50 79V36a30 30 0 0 1 60 0v43" fill="#92c5b6" stroke="#b9f4d0" strokeWidth="6" />
          <path d="M54 60 69 43 84 61 97 41 106 58v21H54Z" fill="#367a65" />
          <path d="m69 79 11-22 12 22" fill="#ebd9a8" />
          <circle cx="86" cy="32" r="7" fill="#ffe3a1" />
          <path
            d="M80 75V59m-6 6 6-6 6 6"
            stroke="#f3fff5"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {kind === "booster" && (
        <>
          <ellipse cx="80" cy="79" rx="23" ry="4" fill="#041a16" opacity=".5" />
          <path
            d="m80 10 23 14v28L80 66 57 52V24Z"
            fill="#85e0ce"
            stroke="#d6fff0"
            strokeWidth="3"
          />
          <path d="M74 26h12v7h7v12h-7v7H74v-7h-7V33h7Z" fill="#247b70" />
          <path d="m118 15 3 6 7 2-7 2-3 6-2-6-7-2 7-2Z" fill="#f2dc99" />
        </>
      )}
      {kind === "coin" && (
        <>
          <path d="m103 12 9 4 4 10-4 9-9 4-9-4-4-9 4-10Z" fill="#e9b34e" />
          <path d="M103 19v13" stroke="#fff2ae" strokeWidth="3" />
          <path d="m82 31 12 5 5 12-5 12-12 5-12-5-5-12 5-12Z" fill="#f4c15b" />
          <path d="M82 39v18" stroke="#fff2ae" strokeWidth="4" />
          <path d="m56 47 16 7 7 16-7 16H40l-7-16 7-16Z" fill="#ffcf68" />
          <path d="M56 57v21" stroke="#fff2ae" strokeWidth="5" />
        </>
      )}
    </svg>
  );
}
