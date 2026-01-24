// PROJECTS
// MARKETS
export const myProjects = [
  {
    id: 1,
    title: "Will Bitcoin hit $100k by Q4?",
    description: "Bitcoin price prediction market for the end of Q4 2026.",
    subDescription: [
      "Current Volume: $2.4M",
      "End Date: Dec 31, 2026",
      "Resolution Source: Binance/Coinbase Avg",
    ],
    href: "/markets/1",
    logo: "",
    image: "/assets/projects/accessories.jpg", // You might want to update these images later
    tags: [
      {
        id: 1,
        name: "YES 65¢",
        path: "/assets/logos/bitcoin-logo.png",
      },
      {
        id: 2,
        name: "NO 35¢",
        path: "/assets/logos/usdc-logo.png", // Assuming USDC logo or similar
      },
    ],
  },
  {
    id: 2,
    title: "Solana to flip Ethereum market cap in 2026?",
    description: "Market prediction on whether Solana's market cap will exceed Ethereum's at any point in 2026.",
    subDescription: [
      "Current Volume: $850K",
      "End Date: Dec 31, 2026",
      "Resolution Source: CoinGecko",
    ],
    href: "/markets/2",
    logo: "",
    image: "/assets/projects/tabb.png",
    tags: [
      {
        id: 1,
        name: "YES 12¢",
        path: "/assets/logos/solana-logo.png",
      },
      {
        id: 2,
        name: "NO 88¢",
        path: "/assets/logos/ethereum-logo.png",
      },
    ],
  },
  {
    id: 3,
    title: "Will SpaceX launch Starship to Mars in 2026?",
    description: "Space exploration market focusing on the first successful Mars cargo mission.",
    subDescription: [
      "Current Volume: $1.2M",
      "End Date: Dec 31, 2026",
      "Resolution Source: Official SpaceX Announcements",
    ],
    href: "/markets/3",
    logo: "",
    image: "/assets/projects/moonstone.png",
    tags: [
      {
        id: 1,
        name: "YES 40¢",
        path: "/assets/logos/stellar-logo.png",
      },
      {
        id: 2,
        name: "NO 60¢",
        path: "/assets/logos/usdc-logo.png",
      },
    ],
  },
];

// SOCIALS
export const mySocials = [
  {
    name: "Github",
    href: "https://github.com/rohan911438/Oryn-Finance",
    icon: "/assets/logos/github.png",
  },
  {
    name: "Linkedin",
    href: "",
    icon: "/assets/socials/linkedIn.svg",
  },
  {
    name: "Instagram",
    href: "",
    icon: "/assets/socials/instagram.svg",
  },
];

// WORK EXPERIENCE

export const experiences = [
  {
    title: "Total Volume",
    job: "$12,450,000+",
    date: "All Time",
    contents: [
      "Total value locked and traded across all Oryn prediction markets since inception.",
      "Consistently growing liquidity ensuring seamless entry and exit for traders.",
    ],
  },
  {
    title: "Active Markets",
    job: "48",
    date: "Live Now",
    contents: [
      "Diverse range of markets including Crypto, Sports, Politics, and Tech.",
      "Real-time trading opportunities with competitive spreads and deep depth.",
    ],
  },
  {
    title: "Resolved Markets",
    job: "1,200+",
    date: "Completed",
    contents: [
      "Successfully resolved markets with 100% oracle accuracy and transparency.",
      "Reliable payouts processed instantly via Stellar smart contracts.",
    ],
  },
];
